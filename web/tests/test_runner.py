from datetime import datetime
from zoneinfo import ZoneInfo

from web.runner import IRRunner
from web.scheduler import MISFIRE_GRACE_SECONDS, TimerScheduler
from web.store import ConfigStore
from web.tests.conftest import FakeController

TZ = ZoneInfo("Asia/Tokyo")


def make(seeded_path, **kw):
    store = ConfigStore(seeded_path)
    fake = FakeController(**kw)
    runner = IRRunner(fake, store, now=lambda: datetime.now(TZ))
    return store, fake, runner


def test_sequences_never_interleave(seeded_path):
    store, fake, runner = make(seeded_path, send_delay=0.01)
    timers = store.read().timers
    futures = [runner.submit_timer(t.id, "manual") for t in timers[:3]]
    futures.append(runner.submit_timer(timers[0].id, "manual"))
    for f in futures:
        f.result(timeout=10)
    assert fake.max_concurrency == 1
    config = store.read()
    expected = []
    for t in timers[:3] + [timers[0]]:
        for s in t.steps:
            expected += [config.commands[s.command_name].raw_data] * s.repeats
    assert fake.sent == expected
    runner.shutdown()


def test_failure_is_recorded(seeded_path):
    store, fake, runner = make(seeded_path)
    timer = store.read().timers[0]
    fake.fail_on.add(store.read().commands[timer.steps[0].command_name].raw_data)
    result = runner.submit_timer(timer.id, "schedule").result(timeout=5)
    assert result.ok is False and result.errors
    assert runner.last_results()[timer.id].ok is False
    runner.shutdown()


def test_unknown_timer(seeded_path):
    _, _, runner = make(seeded_path)
    assert runner.submit_timer("nope", "manual").result(timeout=5).ok is False
    runner.shutdown()


def test_scheduler_sync_matches_enabled_timers(seeded_path):
    store, _, runner = make(seeded_path)
    sched = TimerScheduler(store, runner, TZ)
    sched.start()
    try:
        enabled = {t.id for t in store.read().timers if t.enabled}
        assert set(sched.next_run_times()) == enabled
        job = sched._scheduler.get_job(next(iter(enabled)))
        assert job.misfire_grace_time == MISFIRE_GRACE_SECONDS
        assert str(job.next_run_time.tzinfo) == "Asia/Tokyo"

        with store.transaction() as config:
            config.timers[0].enabled = not config.timers[0].enabled
            config.timers[1].time = "03:04"
            first, second = config.timers[0], config.timers[1]
        sched.sync()
        ids = set(sched.next_run_times())
        assert (first.id in ids) == first.enabled
        if second.enabled:
            nrt = sched.next_run_times()[second.id]
            assert (nrt.hour, nrt.minute) == (3, 4)
    finally:
        sched.shutdown()
        runner.shutdown()
