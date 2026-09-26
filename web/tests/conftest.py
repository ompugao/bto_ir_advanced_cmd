import json
import os
import shutil
import threading
import time

import pytest
from fastapi.testclient import TestClient

from web.main import create_app

FIXTURES = os.path.join(os.path.dirname(__file__), "fixtures")


class FakeController:
    """Records calls instead of talking to USB. Thread-safety checks included."""

    def __init__(self, send_delay=0.0):
        self.sent = []
        self.calls = []
        self.send_delay = send_delay
        self.fail_on = set()
        self.recorded = ""
        self._active = 0
        self.max_concurrency = 0
        self._lock = threading.Lock()

    def _enter(self, name):
        with self._lock:
            self._active += 1
            self.max_concurrency = max(self.max_concurrency, self._active)
            self.calls.append(name)

    def _exit(self):
        with self._lock:
            self._active -= 1

    def send_raw_data(self, raw_data):
        self._enter("send")
        try:
            time.sleep(self.send_delay)
            if raw_data in self.fail_on:
                raise RuntimeError("simulated failure")
            self.sent.append(raw_data)
        finally:
            self._exit()

    def start_recording(self):
        self._enter("start")
        self._exit()

    def stop_recording(self):
        self._enter("stop")
        self._exit()

    def get_recorded_data(self):
        self._enter("get")
        self._exit()
        return self.recorded


@pytest.fixture
def nas_config_v1():
    with open(os.path.join(FIXTURES, "config_v1_nas.json")) as f:
        return json.load(f)


@pytest.fixture
def config_path(tmp_path):
    return str(tmp_path / "data" / "config.json")


@pytest.fixture
def seeded_path(tmp_path):
    path = tmp_path / "data" / "config.json"
    path.parent.mkdir()
    shutil.copy(os.path.join(FIXTURES, "config_v1_nas.json"), path)
    return str(path)


@pytest.fixture
def fake():
    return FakeController()


@pytest.fixture
def client(seeded_path, fake):
    app = create_app(seeded_path, controller=fake, run_scheduler=False)
    with TestClient(app) as c:
        yield c
