import pytest

from web import ir_codec


@pytest.fixture
def cfg(client):
    def get():
        c = client.get("/api/config").json()
        c["room"] = {r["name"]: r for r in c["rooms"]}
        c["cmd"] = {(next(r["name"] for r in c["rooms"] if r["id"] == x["room_id"]), x["name"]): x
                    for x in c["commands"]}
        return c
    return get


def test_config_is_migrated(cfg):
    c = cfg()
    assert c["version"] == 2 and len(c["commands"]) == 8 and len(c["timers"]) == 7


def test_status(client, cfg):
    s = client.get("/api/status").json()
    assert set(s["timers"]) == {t["id"] for t in cfg()["timers"]}
    assert s["recording"]["active"] is False


def test_send_command(client, fake, cfg):
    cmd = cfg()["cmd"][("Living Room", "TURN_OFF_LIGHT")]
    assert client.post(f"/api/commands/{cmd['id']}/send").status_code == 200
    assert fake.sent == [cmd["raw_data"]]
    assert client.post("/api/commands/nope/send").status_code == 404


def test_send_failure_is_502(client, fake, cfg):
    cmd = cfg()["cmd"][("Living Room", "TURN_OFF_LIGHT")]
    fake.fail_on.add(cmd["raw_data"])
    assert client.post(f"/api/commands/{cmd['id']}/send").status_code == 502


def test_add_command_checks_channel_and_duplicates(client, cfg):
    c = cfg()
    living, ch2 = c["room"]["Living Room"], c["room"]["Channel 2"]
    ch2_code = c["cmd"][("Channel 2", "DARKEN_LIGHT")]["raw_data"]

    r = client.post("/api/commands", json={"room_id": living["id"], "name": "X", "raw_data": ch2_code})
    assert r.status_code == 409 and r.json()["detail"]["code"] == "channel_mismatch"
    assert r.json()["detail"]["detected_channel"] == 2

    r = client.post("/api/commands", json={"room_id": ch2["id"], "name": "darken_light", "raw_data": ch2_code})
    assert r.status_code == 409 and r.json()["detail"]["code"] == "exists"

    r = client.post("/api/commands", json={"room_id": ch2["id"], "name": "X", "raw_data": "nonsense"})
    assert r.status_code == 422

    r = client.post("/api/commands", json={"room_id": living["id"], "name": "X", "raw_data": ch2_code,
                                           "allow_channel_mismatch": True})
    assert r.status_code == 201


def test_replace_keeps_id_so_timers_still_work(client, cfg):
    c = cfg()
    old = c["cmd"][("Living Room", "TURN_OFF_LIGHT")]
    new_raw = ir_codec.derive_raw(c["cmd"][("Living Room", "DARKEN_LIGHT")]["raw_data"], 1)
    r = client.post("/api/commands", json={"room_id": old["room_id"], "name": "TURN_OFF_LIGHT",
                                           "raw_data": new_raw, "replace": True})
    assert r.status_code == 201 and r.json()["id"] == old["id"]
    assert cfg()["cmd"][("Living Room", "TURN_OFF_LIGHT")]["raw_data"] == new_raw


def test_delete_command_in_use_is_refused(client, cfg):
    cmd = cfg()["cmd"][("Living Room", "TURN_OFF_LIGHT")]
    r = client.delete(f"/api/commands/{cmd['id']}")
    assert r.status_code == 409 and "Good Night" in r.json()["detail"]["timers"]
    unused = cfg()["cmd"][("Living Room", "TURN_ON_LIGHT")]  # only used by a timer too
    assert client.delete(f"/api/commands/{unused['id']}").status_code == 409


def test_new_room_copied_from_other_room(client, cfg):
    living = cfg()["room"]["Living Room"]
    r = client.post("/api/rooms", json={"name": "Bedroom", "channel": 3, "copy_from_room_id": living["id"]})
    assert r.status_code == 201 and r.json()["skipped"] == []
    c = cfg()
    bed = [x for x in c["commands"] if x["room_id"] == r.json()["room"]["id"]]
    assert len(bed) == 6 and all(x["derived"] for x in bed)
    assert all(ir_codec.light_channel(x["raw_data"]) == 3 for x in bed)
    darken = c["cmd"][("Bedroom", "DARKEN_LIGHT")]
    assert ir_codec.decode_frames(darken["raw_data"]) == [[0x2C, 0x52, 0x09, 0x3B, 0x32]]


def test_derive_single_command(client, cfg):
    c = cfg()
    src = c["cmd"][("Living Room", "WHITE_LIGHT")]
    r = client.post(f"/api/commands/{src['id']}/derive", json={"room_id": c["room"]["Channel 2"]["id"]})
    assert r.status_code == 201
    assert ir_codec.decode_frames(r.json()["raw_data"]) == [[0x2C, 0x52, 0x39, 0x94, 0xAD]]
    # Channel 2 already has DARKEN_LIGHT.
    src = c["cmd"][("Living Room", "DARKEN_LIGHT")]
    r = client.post(f"/api/commands/{src['id']}/derive", json={"room_id": c["room"]["Channel 2"]["id"]})
    assert r.status_code == 409


def test_room_channel_change_retargets_codes(client, cfg):
    c = cfg()
    ch2 = c["room"]["Channel 2"]
    r = client.put(f"/api/rooms/{ch2['id']}", json={"name": "Dining", "channel": 3})
    assert r.status_code == 200 and r.json()["not_rewritten"] == []
    c = cfg()
    assert all(ir_codec.light_channel(x["raw_data"]) == 3 for x in c["commands"] if x["room_id"] == ch2["id"])
    assert c["room"]["Dining"]["channel"] == 3


def test_room_rules(client, cfg):
    c = cfg()
    assert client.post("/api/rooms", json={"name": "living room", "channel": 2}).status_code == 422
    assert client.post("/api/rooms", json={"name": "X", "channel": 4}).status_code == 422
    assert client.delete(f"/api/rooms/{c['room']['Living Room']['id']}").status_code == 409
    new = client.post("/api/rooms", json={"name": "Empty", "channel": 3}).json()["room"]
    assert client.delete(f"/api/rooms/{new['id']}").status_code == 200


def test_timer_validation(client, cfg):
    cmd = cfg()["cmd"][("Living Room", "TURN_OFF_LIGHT")]
    ok = {"name": "T", "time": "07:30", "steps": [{"command_id": cmd["id"]}]}
    assert client.post("/api/timers", json=ok).status_code == 201
    for bad in (
        {**ok, "time": "7:30"},
        {**ok, "time": "24:00"},
        {**ok, "steps": []},
        {**ok, "steps": [{"command_id": "missing"}]},
        {**ok, "steps": [{"command_id": cmd["id"], "repeats": 0}]},
        {**ok, "steps": [{"command_id": cmd["id"], "interval_ms": -1}]},
        {**ok, "name": "  "},
    ):
        assert client.post("/api/timers", json=bad).status_code == 422, bad


def test_timer_crud_and_execute(client, cfg, fake):
    cmd = cfg()["cmd"][("Living Room", "TURN_OFF_LIGHT")]
    t = client.post("/api/timers", json={"name": "T", "time": "07:30",
                                         "steps": [{"command_id": cmd["id"], "repeats": 2, "interval_ms": 0}]}).json()
    assert client.put(f"/api/timers/{t['id']}", json={**t, "enabled": False}).json()["enabled"] is False
    assert client.post(f"/api/timers/{t['id']}/execute").status_code == 202
    client.app.state.runner.call(lambda: None)  # wait for the queued run
    assert fake.sent == [cmd["raw_data"]] * 2
    assert client.delete(f"/api/timers/{t['id']}").status_code == 200
    assert client.delete(f"/api/timers/{t['id']}").status_code == 404
    assert client.post("/api/timers/nope/execute").status_code == 404


def test_recording_flow(client, fake, cfg):
    raw = cfg()["cmd"][("Channel 2", "WARMER_LIGHT")]["raw_data"]
    assert client.post("/api/record/stop").status_code == 409
    assert client.post("/api/record/start").json()["active"] is True
    fake.recorded = raw
    r = client.post("/api/record/stop").json()
    assert r["raw_data"] == raw and r["same_as_previous"] is False
    assert r["decoded"] == {"frames": ["2C 52 39 95 AC"], "light_channel": 2}
    # Nothing new pressed: the receiver still holds the old capture.
    client.post("/api/record/start")
    assert client.post("/api/record/stop").json()["same_as_previous"] is True
    assert fake.calls.count("start") == 2 and fake.calls.count("stop") == 2


def test_recording_empty_capture(client, fake):
    client.post("/api/record/start")
    r = client.post("/api/record/stop")
    assert r.status_code == 422


def test_send_raw_and_describe(client, fake, cfg):
    raw = cfg()["cmd"][("Channel 2", "DARKEN_LIGHT")]["raw_data"]
    assert client.post("/api/ir/describe", json={"raw_data": raw}).json()["light_channel"] == 2
    assert client.post("/api/ir/send", json={"raw_data": raw}).status_code == 200
    assert fake.sent == [raw]
    assert client.post("/api/ir/send", json={"raw_data": "x"}).status_code == 422


def test_recording_times_out(short_record_app, fake):
    import time
    c = short_record_app
    c.post("/api/record/start")
    time.sleep(0.5)
    state = c.get("/api/record").json()
    assert state["active"] is False and state["expired"] is True
    assert fake.calls.count("stop") == 1
    assert c.post("/api/record/stop").status_code == 409
