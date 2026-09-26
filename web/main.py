import os
import shutil
import logging
from contextlib import asynccontextmanager
from datetime import datetime
from typing import List, Optional
from zoneinfo import ZoneInfo

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field, ValidationError

from web import ir_codec
from web.device import device_connected
from web.ir_controller import IRController
from web.models import TIME_PATTERN, Command, Config, Name, Room, Timer, TimerStep, migrate
from web.recording import NoRecording, RecordingSession
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


class RoomIn(BaseModel):
    name: Name
    channel: int = Field(ge=1, le=3)


class NewRoomIn(RoomIn):
    copy_from_room_id: Optional[str] = None


class CommandIn(BaseModel):
    room_id: str
    name: Name
    raw_data: str
    replace: bool = False  # overwrite a command with the same name in the room
    allow_channel_mismatch: bool = False


class CommandPatch(BaseModel):
    name: Name


class DeriveIn(BaseModel):
    room_id: str


class RawIn(BaseModel):
    raw_data: str


class TimerIn(BaseModel):
    name: Name
    time: str = Field(pattern=TIME_PATTERN)
    enabled: bool = True
    steps: List[TimerStep] = Field(min_length=1)


def _conflict(message: str, **extra):
    return HTTPException(status_code=409, detail={"message": message, **extra})


def _check_raw(raw: str):
    try:
        ir_codec.parse_raw(raw)
    except ir_codec.IRDataError as e:
        raise HTTPException(status_code=422, detail=f"Invalid IR data: {e}")


def _derive_into(config: Config, source: Command, room: Room) -> Command:
    """Adds a copy of `source` for `room`, with the code rewritten for its channel."""
    if any(c.room_id == room.id and c.name.casefold() == source.name.casefold() for c in config.commands):
        raise _conflict(f"{room.name} already has a command named {source.name}")
    try:
        raw = ir_codec.derive_raw(source.raw_data, room.channel)
    except ir_codec.NotDerivable as e:
        raise HTTPException(status_code=422, detail=f"{source.name}: {e}")
    cmd = Command(room_id=room.id, name=source.name, raw_data=raw, derived=True)
    config.commands.append(cmd)
    return cmd


def create_app(config_path: Optional[str] = None, controller: Optional[IRController] = None,
               run_scheduler: bool = True, record_timeout: float = 30) -> FastAPI:
    store = ConfigStore(config_path or default_config_path(), migrate=migrate)
    controller = controller or IRController()
    now = lambda: datetime.now(TZ)  # noqa: E731
    runner = IRRunner(controller, store, now=now)
    scheduler = TimerScheduler(store, runner, TZ)
    recording = RecordingSession(runner, now=now, timeout=record_timeout)

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        if run_scheduler:
            scheduler.start()
        yield
        if run_scheduler:
            scheduler.shutdown()
        recording.shutdown()
        runner.shutdown()

    app = FastAPI(title="IR Remote Controller", lifespan=lifespan)
    app.state.store = store
    app.state.runner = runner
    app.state.scheduler = scheduler

    @app.exception_handler(ValidationError)
    async def invalid_config(request: Request, exc: ValidationError):
        # Raised when an edit would leave the config inconsistent; nothing was saved.
        return JSONResponse(status_code=422, content={"detail": "; ".join(e["msg"] for e in exc.errors())})

    def ir_call(fn, *args):
        try:
            return runner.call(fn, *args)
        except Exception as e:
            raise HTTPException(status_code=502, detail=str(e))

    # --- Config & status ---

    @app.get("/api/config")
    def get_config() -> Config:
        return store.read()

    @app.get("/api/status")
    def get_status():
        next_runs = scheduler.next_run_times()
        last = runner.last_results()
        return {
            "now": now(),
            "device_connected": device_connected(),
            "recording": recording.state(),
            "timers": {
                t.id: {"next_run": next_runs.get(t.id), "last_result": last.get(t.id)}
                for t in store.read().timers
            },
        }

    # --- Rooms ---

    @app.post("/api/rooms", status_code=201)
    def add_room(body: NewRoomIn):
        skipped = []
        with store.transaction() as config:
            room = Room(name=body.name, channel=body.channel)
            config.rooms.append(room)
            if body.copy_from_room_id:
                if not config.room(body.copy_from_room_id):
                    raise HTTPException(status_code=404, detail="Room to copy from not found")
                for src in [c for c in config.commands if c.room_id == body.copy_from_room_id]:
                    if ir_codec.light_channel(src.raw_data) is None:
                        skipped.append(src.name)
                    else:
                        _derive_into(config, src, room)
        return {"room": room, "skipped": skipped}

    @app.put("/api/rooms/{room_id}")
    def update_room(room_id: str, body: RoomIn):
        not_rewritten = []
        with store.transaction() as config:
            room = config.room(room_id)
            if not room:
                raise HTTPException(status_code=404, detail="Room not found")
            if body.channel != room.channel:
                # The channel lives in each code, so re-target every code we understand.
                for cmd in config.commands:
                    if cmd.room_id != room_id:
                        continue
                    try:
                        cmd.raw_data = ir_codec.derive_raw(cmd.raw_data, body.channel)
                    except ir_codec.NotDerivable:
                        not_rewritten.append(cmd.name)
            room.name, room.channel = body.name, body.channel
        return {"room": room, "not_rewritten": not_rewritten}

    @app.delete("/api/rooms/{room_id}")
    def delete_room(room_id: str):
        with store.transaction() as config:
            if not config.room(room_id):
                raise HTTPException(status_code=404, detail="Room not found")
            count = sum(c.room_id == room_id for c in config.commands)
            if count:
                raise _conflict(f"Room still has {count} command(s); delete them first")
            config.rooms = [r for r in config.rooms if r.id != room_id]
        return {"status": "room deleted"}

    # --- Commands ---

    @app.post("/api/commands", status_code=201)
    def add_command(body: CommandIn):
        _check_raw(body.raw_data)
        with store.transaction() as config:
            room = config.room(body.room_id)
            if not room:
                raise HTTPException(status_code=404, detail="Room not found")
            detected = ir_codec.light_channel(body.raw_data)
            if detected is not None and detected != room.channel and not body.allow_channel_mismatch:
                raise _conflict(
                    f"This code is for CH{detected}, but {room.name} is on CH{room.channel}",
                    code="channel_mismatch", detected_channel=detected)
            existing = next((c for c in config.commands
                             if c.room_id == room.id and c.name.casefold() == body.name.casefold()), None)
            if existing and not body.replace:
                raise _conflict(f"{room.name} already has a command named {existing.name}", code="exists")
            if existing:
                # Keep the id so timer steps keep pointing at it.
                existing.name, existing.raw_data, existing.derived = body.name, body.raw_data.strip(), False
                cmd = existing
            else:
                cmd = Command(room_id=room.id, name=body.name, raw_data=body.raw_data)
                config.commands.append(cmd)
        return cmd

    @app.patch("/api/commands/{command_id}")
    def rename_command(command_id: str, body: CommandPatch):
        with store.transaction() as config:
            cmd = config.command(command_id)
            if not cmd:
                raise HTTPException(status_code=404, detail="Command not found")
            cmd.name = body.name
        return cmd

    @app.delete("/api/commands/{command_id}")
    def delete_command(command_id: str):
        with store.transaction() as config:
            if not config.command(command_id):
                raise HTTPException(status_code=404, detail="Command not found")
            users = config.timers_using([command_id])
            if users:
                raise _conflict("Command is used by timers", timers=[t.name for t in users])
            config.commands = [c for c in config.commands if c.id != command_id]
        return {"status": "command deleted"}

    @app.post("/api/commands/{command_id}/send")
    def send_command(command_id: str):
        cmd = store.read().command(command_id)
        if not cmd:
            raise HTTPException(status_code=404, detail="Command not found")
        ir_call(controller.send_raw_data, cmd.raw_data)
        return {"status": "sent"}

    @app.post("/api/commands/{command_id}/derive", status_code=201)
    def derive_command(command_id: str, body: DeriveIn):
        with store.transaction() as config:
            src = config.command(command_id)
            room = config.room(body.room_id)
            if not src or not room:
                raise HTTPException(status_code=404, detail="Command or room not found")
            cmd = _derive_into(config, src, room)
        return cmd

    # --- Raw IR ---

    @app.post("/api/ir/send")
    def send_raw(body: RawIn):
        _check_raw(body.raw_data)
        ir_call(controller.send_raw_data, body.raw_data)
        return {"status": "sent"}

    @app.post("/api/ir/describe")
    def describe_raw(body: RawIn):
        _check_raw(body.raw_data)
        return ir_codec.describe(body.raw_data)

    # --- Recording ---

    @app.get("/api/record")
    def record_state():
        return recording.state()

    @app.post("/api/record/start")
    def record_start():
        try:
            return recording.start()
        except Exception as e:
            raise HTTPException(status_code=502, detail=str(e))

    @app.post("/api/record/stop")
    def record_stop():
        try:
            result = recording.stop()
        except NoRecording:
            raise _conflict("No recording in progress (it may have timed out)", code="not_recording")
        except Exception as e:
            raise HTTPException(status_code=502, detail=str(e))
        if not result["raw_data"]:
            raise HTTPException(status_code=422, detail="Nothing was captured; press the button while recording")
        try:
            result["decoded"] = ir_codec.describe(result["raw_data"])
        except ir_codec.IRDataError as e:
            raise HTTPException(status_code=422, detail=f"Captured data is not valid: {e}")
        return result

    # --- Timers ---

    @app.post("/api/timers", status_code=201)
    def add_timer(body: TimerIn):
        with store.transaction() as config:
            timer = Timer(**body.model_dump())
            config.timers.append(timer)
        scheduler.sync()
        return timer

    @app.put("/api/timers/{timer_id}")
    def update_timer(timer_id: str, body: TimerIn):
        with store.transaction() as config:
            for i, t in enumerate(config.timers):
                if t.id == timer_id:
                    timer = Timer(id=timer_id, **body.model_dump())
                    config.timers[i] = timer
                    break
            else:
                raise HTTPException(status_code=404, detail="Timer not found")
        scheduler.sync()
        return timer

    @app.delete("/api/timers/{timer_id}")
    def delete_timer(timer_id: str):
        with store.transaction() as config:
            if not config.timer(timer_id):
                raise HTTPException(status_code=404, detail="Timer not found")
            config.timers = [t for t in config.timers if t.id != timer_id]
        scheduler.sync()
        runner.forget(timer_id)
        return {"status": "timer deleted"}

    @app.post("/api/timers/{timer_id}/execute", status_code=202)
    def execute_timer(timer_id: str):
        if not store.read().timer(timer_id):
            raise HTTPException(status_code=404, detail="Timer not found")
        runner.submit_timer(timer_id, "manual")
        return {"status": "queued"}

    # Serve static files last
    static_dir = os.path.join(WEB_DIR, "static")
    if os.path.isdir(static_dir):
        app.mount("/", StaticFiles(directory=static_dir, html=True), name="static")
    return app


def app_factory() -> FastAPI:
    """Entry point for `uvicorn --factory web.main:app_factory`."""
    setup_logging()
    binary = os.environ.get("IR_HUB_BINARY")
    return create_app(controller=IRController(binary) if binary else None)
