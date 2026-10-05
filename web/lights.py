"""Estimated state of each room's light, and planning button presses to reach a target.

IR is one-way, so the hub can't ask a light what it is doing. Instead it counts
the role buttons it sends (On/Off, Brighter/Darker, White/Warmer), whoever asked
for them: the Home page, a routine, or HomeKit/Alexa/Google via Homebridge.

Levels are counted in button presses: 0 is the dimmest (or warmest) setting and
`steps` the brightest (or whitest). A level is `None` while unknown, e.g. after a
restart without a state file. Pressing past either end does nothing on the
light, so planning a move to an end (or from an unknown level) presses `steps`
extra times. That lands on a known level and brings the estimate back in line
if someone used the physical remote.
"""
import json
import logging
import os
import tempfile
import threading
from typing import Dict, List, Literal, Optional, Tuple

from pydantic import BaseModel

from web.models import Room

logger = logging.getLogger(__name__)

Axis = Literal["brightness", "color"]

# axis -> (role that raises the level, role that lowers it)
AXES: Dict[str, Tuple[str, str]] = {
    "brightness": ("brighter", "darker"),
    "color": ("white", "warmer"),
}


class LightState(BaseModel):
    on: Optional[bool] = None
    brightness: Optional[int] = None  # 0..room.brightness_steps
    color: Optional[int] = None  # 0 (warmest) .. room.color_steps (whitest)


def steps_for(room: Room, axis: str) -> int:
    return room.brightness_steps if axis == "brightness" else room.color_steps


def to_level(percent: int, steps: int) -> int:
    return round(max(0, min(100, percent)) * steps / 100)


def to_percent(level: Optional[int], steps: int) -> Optional[int]:
    return None if level is None else round(level * 100 / steps)


def plan(current: Optional[int], target: int, steps: int) -> List[Tuple[int, int]]:
    """Presses to go from `current` to `target`, as [(direction, count)] with
    direction +1 (raise) or -1 (lower)."""
    target = max(0, min(steps, target))
    if current is None:
        # Unknown: run into the nearer end first, then come back.
        if target * 2 >= steps:
            moves = [(+1, steps)]
            back = steps - target
            return moves + ([(-1, back)] if back else [])
        moves = [(-1, steps)]
        return moves + ([(+1, target)] if target else [])
    if target == steps:
        return [(+1, steps - current + steps)]
    if target == 0:
        return [(-1, current + steps)]
    delta = target - current
    return [(1 if delta > 0 else -1, abs(delta))] if delta else []


class LightTracker:
    """Thread-safe store of estimated light states, saved to a small JSON file."""

    def __init__(self, path: Optional[str] = None):
        self.path = path
        self._lock = threading.Lock()
        self._states: Dict[str, LightState] = {}
        if path and os.path.exists(path):
            try:
                with open(path) as f:
                    self._states = {k: LightState.model_validate(v) for k, v in json.load(f).items()}
            except Exception as e:
                # Only an estimate: start from "unknown" rather than refusing to start.
                logger.warning(f"Ignoring unreadable light state {path}: {e}")

    def get(self, room_id: str) -> LightState:
        with self._lock:
            return self._states.get(room_id, LightState()).model_copy()

    def all(self) -> Dict[str, LightState]:
        with self._lock:
            return {k: v.model_copy() for k, v in self._states.items()}

    def observe(self, room: Room, role: Optional[str]):
        """Update the estimate after a button with `role` was sent to `room`."""
        if not role:
            return
        with self._lock:
            s = self._states.setdefault(room.id, LightState())
            if role in ("on", "off"):
                s.on = role == "on"
            for axis, (up, down) in AXES.items():
                if role in (up, down):
                    level = getattr(s, axis)
                    if level is not None:
                        level += 1 if role == up else -1
                        setattr(s, axis, max(0, min(steps_for(room, axis), level)))
            self._save()

    def reset(self, room_id: str):
        """Forget what we know, e.g. after the room's step counts changed."""
        with self._lock:
            if self._states.pop(room_id, None) is not None:
                self._save()

    def set_level(self, room: Room, axis: str, level: int):
        """Record a level reached by saturating (pressing past an end)."""
        with self._lock:
            s = self._states.setdefault(room.id, LightState())
            setattr(s, axis, max(0, min(steps_for(room, axis), level)))
            self._save()

    def _save(self):
        if not self.path:
            return
        directory = os.path.dirname(os.path.abspath(self.path))
        try:
            os.makedirs(directory, exist_ok=True)
            fd, tmp = tempfile.mkstemp(prefix=".lights.", suffix=".tmp", dir=directory)
            with os.fdopen(fd, "w") as f:
                json.dump({k: v.model_dump() for k, v in self._states.items()}, f)
            os.replace(tmp, self.path)
        except Exception as e:
            logger.warning(f"Could not save light state: {e}")
