import time

import pytest

from web.lights import LightTracker, plan
from web.models import Room


def test_plan():
    assert plan(3, 5, 10) == [(+1, 2)]
    assert plan(5, 3, 10) == [(-1, 2)]
    assert plan(4, 4, 10) == []
    # Ends press past the limit so the estimate re-syncs.
    assert plan(7, 10, 10) == [(+1, 13)]
    assert plan(2, 0, 10) == [(-1, 12)]
    # Unknown: saturate at the nearer end, then step back.
    assert plan(None, 8, 10) == [(+1, 10), (-1, 2)]
    assert plan(None, 2, 10) == [(-1, 10), (+1, 2)]
    assert plan(None, 10, 10) == [(+1, 10)]
    assert plan(None, 0, 10) == [(-1, 10)]


def test_tracker_observes_and_persists(tmp_path):
    room = Room(name="R", channel=1, brightness_steps=4)
    path = str(tmp_path / "lights.json")
    t = LightTracker(path)
    t.observe(room, "on")
    t.observe(room, "brighter")  # unknown level stays unknown
    assert t.get(room.id).model_dump() == {"on": True, "brightness": None, "color": None}
    t.set_level(room, "brightness", 4)
    t.observe(room, "brighter")  # clamped at the top
    t.observe(room, "darker")
    t.observe(room, None)
    assert LightTracker(path).get(room.id).brightness == 3

    (tmp_path / "bad.json").write_text("{not json")
    assert LightTracker(str(tmp_path / "bad.json")).all() == {}


@pytest.fixture
def rooms(client):
    c = client.get("/api/config").json()
    room = {r["name"]: r for r in c["rooms"]}
    cmd = {(r["name"], x["role"]): x for r in c["rooms"] for x in c["commands"] if x["room_id"] == r["id"]}
    return room, cmd


def wait_idle(client, timeout=10):
    """Waits for queued presses by sending a no-op through the same queue."""
    client.app.state.runner.call(lambda: None, timeout=timeout)


def light(client, name):
    return next(l for l in client.get("/api/lights").json() if l["name"] == name)


def test_lights_report_supported_controls(client, rooms):
    living, ch2 = light(client, "Living Room"), light(client, "Channel 2")
    assert living["supports"] == {"power": True, "brightness": True, "color": True}
    assert ch2["supports"] == {"power": False, "brightness": False, "color": False}
    assert living["on"] is None and living["brightness"] is None
    r = client.put(f"/api/rooms/{ch2['room_id']}/light", json={"brightness": 50})
    assert r.status_code == 422 and "brightness" in r.json()["detail"]
    assert client.put(f"/api/rooms/{ch2['room_id']}/light", json={}).status_code == 422
    assert client.put("/api/rooms/nope/light", json={"on": True}).status_code == 404


def test_set_light_presses_buttons(client, fake, rooms):
    room, cmd = rooms
    rid = room["Living Room"]["id"]
    raw = lambda role: cmd[("Living Room", role)]["raw_data"]  # noqa: E731

    # Unknown brightness: run to the top (10), then down to 70 % = level 7.
    assert client.put(f"/api/rooms/{rid}/light", json={"on": True, "brightness": 70}).status_code == 202
    wait_idle(client)
    assert fake.sent == [raw("on")] + [raw("brighter")] * 10 + [raw("darker")] * 3
    assert light(client, "Living Room")["brightness"] == 70 and light(client, "Living Room")["on"] is True

    fake.sent.clear()
    client.put(f"/api/rooms/{rid}/light", json={"brightness": 40, "color": 0})
    wait_idle(client)
    # 70 -> 40 is 3 presses; colour unknown and target warmest: 10 x warmer.
    assert fake.sent == [raw("darker")] * 3 + [raw("warmer")] * 10
    assert light(client, "Living Room")["color"] == 0

    fake.sent.clear()
    client.put(f"/api/rooms/{rid}/light", json={"on": False, "brightness": 90})
    wait_idle(client)
    assert fake.sent == [raw("off")]  # no stepping a light that was just switched off


def test_rapid_changes_are_merged(client, fake, rooms):
    room, cmd = rooms
    rid = room["Living Room"]["id"]
    fake.send_delay = 0.02
    client.put(f"/api/rooms/{rid}/light", json={"brightness": 100})  # 10 presses, keeps the worker busy
    for pct in (20, 30, 40, 50):
        client.put(f"/api/rooms/{rid}/light", json={"brightness": pct})
    wait_idle(client)
    # Unknown -> top is 10 presses; 20/30/40 are dropped and only 50 % (10 -> 5) is applied.
    assert len(fake.sent) == 10 + 5
    assert light(client, "Living Room")["brightness"] == 50


def test_buttons_and_routines_update_the_estimate(client, fake, rooms):
    room, cmd = rooms
    morning = next(t for t in client.get("/api/config").json()["timers"] if t["name"] == "Turn on in the morning")
    assert client.post(f"/api/timers/{morning['id']}/execute").status_code == 202
    wait_idle(client)
    # 12 x Brighter and 12 x White run past the top of both ranges, so both are known.
    assert light(client, "Living Room") | {"supports": None} == {
        "room_id": room["Living Room"]["id"], "name": "Living Room",
        "on": True, "brightness": 100, "color": 100, "supports": None}

    client.post(f"/api/commands/{cmd[('Living Room', 'darker')]['id']}/send")
    assert light(client, "Living Room")["brightness"] == 90


def test_changing_steps_resets_the_estimate(client, rooms):
    room, _ = rooms
    living = room["Living Room"]
    client.put(f"/api/rooms/{living['id']}/light", json={"brightness": 100})
    wait_idle(client)
    assert light(client, "Living Room")["brightness"] == 100

    # The web UI only sends name and channel; that must not touch the steps or the estimate.
    r = client.put(f"/api/rooms/{living['id']}", json={"name": "Living Room", "channel": 1})
    assert r.json()["room"]["brightness_steps"] == 10
    assert light(client, "Living Room")["brightness"] == 100

    r = client.put(f"/api/rooms/{living['id']}", json={"name": "Living Room", "channel": 1, "brightness_steps": 16})
    assert r.json()["room"]["brightness_steps"] == 16
    assert light(client, "Living Room")["brightness"] is None
