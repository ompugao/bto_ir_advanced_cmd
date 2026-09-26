"""Decode and rewrite raw IR data as produced by `bto_advanced_USBIR_cmd -g`.

Raw data is a comma-separated list of bytes ("0x00,0x86,..."). Every two bytes
form a big-endian 16-bit duration, and durations alternate on/off: a leader
pair, one pair per bit, and a trailer pair with a long gap.

Bits are pulse-distance encoded (short off = 0, long off = 1) and sent LSB
first, which covers the AEHA format used by Japanese appliances.

Channel handling only applies to protocols verified against real captures,
listed in LIGHT_PROTOCOLS.
"""

from dataclasses import dataclass
from statistics import median
from typing import Dict, List, Optional, Tuple

Pair = Tuple[int, int]


class IRDataError(ValueError):
    pass


class NotDerivable(ValueError):
    pass


# Panasonic ceiling lights (maker code 2C 52). Frame: maker(2), group, command, checksum
# with checksum = group ^ command. The channel is a 2-bit field in the command
# byte whose position depends on the group; verified on CH1-3 for both groups.
#   group -> (bit shift of the channel field, value of the field on CH1)
LIGHT_PROTOCOLS: Dict[Tuple[int, int], Dict[int, Tuple[int, int]]] = {
    (0x2C, 0x52): {
        0x09: (3, 1),  # on/off/brightness: CH1 0x2B, CH2 0x33, CH3 0x3B (+8)
        0x39: (2, 0),  # colour:            CH1 0x90, CH2 0x94, CH3 0x98 (+4)
    },
}
CHANNELS = (1, 2, 3)


def parse_raw(raw: str) -> List[int]:
    try:
        values = [int(tok.strip(), 0) for tok in raw.strip().split(",") if tok.strip()]
    except ValueError as e:
        raise IRDataError(f"not a list of bytes: {e}") from e
    if not values:
        raise IRDataError("empty IR data")
    if any(not 0 <= v <= 0xFF for v in values):
        raise IRDataError("byte value out of range")
    if len(values) % 4:
        raise IRDataError("length is not a whole number of on/off pairs")
    return values


def to_pairs(raw: str) -> List[Pair]:
    b = parse_raw(raw)
    words = [(b[i] << 8) | b[i + 1] for i in range(0, len(b), 2)]
    return list(zip(words[0::2], words[1::2]))


def from_pairs(pairs: List[Pair]) -> str:
    out = []
    for on, off in pairs:
        for w in (on, off):
            out += [f"0x{w >> 8:02x}", f"0x{w & 0xFF:02x}"]
    return ",".join(out)


@dataclass
class _Frame:
    bit_indices: List[int]  # indices into the pair list, one per bit
    bits: List[int]


def _split_frames(pairs: List[Pair]) -> Tuple[List[_Frame], int]:
    """Returns the frames and the bit unit T (median 'on' length)."""
    if len(pairs) < 3:
        raise IRDataError("too short to contain a frame")
    unit = median(on for on, _ in pairs[1:])
    frames: List[_Frame] = []
    current = _Frame([], [])
    expect_leader = True
    for i, (on, off) in enumerate(pairs):
        if expect_leader:
            if on < 4 * unit:
                raise IRDataError("no leader pulse")
            expect_leader = False
            continue
        if off > 8 * unit:  # trailer / inter-frame gap
            frames.append(current)
            current = _Frame([], [])
            expect_leader = True
            continue
        current.bit_indices.append(i)
        current.bits.append(1 if off > 2 * unit else 0)
    if current.bits:
        frames.append(current)
    return frames, unit


def _bits_to_bytes(bits: List[int]) -> List[int]:
    return [sum(bit << j for j, bit in enumerate(bits[i:i + 8])) for i in range(0, len(bits), 8)]


def decode_frames(raw: str) -> List[List[int]]:
    """Decodes every frame to bytes (LSB first). Raises IRDataError."""
    frames, _ = _split_frames(to_pairs(raw))
    if not frames or any(len(f.bits) % 8 or not f.bits for f in frames):
        raise IRDataError("frame length is not a whole number of bytes")
    return [_bits_to_bytes(f.bits) for f in frames]


def _light_field(frame: List[int]) -> Optional[Tuple[int, int]]:
    if len(frame) != 5:
        return None
    groups = LIGHT_PROTOCOLS.get((frame[0], frame[1]))
    if not groups or frame[2] not in groups or frame[4] != frame[2] ^ frame[3]:
        return None
    return groups[frame[2]]


def light_channel(raw: str) -> Optional[int]:
    """Channel encoded in a known light code, or None if the code isn't recognised."""
    try:
        frames = decode_frames(raw)
    except IRDataError:
        return None
    if any(f != frames[0] for f in frames):
        return None
    field = _light_field(frames[0])
    if not field:
        return None
    shift, ch1_value = field
    channel = ((frames[0][3] >> shift) & 0b11) - ch1_value + 1
    return channel if channel in CHANNELS else None


def with_light_channel(frame: List[int], channel: int) -> List[int]:
    field = _light_field(frame)
    if not field or channel not in CHANNELS:
        raise NotDerivable("not a recognised light code")
    shift, ch1_value = field
    value = channel - 1 + ch1_value
    cmd = (frame[3] & ~(0b11 << shift) & 0xFF) | (value << shift)
    return [frame[0], frame[1], frame[2], cmd, frame[2] ^ cmd]


def derive_raw(raw: str, channel: int) -> str:
    """Rewrites a recognised light code for another channel.

    Only the off-durations of the bits that change are touched, using the
    capture's own 0/1 timings, so the result keeps the original timing.
    """
    if light_channel(raw) is None:
        raise NotDerivable("channel generation is only supported for recognised light codes")
    pairs = to_pairs(raw)
    frames, _ = _split_frames(pairs)
    target = with_light_channel(_bits_to_bytes(frames[0].bits), channel)
    new_bits = [(byte >> j) & 1 for byte in target for j in range(8)]

    offs = {b: [pairs[i][1] for f in frames for i, bit in zip(f.bit_indices, f.bits) if bit == b] for b in (0, 1)}
    if not offs[0] or not offs[1]:
        raise NotDerivable("capture lacks both bit timings")
    off_for = {b: int(median(offs[b])) for b in (0, 1)}

    pairs = list(pairs)
    for f in frames:
        for i, old, new in zip(f.bit_indices, f.bits, new_bits):
            if old != new:
                pairs[i] = (pairs[i][0], off_for[new])
    result = from_pairs(pairs)
    assert light_channel(result) == channel
    return result


def describe(raw: str) -> dict:
    """Summary for the UI: decoded bytes (if any) and the light channel."""
    parse_raw(raw)  # raises on malformed data
    try:
        frames = decode_frames(raw)
    except IRDataError:
        frames = []
    return {
        "frames": [" ".join(f"{b:02X}" for b in f) for f in frames],
        "light_channel": light_channel(raw),
    }
