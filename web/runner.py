import logging
import threading
import time
from concurrent.futures import Future, ThreadPoolExecutor
from datetime import datetime
from typing import Callable, Dict, List, Optional, TypeVar

from pydantic import BaseModel

from web.ir_controller import IRController
from web.store import ConfigStore

logger = logging.getLogger(__name__)

T = TypeVar("T")


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

    def __init__(self, controller: IRController, store: ConfigStore, now: Callable[[], datetime]):
        self.controller = controller
        self.store = store
        self._now = now
        self._executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="ir-worker")
        self._results_lock = threading.Lock()
        self._last_results: Dict[str, RunResult] = {}

    def call(self, fn: Callable[..., T], *args, timeout: float = 60) -> T:
        """Run a controller call on the worker thread and wait for its result."""
        return self._executor.submit(fn, *args).result(timeout=timeout)

    def send(self, raw_data: str, timeout: float = 60) -> str:
        return self.call(self.controller.send_raw_data, raw_data, timeout=timeout)

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
                    self.controller.send_raw_data(cmd.raw_data)
                except Exception as e:
                    msg = f"step {n + 1} ({label}) failed: {e}"
                    logger.error(msg)
                    result.errors.append(msg)
                    break  # Stop current step on error
                if i < step.repeats - 1:
                    time.sleep(step.interval_ms / 1000.0)
            if step.delay_after_ms and n < len(timer.steps) - 1:
                time.sleep(step.delay_after_ms / 1000.0)

        result.ok = not result.errors
        result.finished_at = self._now()
        self._record(result)
        logger.info(f"Finished timer sequence: {timer.name} ({'ok' if result.ok else 'with errors'})")
        return result
