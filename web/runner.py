import logging
import threading
import time
from concurrent.futures import Future, ThreadPoolExecutor
from datetime import datetime
from typing import Callable, Dict, List, Optional, TypeVar

from pydantic import BaseModel

from web.ir_controller import IRController
from web.lights import AXES, LightTracker, plan, steps_for, to_level
from web.models import Command, Config
from web.store import ConfigStore

logger = logging.getLogger(__name__)

T = TypeVar("T")

# Gap between presses when HomeKit/Alexa/Google set a brightness or colour.
LIGHT_PRESS_INTERVAL = 0.1


class RunResult(BaseModel):
    timer_id: str
    trigger: str  # "schedule" or "manual"
    started_at: datetime
    finished_at: Optional[datetime] = None
    ok: Optional[bool] = None  # None while running
    errors: List[str] = []


class IRRunner:
    """Runs everything that touches the IR device on one worker thread.

    Manual sends, recording calls and whole timer sequences are queued in
    order, so two sequences can never interleave their steps.
    """

    def __init__(self, controller: IRController, store: ConfigStore, now: Callable[[], datetime],
                 lights: Optional[LightTracker] = None):
        self.controller = controller
        self.store = store
        self.lights = lights or LightTracker()
        self._now = now
        self._executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="ir-worker")
        self._results_lock = threading.Lock()
        self._last_results: Dict[str, RunResult] = {}
        self._pending_lock = threading.Lock()
        self._pending_lights: Dict[str, dict] = {}

    def call(self, fn: Callable[..., T], *args, timeout: float = 60) -> T:
        """Run a controller call on the worker thread and wait for its result."""
        return self._executor.submit(fn, *args).result(timeout=timeout)

    def send(self, raw_data: str, timeout: float = 60) -> str:
        return self.call(self.controller.send_raw_data, raw_data, timeout=timeout)

    def send_command(self, command_id: str, timeout: float = 60):
        """Send one stored button, keeping the light estimate up to date."""
        return self._executor.submit(self._send_command, command_id).result(timeout=timeout)

    def set_light(self, room_id: str, **targets) -> Future:
        """Queue a change of a room's light: on (bool), brightness / color (0-100).

        Targets that arrive while an earlier change is still waiting are merged
        into it, so a slider dragged in HomeKit turns into one set of presses.
        """
        targets = {k: v for k, v in targets.items() if v is not None}
        with self._pending_lock:
            self._pending_lights.setdefault(room_id, {}).update(targets)
        return self._executor.submit(self._apply_light, room_id)

    def submit_timer(self, timer_id: str, trigger: str) -> Future:
        return self._executor.submit(self._run_timer, timer_id, trigger)

    def last_results(self) -> Dict[str, RunResult]:
        with self._results_lock:
            return {k: v.model_copy() for k, v in self._last_results.items()}

    def forget(self, timer_id: str):
        with self._results_lock:
            self._last_results.pop(timer_id, None)

    def shutdown(self):
        self._executor.shutdown(wait=False, cancel_futures=True)

    def _record(self, result: RunResult):
        with self._results_lock:
            self._last_results[result.timer_id] = result.model_copy()

    def _press(self, config: Config, cmd: Command):
        """Send a stored button (worker thread only) and update the light estimate."""
        self.controller.send_raw_data(cmd.raw_data)
        room = config.room(cmd.room_id)
        if room:
            self.lights.observe(room, cmd.role)

    def _saturated(self, config: Config, cmd: Command, presses: int):
        """After `presses` presses of one button in a row, a level may now be known."""
        room = config.room(cmd.room_id)
        if not room:
            return
        for axis, (up, down) in AXES.items():
            if cmd.role in (up, down) and presses >= steps_for(room, axis):
                self.lights.set_level(room, axis, steps_for(room, axis) if cmd.role == up else 0)

    def _send_command(self, command_id: str):
        config = self.store.read()
        cmd = config.command(command_id)
        if not cmd:
            raise KeyError(command_id)
        self._press(config, cmd)

    def _apply_light(self, room_id: str):
        with self._pending_lock:
            targets = self._pending_lights.pop(room_id, None)
        if not targets:
            return  # already handled by an earlier job
        config = self.store.read()
        room = config.room(room_id)
        if not room:
            return
        by_role = {c.role: c for c in config.commands if c.room_id == room_id and c.role}

        if "on" in targets and (cmd := by_role.get("on" if targets["on"] else "off")):
            logger.info(f"{room.name}: {'on' if targets['on'] else 'off'}")
            self._press(config, cmd)
            if not targets["on"]:
                return  # don't step brightness of a light we just switched off

        for axis, (up, down) in AXES.items():
            if axis not in targets or up not in by_role or down not in by_role:
                continue
            steps = steps_for(room, axis)
            target = to_level(targets[axis], steps)
            current = getattr(self.lights.get(room_id), axis)
            moves = plan(current, target, steps)
            logger.info(f"{room.name}: {axis} {current} -> {target}/{steps} ({moves})")
            for direction, count in moves:
                cmd = by_role[up if direction > 0 else down]
                for i in range(count):
                    if i:
                        time.sleep(LIGHT_PRESS_INTERVAL)
                    self._press(config, cmd)
                self._saturated(config, cmd, count)
                time.sleep(LIGHT_PRESS_INTERVAL)

    def _run_timer(self, timer_id: str, trigger: str) -> RunResult:
        config = self.store.read()
        timer = config.timer(timer_id)
        result = RunResult(timer_id=timer_id, trigger=trigger, started_at=self._now())
        if not timer:
            logger.error(f"Timer {timer_id} not found during execution")
            result.errors.append("timer not found")
            result.ok = False
            result.finished_at = self._now()
            return result

        logger.info(f"Executing timer sequence: {timer.name} ({trigger})")
        self._record(result)
        for n, step in enumerate(timer.steps):
            cmd = config.command(step.command_id)
            if not cmd:
                msg = f"step {n + 1}: command no longer exists; skipped"
                logger.warning(msg)
                result.errors.append(msg)
                continue
            room = config.room(cmd.room_id)
            label = f"{room.name if room else '?'} / {cmd.name}"
            for i in range(step.repeats):
                try:
                    logger.info(f"Step {n + 1}: {label} (repeat {i + 1}/{step.repeats})")
                    self._press(config, cmd)
                except Exception as e:
                    msg = f"step {n + 1} ({label}) failed: {e}"
                    logger.error(msg)
                    result.errors.append(msg)
                    break  # Stop current step on error
                if i < step.repeats - 1:
                    time.sleep(step.interval_ms / 1000.0)
            else:
                self._saturated(config, cmd, step.repeats)
            if step.delay_after_ms and n < len(timer.steps) - 1:
                time.sleep(step.delay_after_ms / 1000.0)

        result.ok = not result.errors
        result.finished_at = self._now()
        self._record(result)
        logger.info(f"Finished timer sequence: {timer.name} ({'ok' if result.ok else 'with errors'})")
        return result
