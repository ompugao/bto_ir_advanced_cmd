import os
import json
import uuid
import logging
import time
from typing import Dict, List, Optional, Any
from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger
from web.ir_controller import IRController

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="IR Remote Controller")
controller = IRController()
scheduler = BackgroundScheduler()
scheduler.start()

CONFIG_FILE = os.path.join(os.path.dirname(__file__), "config.json")

class IRCommand(BaseModel):
    raw_data: str
    channel: int  # 1, 2, or 3

class TimerStep(BaseModel):
    command_name: str
    repeats: int = 1
    interval_ms: int = 100

class Timer(BaseModel):
    id: Optional[str] = None
    name: str = "New Timer"
    steps: List[TimerStep]
    time: str  # Format: "HH:MM"
    enabled: bool = True

class Config(BaseModel):
    commands: Dict[str, IRCommand] = {}
    timers: List[Timer] = []
    mappings: Dict[str, str] = {} # "1": "Living Room", etc.

def load_config() -> Config:
    if not os.path.exists(CONFIG_FILE):
        return Config()
    try:
        with open(CONFIG_FILE, "r") as f:
            data = json.load(f)
            # Migration: if command is just a string, convert to object
            if "commands" in data:
                for name, val in data["commands"].items():
                    if isinstance(val, str):
                        data["commands"][name] = {"raw_data": val, "channel": 1}
            return Config(**data)
    except Exception as e:
        logger.error(f"Error loading config: {e}")
        return Config()

def save_config(config: Config):
    with open(CONFIG_FILE, "w") as f:
        json.dump(config.dict(), f, indent=2)

def execute_ir_command_sequence(timer_id: str):
    config = load_config()
    timer = next((t for t in config.timers if t.id == timer_id), None)
    if not timer:
        logger.error(f"Timer {timer_id} not found during execution")
        return

    logger.info(f"Executing timer sequence: {timer.name}")
    for step in timer.steps:
        cmd_obj = config.commands.get(step.command_name)
        if not cmd_obj:
            logger.warning(f"Command {step.command_name} not found, skipping step")
            continue
        
        for i in range(step.repeats):
            try:
                logger.info(f"Step: {step.command_name} (Ch{cmd_obj.channel}) (Repeat {i+1}/{step.repeats})")
                # This call is synchronous and waits for the subprocess to exit
                controller.send_raw_data(cmd_obj.raw_data)
                if i < step.repeats - 1:
                    time.sleep(step.interval_ms / 1000.0)
            except Exception as e:
                logger.error(f"Failed to execute {step.command_name}: {e}")
                break # Stop current step on error

def sync_scheduler():
    """Syncs the APScheduler with the current config"""
    scheduler.remove_all_jobs()
    config = load_config()
    for timer in config.timers:
        if not timer.enabled:
            logger.info(f"Skipping disabled timer {timer.id} ({timer.name})")
            continue
        try:
            # Convert HH:MM to cron: "MM HH * * *"
            hour, minute = timer.time.split(":")
            cron_expr = f"{minute} {hour} * * *"
            
            scheduler.add_job(
                execute_ir_command_sequence,
                CronTrigger.from_crontab(cron_expr),
                args=[timer.id],
                id=timer.id,
                replace_existing=True
            )
            logger.info(f"Added job {timer.id} ({timer.name}) at daily {timer.time}")
        except Exception as e:
            logger.error(f"Failed to add job {timer.id}: {e}")

# Initial sync
sync_scheduler()

# API Endpoints

@app.get("/api/config")
def get_config():
    return load_config()

@app.post("/api/commands/send/{name}")
def send_command(name: str):
    config = load_config()
    cmd_obj = config.commands.get(name)
    if not cmd_obj:
        raise HTTPException(status_code=404, detail="Command not found")
    try:
        controller.send_raw_data(cmd_obj.raw_data)
        return {"status": "success"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/commands/record/start")
def record_start():
    try:
        controller.start_recording()
        return {"status": "recording started"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/commands/record/stop")
def record_stop():
    try:
        controller.stop_recording()
        return {"status": "recording stopped"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/commands/record/data")
def get_record_data():
    try:
        data = controller.get_recorded_data()
        return {"data": data}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/commands")
def register_command(name: str, raw_data: str, channel: int = 1):
    config = load_config()
    config.commands[name] = IRCommand(raw_data=raw_data, channel=channel)
    save_config(config)
    return {"status": "command registered"}

@app.delete("/api/commands/{name}")
def delete_command(name: str):
    config = load_config()
    if name in config.commands:
        del config.commands[name]
        save_config(config)
        sync_scheduler()
        return {"status": "command deleted"}
    raise HTTPException(status_code=404, detail="Command not found")

@app.post("/api/timers")
def add_timer(timer: Timer):
    config = load_config()
    timer.id = str(uuid.uuid4())
    config.timers.append(timer)
    save_config(config)
    sync_scheduler()
    return timer

@app.put("/api/timers/{timer_id}")
def update_timer(timer_id: str, updated_timer: Timer):
    config = load_config()
    for i, timer in enumerate(config.timers):
        if timer.id == timer_id:
            updated_timer.id = timer_id
            config.timers[i] = updated_timer
            save_config(config)
            sync_scheduler()
            return updated_timer
    raise HTTPException(status_code=404, detail="Timer not found")

@app.delete("/api/timers/{timer_id}")
def delete_timer(timer_id: str):
    config = load_config()
    config.timers = [t for t in config.timers if t.id != timer_id]
    save_config(config)
    sync_scheduler()
    return {"status": "timer deleted"}

@app.post("/api/timers/{timer_id}/execute")
def execute_timer(timer_id: str, background_tasks: BackgroundTasks):
    background_tasks.add_task(execute_ir_command_sequence, timer_id)
    return {"status": "execution started"}

@app.post("/api/mappings")
def update_mappings(mappings: Dict[str, str]):
    config = load_config()
    config.mappings = mappings
    save_config(config)
    return {"status": "mappings updated"}

# Serve static files last
app.mount("/", StaticFiles(directory=os.path.join(os.path.dirname(__file__), "static"), html=True), name="static")
