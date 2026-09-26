from typing import Dict, List, Optional

from pydantic import BaseModel


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
    mappings: Dict[str, str] = {}  # "1": "Living Room", etc.


def migrate(data: dict) -> dict:
    """Upgrade older config layouts. Returns `data` itself when nothing changed."""
    commands = data.get("commands", {})
    if not any(isinstance(v, str) for v in commands.values()):
        return data
    data = dict(data)
    data["commands"] = {
        name: {"raw_data": v, "channel": 1} if isinstance(v, str) else v
        for name, v in commands.items()
    }
    return data
