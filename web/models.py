import logging
import re
import uuid
from typing import Annotated, List, Literal, Optional

from pydantic import BaseModel, Field, StringConstraints, field_validator, model_validator

from web import ir_codec

logger = logging.getLogger(__name__)

Role = Literal["on", "off", "brighter", "darker", "white", "warmer"]
Name = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=60)]
TIME_PATTERN = r"^([01]\d|2[0-3]):[0-5]\d$"


def new_id() -> str:
    return uuid.uuid4().hex


class Room(BaseModel):
    """A place with one light (or appliance) whose remote is set to `channel`."""
    id: str = Field(default_factory=new_id)
    name: Name
    channel: int = Field(ge=1, le=3)


class Command(BaseModel):
    """One button of one room's remote. `raw_data` already carries the channel."""
    id: str = Field(default_factory=new_id)
    room_id: str
    name: Name
    raw_data: str
    derived: bool = False  # generated from another room's capture rather than recorded
    role: Optional[Role] = None  # what the button does; None for custom buttons

    @field_validator("raw_data")
    @classmethod
    def check_raw(cls, v: str) -> str:
        ir_codec.parse_raw(v)
        return v.strip()


class TimerStep(BaseModel):
    command_id: str
    repeats: int = Field(default=1, ge=1, le=50)
    interval_ms: int = Field(default=100, ge=0, le=60_000)  # between repeats
    delay_after_ms: int = Field(default=0, ge=0, le=600_000)  # before the next step


class Timer(BaseModel):
    id: str = Field(default_factory=new_id)
    name: Name
    time: str = Field(pattern=TIME_PATTERN)  # "HH:MM", Asia/Tokyo
    enabled: bool = True
    steps: List[TimerStep] = []


class Config(BaseModel):
    version: Literal[3] = 3
    rooms: List[Room] = []
    commands: List[Command] = []
    timers: List[Timer] = []

    @model_validator(mode="after")
    def check_references(self):
        for kind, items in (("room", self.rooms), ("command", self.commands), ("timer", self.timers)):
            ids = [i.id for i in items]
            if len(ids) != len(set(ids)):
                raise ValueError(f"duplicate {kind} id")
        room_names = [r.name.casefold() for r in self.rooms]
        if len(room_names) != len(set(room_names)):
            raise ValueError("room names must be unique")
        room_ids = {r.id for r in self.rooms}
        seen = set()
        for c in self.commands:
            if c.room_id not in room_ids:
                raise ValueError(f"command {c.name!r} refers to a missing room")
            key = (c.room_id, c.name.casefold())
            if key in seen:
                raise ValueError(f"duplicate command name {c.name!r} in one room")
            seen.add(key)
            if c.role:
                if (c.room_id, "role", c.role) in seen:
                    raise ValueError(f"another button in this room is already '{c.role}'")
                seen.add((c.room_id, "role", c.role))
        command_ids = {c.id for c in self.commands}
        for t in self.timers:
            for s in t.steps:
                if s.command_id not in command_ids:
                    raise ValueError(f"timer {t.name!r} refers to a missing command")
        return self

    def room(self, room_id: str) -> Optional[Room]:
        return next((r for r in self.rooms if r.id == room_id), None)

    def command(self, command_id: str) -> Optional[Command]:
        return next((c for c in self.commands if c.id == command_id), None)

    def timer(self, timer_id: str) -> Optional[Timer]:
        return next((t for t in self.timers if t.id == timer_id), None)

    def timers_using(self, command_ids) -> List[Timer]:
        ids = set(command_ids)
        return [t for t in self.timers if any(s.command_id in ids for s in t.steps)]


def migrate(data: dict) -> dict:
    """Upgrade older config layouts. Returns `data` itself when nothing changed."""
    if data.get("version") == 3:
        return data
    if data.get("version") != 2:
        data = _migrate_v1(data)
    return _migrate_v2(data)


def _migrate_v2(data: dict) -> dict:
    """v3 adds `role` to commands, detected from the code where it is recognised."""
    commands, taken = [], set()
    for c in data.get("commands", []):
        c = dict(c)
        role = c.get("role") or ir_codec.light_function(c["raw_data"])
        if role and (c["room_id"], role) not in taken:
            taken.add((c["room_id"], role))
            c["role"] = role
        else:
            c["role"] = None
        commands.append(c)
    return {**data, "version": 3, "commands": commands}


def _migrate_v1(data: dict) -> dict:
    """v1: commands keyed by globally unique name with a free-text channel label,
    plus a global channel -> room name mapping. v2: rooms own their commands."""
    commands = {
        name: {"raw_data": v, "channel": 1} if isinstance(v, str) else v
        for name, v in data.get("commands", {}).items()
    }
    mappings = {int(k): v.strip() for k, v in data.get("mappings", {}).items() if str(k).isdigit()}

    channels = sorted({int(c["channel"]) for c in commands.values()} | {ch for ch, n in mappings.items() if n})
    rooms = {ch: {"id": new_id(), "name": mappings.get(ch) or f"Channel {ch}", "channel": ch} for ch in channels}

    new_commands, id_by_name = [], {}
    for name, cmd in commands.items():
        ch = int(cmd["channel"])
        detected = ir_codec.light_channel(cmd["raw_data"])
        if detected is not None and detected != ch:
            logger.warning(f"Migration: {name} is labelled CH{ch} but its code is for CH{detected}")
        # "DARKEN_LIGHT_CH1" in the CH1 room becomes "DARKEN_LIGHT" unless that clashes.
        short = re.sub(rf"_?CH{ch}$", "", name, flags=re.IGNORECASE) or name
        siblings = {n.casefold() for n, c in commands.items() if int(c["channel"]) == ch and n != name}
        if short != name and short.casefold() in siblings:
            short = name
        cid = new_id()
        id_by_name[name] = cid
        new_commands.append({"id": cid, "room_id": rooms[ch]["id"], "name": short, "raw_data": cmd["raw_data"]})

    timers = []
    for t in data.get("timers", []):
        steps = []
        for s in t.get("steps", []):
            if s.get("command_name") in id_by_name:
                steps.append({
                    "command_id": id_by_name[s["command_name"]],
                    "repeats": s.get("repeats", 1),
                    "interval_ms": s.get("interval_ms", 100),
                })
            else:
                logger.warning(f"Migration: timer {t.get('name')!r} step {s.get('command_name')!r} dropped (no such command)")
        timers.append({
            "id": t.get("id") or new_id(),
            "name": t.get("name") or "Timer",
            "time": t["time"],
            "enabled": bool(t.get("enabled", True)) and bool(steps),
            "steps": steps,
        })

    return {"version": 2, "rooms": list(rooms.values()), "commands": new_commands, "timers": timers}


def equivalent_command(config: "Config", command: Command, room_id: str) -> Optional[Command]:
    """The button in `room_id` that does the same thing: same role, else same name."""
    in_room = [c for c in config.commands if c.room_id == room_id]
    if command.role:
        match = next((c for c in in_room if c.role == command.role), None)
        if match:
            return match
    return next((c for c in in_room if c.name.casefold() == command.name.casefold()), None)
