from web.models import Config, migrate


def names_by_room(config):
    return {r.name: sorted(c.name for c in config.commands if c.room_id == r.id) for r in config.rooms}


def test_v1_nas_config_migrates(nas_config_v1):
    config = Config.model_validate(migrate(nas_config_v1))
    assert [(r.name, r.channel) for r in config.rooms] == [("Living Room", 1), ("Channel 2", 2)]
    assert names_by_room(config) == {
        # DARKEN_LIGHT_CH1 loses its suffix: the room now tells the channels apart.
        "Living Room": ["BRIGHTEN_LIGHT", "DARKEN_LIGHT", "ORANGE_LIGHT", "TURN_OFF_LIGHT",
                        "TURN_ON_LIGHT", "WHITE_LIGHT"],
        "Channel 2": ["DARKEN_LIGHT", "WARMER_LIGHT"],
    }
    old_by_name = nas_config_v1["commands"]
    # Every command keeps its exact code.
    assert sorted(c.raw_data for c in config.commands) == sorted(c["raw_data"] for c in old_by_name.values())

    old_timers = {t["id"]: t for t in nas_config_v1["timers"]}
    assert {t.id for t in config.timers} == set(old_timers)
    for t in config.timers:
        old = old_timers[t.id]
        assert (t.name, t.time, t.enabled) == (old["name"], old["time"], old["enabled"])
        assert [config.command(s.command_id).raw_data for s in t.steps] == \
            [old_by_name[s["command_name"]]["raw_data"] for s in old["steps"]]
        assert [(s.repeats, s.interval_ms, s.delay_after_ms) for s in t.steps] == \
            [(s["repeats"], s["interval_ms"], 0) for s in old["steps"]]


def test_v2_is_left_alone(nas_config_v1):
    v2 = migrate(nas_config_v1)
    assert migrate(v2) is v2


def test_suffix_kept_on_clash_and_dangling_steps_dropped():
    raw = "0x00,0x86,0x00,0x42"
    v1 = {
        "commands": {"A_CH1": {"raw_data": raw, "channel": 1}, "A": {"raw_data": raw, "channel": 1},
                     "B": raw},
        "timers": [{"id": "t", "name": "T", "time": "07:00", "enabled": True,
                    "steps": [{"command_name": "GONE", "repeats": 1, "interval_ms": 100}]}],
        "mappings": {"1": "Kitchen", "2": "", "3": "Bedroom"},
    }
    config = Config.model_validate(migrate(v1))
    assert names_by_room(config) == {"Kitchen": ["A", "A_CH1", "B"], "Bedroom": []}
    assert config.timers[0].steps == [] and config.timers[0].enabled is False
