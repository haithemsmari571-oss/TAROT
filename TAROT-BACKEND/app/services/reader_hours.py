"""Daily reader availability in UK civil time, for roster/profile display only."""

from dataclasses import dataclass
from datetime import date, datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo


UK_TIME = ZoneInfo("Europe/London")


@dataclass(frozen=True)
class ReaderAvailability:
    is_online: bool
    next_online_at: datetime | None


def validate_online_hours(online_from: time | None, online_to: time | None) -> None:
    if (online_from is None) != (online_to is None):
        raise ValueError("Provide both online_from and online_to, or leave both empty")
    if online_from is None:
        return
    if online_from.tzinfo is not None or online_to.tzinfo is not None:
        raise ValueError("Reader hours are UK local times without a fixed UTC offset")
    if online_from == online_to:
        raise ValueError("Opening and closing times must differ; leave both empty for always online")


def _boundary(day: date, clock: time, *, closing: bool = False) -> datetime:
    """Resolve a daily boundary to UTC, including the UK clock changes.

    A repeated opening uses its first occurrence, a repeated closing its last:
    the reader stays online across the repeated hour. A skipped boundary moves
    to the first real instant after the gap, never to an imaginary UK timestamp.
    """
    wall = datetime.combine(day, clock)
    candidates = sorted({
        wall.replace(tzinfo=UK_TIME, fold=fold).astimezone(timezone.utc)
        for fold in (0, 1)
    })
    valid = [
        candidate for candidate in candidates
        if candidate.astimezone(UK_TIME).replace(tzinfo=None) == wall
    ]
    if valid:
        return valid[-1] if closing else valid[0]

    # The two possible offsets bracket the spring-forward gap. Locate its end
    # precisely; shifting by a fixed hour would miss the first online instant.
    lower, upper = candidates
    while upper - lower > timedelta(microseconds=1):
        middle = lower + (upper - lower) // 2
        if middle.astimezone(UK_TIME).replace(tzinfo=None) < wall:
            lower = middle
        else:
            upper = middle
    return upper


def reader_availability(
    online_from: time | None, online_to: time | None, *, now: datetime | None = None
) -> ReaderAvailability:
    """Opening is inclusive, closing exclusive; next_online_at is null if online.

    Compare actual instants in UTC so overnight windows grow/shrink correctly
    through BST changes. Returned opening timestamps carry the UK UTC offset.
    ``now`` permits explicit historical/future evaluations without changing the
    server clock; normal API reads always use the current instant.
    """
    validate_online_hours(online_from, online_to)
    if online_from is None:
        return ReaderAvailability(True, None)
    now = now if now is not None else datetime.now(timezone.utc)
    if now.tzinfo is None or now.utcoffset() is None:
        raise ValueError("now must include a timezone")
    instant = now.astimezone(timezone.utc)
    today = instant.astimezone(UK_TIME).date()
    windows = []
    for offset in (-1, 0, 1, 2):
        day = today + timedelta(days=offset)
        closing_day = day + timedelta(days=int(online_to < online_from))
        opening = _boundary(day, online_from)
        closing = _boundary(closing_day, online_to, closing=True)
        if opening < closing:  # A window entirely inside the skipped hour is empty.
            windows.append((opening, closing))
    if any(opening <= instant < closing for opening, closing in windows):
        return ReaderAvailability(True, None)
    next_opening = min(opening for opening, _ in windows if opening > instant)
    return ReaderAvailability(False, next_opening.astimezone(UK_TIME))
