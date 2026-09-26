import logging
import threading
from datetime import datetime, tzinfo
from typing import Dict, Optional

from apscheduler.events import EVENT_JOB_ERROR, EVENT_JOB_MISSED, JobExecutionEvent
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger

from web.runner import IRRunner
from web.store import ConfigStore

logger = logging.getLogger(__name__)

# The NAS can stall for a while under load; a run that fires late is far better
# than one that is silently dropped (APScheduler's default grace is 1 second).
MISFIRE_GRACE_SECONDS = 300


class TimerScheduler:
    """Keeps APScheduler jobs in step with the timers in the config."""

    def __init__(self, store: ConfigStore, runner: IRRunner, tz: tzinfo):
        self.store = store
        self.runner = runner
        self.tz = tz
        self._lock = threading.Lock()
        self._scheduler = BackgroundScheduler(
            timezone=tz,
            job_defaults={
                "misfire_grace_time": MISFIRE_GRACE_SECONDS,
                "coalesce": True,
                "max_instances": 1,
            },
        )
        self._scheduler.add_listener(self._on_event, EVENT_JOB_ERROR | EVENT_JOB_MISSED)

    def start(self):
        self._scheduler.start()
        self.sync()

    def shutdown(self):
        self._scheduler.shutdown(wait=False)

    def sync(self):
        """Add, reschedule or remove jobs so they match the enabled timers."""
        with self._lock:
            config = self.store.read()
            wanted = {t.id: t for t in config.timers if t.enabled and t.id}
            for job in self._scheduler.get_jobs():
                if job.id not in wanted:
                    self._scheduler.remove_job(job.id)
                    logger.info(f"Removed job {job.id}")
            for timer in wanted.values():
                try:
                    hour, minute = timer.time.split(":")
                    trigger = CronTrigger(hour=int(hour), minute=int(minute), timezone=self.tz)
                except Exception as e:
                    logger.error(f"Timer {timer.id} ({timer.name}) has invalid time {timer.time!r}: {e}")
                    continue
                self._scheduler.add_job(
                    self.runner.submit_timer,
                    trigger,
                    args=[timer.id, "schedule"],
                    id=timer.id,
                    name=timer.name,
                    replace_existing=True,
                )
                logger.info(f"Scheduled {timer.id} ({timer.name}) daily at {timer.time}")

    def next_run_times(self) -> Dict[str, Optional[datetime]]:
        return {job.id: job.next_run_time for job in self._scheduler.get_jobs()}

    def _on_event(self, event: JobExecutionEvent):
        if event.code == EVENT_JOB_MISSED:
            logger.warning(f"Timer job {event.job_id} missed its run at {event.scheduled_run_time}")
        elif event.exception:
            logger.error(f"Timer job {event.job_id} raised: {event.exception!r}")
