import logging
import threading
import time
from datetime import datetime
from typing import Callable, Optional

from pydantic import BaseModel

from web.runner import IRRunner

logger = logging.getLogger(__name__)


class RecordingState(BaseModel):
    active: bool = False
    started_at: Optional[datetime] = None
    expires_at: Optional[datetime] = None
    expired: bool = False  # the last session was stopped by the timeout


class RecordingBusy(Exception):
    pass


class NoRecording(Exception):
    pass


class RecordingSession:
    """Server-side recording state, so a closed browser tab can't leave the
    receiver in recording mode: sessions stop themselves after `timeout`."""

    def __init__(self, runner: IRRunner, now: Callable[[], datetime], timeout: float = 30,
                 retry_delay: float = 0.2):
        self.runner = runner
        self.controller = runner.controller
        self._now = now
        self.timeout = timeout
        self.retry_delay = retry_delay
        self._lock = threading.Lock()
        self._state = RecordingState()
        self._timer: Optional[threading.Timer] = None
        self._previous = ""

    def state(self) -> RecordingState:
        with self._lock:
            return self._state.model_copy()

    def start(self) -> RecordingState:
        with self._lock:
            if self._state.active:
                self._cancel_timer()
            try:
                # Remember what the receiver holds now, to flag a capture that didn't change.
                self._previous = self.runner.call(self.controller.get_recorded_data)
            except Exception:
                self._previous = ""
            self.runner.call(self.controller.start_recording)
            started = self._now()
            self._state = RecordingState(
                active=True, started_at=started,
                expires_at=datetime.fromtimestamp(started.timestamp() + self.timeout, started.tzinfo))
            self._timer = threading.Timer(self.timeout, self._expire)
            self._timer.daemon = True
            self._timer.start()
            return self._state.model_copy()

    def stop(self) -> dict:
        with self._lock:
            if not self._state.active:
                raise NoRecording("no recording in progress")
            self._cancel_timer()
            self._state = RecordingState()
            self.runner.call(self.controller.stop_recording)
            data = ""
            for _ in range(5):
                data = self.runner.call(self.controller.get_recorded_data)
                if data:
                    break
                time.sleep(self.retry_delay)
            return {"raw_data": data, "same_as_previous": bool(data) and data == self._previous}

    def shutdown(self):
        with self._lock:
            self._cancel_timer()

    def _cancel_timer(self):
        if self._timer:
            self._timer.cancel()
            self._timer = None

    def _expire(self):
        with self._lock:
            if not self._state.active:
                return
            logger.info("Recording timed out; stopping receiver")
            self._timer = None
            self._state = RecordingState(expired=True)
            try:
                self.runner.call(self.controller.stop_recording)
            except Exception as e:
                logger.error(f"Failed to stop recording after timeout: {e}")
