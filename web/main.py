import os
import shutil
import uuid
import logging
from contextlib import asynccontextmanager
from datetime import datetime
from typing import Dict, Optional
from zoneinfo import ZoneInfo

from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles

from web.ir_controller import IRController
from web.models import IRCommand, Timer, migrate
from web.runner import IRRunner
from web.scheduler import TimerScheduler
from web.store import ConfigStore

logger = logging.getLogger(__name__)

WEB_DIR = os.path.dirname(__file__)
TZ = ZoneInfo("Asia/Tokyo")


def setup_logging():
    level = os.environ.get("LOG_LEVEL", "INFO").upper()
    formatter = logging.Formatter("%(asctime)s [%(threadName)-12.12s] [%(levelname)-5.5s]  %(message)s")
    handler = logging.StreamHandler()
    handler.setFormatter(formatter)
    root = logging.getLogger()
    root.handlers[:] = [handler]
    root.setLevel(level)
    # APScheduler logs every wakeup at INFO/DEBUG; our own listener reports what matters.
    logging.getLogger("apscheduler").setLevel(logging.WARNING)


def default_config_path() -> str:
    data_dir = os.environ.get("IR_HUB_DATA_DIR", os.path.join(os.path.dirname(WEB_DIR), "data"))
    path = os.path.join(data_dir, "config.json")
    legacy = os.path.join(WEB_DIR, "config.json")
    if not os.path.exists(path) and os.path.isfile(legacy):
        os.makedirs(data_dir, exist_ok=True)
        shutil.copy2(legacy, path)
        logger.info(f"Copied legacy config {legacy} to {path}")
    return path


def create_app(config_path: Optional[str] = None, controller: Optional[IRController] = None,
               run_scheduler: bool = True) -> FastAPI:
    store = ConfigStore(config_path or default_config_path(), migrate=migrate)
    controller = controller or IRController()
    runner = IRRunner(controller, store, now=lambda: datetime.now(TZ))
    scheduler = TimerScheduler(store, runner, TZ)

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        if run_scheduler:
            scheduler.start()
        yield
        if run_scheduler:
            scheduler.shutdown()
        runner.shutdown()

    app = FastAPI(title="IR Remote Controller", lifespan=lifespan)
    app.state.store = store
    app.state.runner = runner
    app.state.scheduler = scheduler

    def ir_call(fn, *args):
        try:
            return runner.call(fn, *args)
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))

    @app.get("/api/config")
    def get_config():
        return store.read()

    @app.post("/api/commands/send/{name}")
    def send_command(name: str):
        cmd_obj = store.read().commands.get(name)
        if not cmd_obj:
            raise HTTPException(status_code=404, detail="Command not found")
        ir_call(controller.send_raw_data, cmd_obj.raw_data)
        return {"status": "success"}

    @app.post("/api/commands/record/start")
    def record_start():
        ir_call(controller.start_recording)
        return {"status": "recording started"}

    @app.post("/api/commands/record/stop")
    def record_stop():
        ir_call(controller.stop_recording)
        return {"status": "recording stopped"}

    @app.get("/api/commands/record/data")
    def get_record_data():
        return {"data": ir_call(controller.get_recorded_data)}

    @app.post("/api/commands")
    def register_command(name: str, raw_data: str, channel: int = 1):
        with store.transaction() as config:
            config.commands[name] = IRCommand(raw_data=raw_data, channel=channel)
        return {"status": "command registered"}

    @app.delete("/api/commands/{name}")
    def delete_command(name: str):
        with store.transaction() as config:
            if name not in config.commands:
                raise HTTPException(status_code=404, detail="Command not found")
            del config.commands[name]
        return {"status": "command deleted"}

    @app.post("/api/timers")
    def add_timer(timer: Timer):
        timer.id = str(uuid.uuid4())
        with store.transaction() as config:
            config.timers.append(timer)
        scheduler.sync()
        return timer

    @app.put("/api/timers/{timer_id}")
    def update_timer(timer_id: str, updated_timer: Timer):
        with store.transaction() as config:
            for i, timer in enumerate(config.timers):
                if timer.id == timer_id:
                    updated_timer.id = timer_id
                    config.timers[i] = updated_timer
                    break
            else:
                raise HTTPException(status_code=404, detail="Timer not found")
        scheduler.sync()
        return updated_timer

    @app.delete("/api/timers/{timer_id}")
    def delete_timer(timer_id: str):
        with store.transaction() as config:
            remaining = [t for t in config.timers if t.id != timer_id]
            if len(remaining) == len(config.timers):
                raise HTTPException(status_code=404, detail="Timer not found")
            config.timers = remaining
        scheduler.sync()
        runner.forget(timer_id)
        return {"status": "timer deleted"}

    @app.post("/api/timers/{timer_id}/execute")
    def execute_timer(timer_id: str):
        if not any(t.id == timer_id for t in store.read().timers):
            raise HTTPException(status_code=404, detail="Timer not found")
        runner.submit_timer(timer_id, "manual")
        return {"status": "execution started"}

    @app.post("/api/mappings")
    def update_mappings(mappings: Dict[str, str]):
        with store.transaction() as config:
            config.mappings = mappings
        return {"status": "mappings updated"}

    # Serve static files last
    static_dir = os.path.join(WEB_DIR, "static")
    if os.path.isdir(static_dir):
        app.mount("/", StaticFiles(directory=static_dir, html=True), name="static")
    return app


def app_factory() -> FastAPI:
    """Entry point for `uvicorn --factory web.main:app_factory`."""
    setup_logging()
    return create_app()
