import pytest

from web import ir_codec

# Decoded captures from the living room / dining lights, recorded on 2026-09-26.
# (button, channel) -> frame bytes
SAMPLES = {
    ("darken", 1): "2C 52 09 2B 22",
    ("darken", 2): "2C 52 09 33 3A",
    ("darken", 3): "2C 52 09 3B 32",
    ("off", 1): "2C 52 09 2F 26",
    ("off", 2): "2C 52 09 37 3E",
    ("off", 3): "2C 52 09 3F 36",
    ("white", 1): "2C 52 39 90 A9",
    ("white", 2): "2C 52 39 94 AD",
    ("white", 3): "2C 52 39 98 A1",
    ("warmer", 1): "2C 52 39 91 A8",
    ("warmer", 2): "2C 52 39 95 AC",
    ("warmer", 3): "2C 52 39 99 A0",
}

# Fixture command -> (button, channel)
FIXTURE_COMMANDS = {
    "DARKEN_LIGHT_CH1": ("darken", 1),
    "DARKEN_LIGHT": ("darken", 2),
    "TURN_OFF_LIGHT": ("off", 1),
    "WHITE_LIGHT": ("white", 1),
    "WARMER_LIGHT": ("warmer", 2),
    "ORANGE_LIGHT": ("warmer", 1),  # same code as the warmer button on CH1
}


def to_bytes(s):
    return [int(x, 16) for x in s.split()]


@pytest.mark.parametrize("key", SAMPLES)
def test_frame_level_channel_rule_matches_every_sample(key):
    button, _ = key
    source = to_bytes(SAMPLES[(button, 1)])
    for ch in (1, 2, 3):
        assert ir_codec.with_light_channel(source, ch) == to_bytes(SAMPLES[(button, ch)])


def test_fixture_commands_decode(nas_config_v1):
    for name, cmd in nas_config_v1["commands"].items():
        frames = ir_codec.decode_frames(cmd["raw_data"])
        assert len(frames) == 1
        assert ir_codec.light_channel(cmd["raw_data"]) == cmd["channel"], name


@pytest.mark.parametrize("name", FIXTURE_COMMANDS)
def test_raw_derivation_reproduces_recorded_codes(nas_config_v1, name):
    raw = nas_config_v1["commands"][name]["raw_data"]
    button, source_ch = FIXTURE_COMMANDS[name]
    for ch in (1, 2, 3):
        derived = ir_codec.derive_raw(raw, ch)
        assert ir_codec.decode_frames(derived) == [to_bytes(SAMPLES[(button, ch)])]
        assert ir_codec.light_channel(derived) == ch
        # Same shape and leader/trailer timing as the capture.
        assert len(derived) == len(raw)
        assert ir_codec.to_pairs(derived)[0] == ir_codec.to_pairs(raw)[0]
        assert ir_codec.to_pairs(derived)[-1] == ir_codec.to_pairs(raw)[-1]
    assert ir_codec.derive_raw(raw, source_ch) == raw


def test_real_darken_ch1_to_ch2_matches_recorded_ch2_bytes(nas_config_v1):
    cmds = nas_config_v1["commands"]
    derived = ir_codec.derive_raw(cmds["DARKEN_LIGHT_CH1"]["raw_data"], 2)
    assert ir_codec.decode_frames(derived) == ir_codec.decode_frames(cmds["DARKEN_LIGHT"]["raw_data"])


def test_unknown_codes_are_not_derivable():
    # Frame 2C 52 55 12 47: known maker, unknown group.
    frame = to_bytes("2C 52 55 12 47")
    bits = [(b >> j) & 1 for b in frame for j in range(8)]
    pairs = [(0x86, 0x42)] + [(0x12, 0x31 if bit else 0x11) for bit in bits] + [(0x11, 0x0B11)]
    raw = ir_codec.from_pairs(pairs)
    assert ir_codec.decode_frames(raw) == [frame]
    assert ir_codec.light_channel(raw) is None
    with pytest.raises(ir_codec.NotDerivable):
        ir_codec.derive_raw(raw, 2)


@pytest.mark.parametrize("raw", ["", "0x00,0x01,0x02", "zz", "0x100,0x00,0x00,0x00"])
def test_malformed_raw(raw):
    with pytest.raises(ir_codec.IRDataError):
        ir_codec.parse_raw(raw)


def test_describe(nas_config_v1):
    d = ir_codec.describe(nas_config_v1["commands"]["DARKEN_LIGHT"]["raw_data"])
    assert d == {"frames": ["2C 52 09 33 3A"], "light_channel": 2}
