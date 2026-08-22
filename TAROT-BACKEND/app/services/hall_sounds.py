"""Hall sounds: the owner's ambient loops, stored beside the reader photographs.

Nothing here trusts the client. The declared content type is ignored; the
bytes are sniffed (an MP3 is an optional ID3 tag followed by real MPEG audio
frames; an OGG is "OggS" pages with a Vorbis or Opus identification header),
the duration is read from those same frames and pages, and the stored file is
named from 24 random bytes so it can neither collide nor be guessed. All of it
with the standard library: no decoder, no new dependency.
"""

from __future__ import annotations

import hashlib
import re
import secrets
import struct
from dataclasses import dataclass
from pathlib import Path

from sqlalchemy.orm import Session

from app.config import get_app_settings
from app.models.hall_sound import HallSound

# A 30-60 s ambient loop exported as 320 kbps MP3 is 1.2-2.4 MB; a Vorbis q8
# export is smaller. 12 MB is five times that ceiling: room for a long loop or
# a generous export, while staying a download a phone on a poor connection can
# finish before the reading starts, and small enough to refuse an accidental WAV.
MAX_HALL_SOUND_BYTES = 12 * 1024 * 1024

MEDIA_URL_PREFIX = "/api/media/uploads/"


class HallSoundError(Exception):
    def __init__(self, status: int, message: str) -> None:
        super().__init__(message)
        self.status = status
        self.message = message


@dataclass(frozen=True)
class SniffResult:
    content_type: str      # "audio/mpeg" | "audio/ogg"
    extension: str         # ".mp3" | ".ogg"
    duration_seconds: float


# ---------------------------------------------------------------- MP3 --------
# (version, layer) -> kbps table indexed by the 4-bit bitrate field
_MP3_BITRATES = {
    (3, 1): [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0],   # MPEG1 L3
    (2, 1): [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160, 0],        # MPEG2 L3
    (0, 1): [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160, 0],        # MPEG2.5 L3
}
_MP3_SAMPLE_RATES = {3: [44100, 48000, 32000], 2: [22050, 24000, 16000], 0: [11025, 12000, 8000]}


def _id3v2_size(data: bytes) -> int:
    """Bytes occupied by a leading ID3v2 tag (0 if absent)."""
    if len(data) < 10 or data[:3] != b"ID3":
        return 0
    flags = data[5]
    size = ((data[6] & 0x7F) << 21) | ((data[7] & 0x7F) << 14) | ((data[8] & 0x7F) << 7) | (data[9] & 0x7F)
    return 10 + size + (10 if flags & 0x10 else 0)  # footer, if flagged


def _mp3_frame(data: bytes, pos: int) -> tuple[int, int, int] | None:
    """Parse a Layer III frame header at pos -> (frame_length, samples, sample_rate), or None."""
    if pos + 4 > len(data):
        return None
    h = data[pos:pos + 4]
    if h[0] != 0xFF or (h[1] & 0xE0) != 0xE0:
        return None
    version = (h[1] >> 3) & 0x03        # 3=MPEG1, 2=MPEG2, 0=MPEG2.5, 1=reserved
    layer = (h[1] >> 1) & 0x03          # 1 = Layer III
    if version == 1 or layer != 1:
        return None
    bitrate_idx = (h[2] >> 4) & 0x0F
    sr_idx = (h[2] >> 2) & 0x03
    padding = (h[2] >> 1) & 0x01
    if bitrate_idx in (0, 15) or sr_idx == 3:
        return None
    kbps = _MP3_BITRATES[(version, layer)][bitrate_idx]
    sr = _MP3_SAMPLE_RATES[version][sr_idx]
    samples = 1152 if version == 3 else 576
    length = (samples // 8) * kbps * 1000 // sr + padding
    return (length, samples, sr) if length > 4 else None


def _mp3_duration(data: bytes) -> float | None:
    pos = _id3v2_size(data)
    first = None
    # tolerate a little junk before the first sync; demand two consecutive
    # valid frames so a stray 0xFF in a PNG can never pass as audio
    for p in range(pos, min(len(data) - 4, pos + 4096)):
        f = _mp3_frame(data, p)
        if f and _mp3_frame(data, p + f[0]):
            first = p
            break
    if first is None:
        return None
    length, samples, sr = _mp3_frame(data, first)
    # a Xing/Info header in the first frame carries the frame count (VBR and LAME CBR)
    for tag in (b"Xing", b"Info"):
        i = data.find(tag, first, first + length)
        if i != -1 and i + 12 <= len(data):
            flags = struct.unpack(">I", data[i + 4:i + 8])[0]
            if flags & 0x1:
                frames = struct.unpack(">I", data[i + 8:i + 12])[0]
                if frames > 0:
                    return frames * samples / sr
    # otherwise walk every frame
    total = 0.0
    p = first
    n = 0
    while True:
        f = _mp3_frame(data, p)
        if not f:
            break
        total += f[1] / f[2]
        p += f[0]
        n += 1
    return total if n > 0 else None


# ---------------------------------------------------------------- OGG --------
def _ogg_duration(data: bytes) -> float | None:
    if data[:4] != b"OggS":
        return None
    head = data[:4096]
    vi = head.find(b"\x01vorbis")
    if vi != -1 and vi + 16 <= len(head):
        rate = struct.unpack("<I", head[vi + 12:vi + 16])[0]
        pre_skip = 0
    else:
        oi = head.find(b"OpusHead")
        if oi == -1 or oi + 16 > len(head):
            return None
        pre_skip = struct.unpack("<H", head[oi + 10:oi + 12])[0]
        rate = 48000  # Opus granule positions are always at 48 kHz
    if not rate:
        return None
    # the last page's granule position is the total sample count
    last = data.rfind(b"OggS")
    while last != -1 and last + 14 > len(data):
        last = data.rfind(b"OggS", 0, last)
    if last == -1:
        return None
    granule = struct.unpack("<q", data[last + 6:last + 14])[0]
    if granule <= 0:
        return None
    return max(0.0, (granule - pre_skip) / rate)


def sniff_hall_sound(data: bytes) -> SniffResult:
    """Identify the bytes as MP3 or OGG and read their duration, or raise."""
    if data[:4] == b"OggS":
        d = _ogg_duration(data)
        if d is None or d <= 0:
            raise HallSoundError(415, "That OGG file has no Vorbis or Opus audio in it.")
        return SniffResult("audio/ogg", ".ogg", d)
    d = _mp3_duration(data)
    if d is not None and d > 0:
        return SniffResult("audio/mpeg", ".mp3", d)
    raise HallSoundError(
        415,
        "Upload an MP3 or OGG audio file. The bytes of this file are neither, whatever its name says.",
    )


# ------------------------------------------------------------- storage -------
_SLUG = re.compile(r"[^a-z0-9]+")


def make_key(db: Session, name: str) -> str:
    base = _SLUG.sub("-", name.strip().lower()).strip("-")[:48] or "sound"
    key = base
    n = 2
    while db.query(HallSound).filter(HallSound.key == key).first() is not None:
        key = f"{base}-{n}"
        n += 1
    return key


def media_dir() -> Path:
    d = get_app_settings().MEDIA_DIR
    d.mkdir(parents=True, exist_ok=True)
    return d


def public_url(sound: HallSound) -> str:
    return MEDIA_URL_PREFIX + sound.file_path


def store_hall_sound(
    db: Session,
    *,
    data: bytes,
    name: str,
    original_filename: str | None,
    sort_order: int,
    enabled: bool,
    level: float,
) -> HallSound:
    if not data:
        raise HallSoundError(400, "The selected file is empty.")
    if len(data) > MAX_HALL_SOUND_BYTES:
        raise HallSoundError(
            413,
            f"Ambient loops must be no larger than {MAX_HALL_SOUND_BYTES // (1024 * 1024)} MB. "
            "Export a shorter loop or a lower bitrate.",
        )
    name = name.strip()
    if not name or len(name) > 80:
        raise HallSoundError(400, "Give the sound a name of up to 80 characters.")
    if not (0.0 <= level <= 1.0):
        raise HallSoundError(400, "Level must be between 0 and 1.")
    sniffed = sniff_hall_sound(data)

    # 24 random bytes -> 32 url-safe characters: cannot collide, cannot be guessed.
    filename = f"hall_{secrets.token_urlsafe(24)}{sniffed.extension}"
    target = media_dir() / filename
    tmp = target.with_suffix(target.suffix + ".partial")
    tmp.write_bytes(data)
    tmp.replace(target)

    sound = HallSound(
        key=make_key(db, name),
        name=name,
        sort_order=sort_order,
        enabled=enabled,
        file_path=filename,
        content_type=sniffed.content_type,
        size_bytes=len(data),
        sha256=hashlib.sha256(data).hexdigest(),
        duration_seconds=round(sniffed.duration_seconds, 3),
        level=level,
        original_filename=(original_filename or "")[:255] or None,
    )
    try:
        db.add(sound)
        db.commit()
    except Exception:
        db.rollback()
        target.unlink(missing_ok=True)
        raise
    db.refresh(sound)
    return sound


def delete_hall_sound(db: Session, sound: HallSound) -> None:
    """Row first, then file: a half-failed delete can never leave a listed
    sound pointing at nothing."""
    path = media_dir() / sound.file_path
    db.delete(sound)
    db.commit()
    path.unlink(missing_ok=True)


def list_all(db: Session) -> list[HallSound]:
    return db.query(HallSound).order_by(HallSound.sort_order.asc(), HallSound.id.asc()).all()


def list_enabled(db: Session) -> list[HallSound]:
    return (
        db.query(HallSound)
        .filter(HallSound.enabled.is_(True))
        .order_by(HallSound.sort_order.asc(), HallSound.id.asc())
        .all()
    )
