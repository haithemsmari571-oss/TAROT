"""REFLECTION BUDGET — the server's copy of the one arithmetic.

MIRROR OF tarot-landing-web/src/features/hall/reflectBudget.ts, line for line.
The two numbers and the two functions below must never drift from that file;
the website computes the same figures for its panel until the server's own
figure reaches it, and a disagreement would show as a countdown that jumps.

A customer in a reading can pause to sit with what she said. She gets two
minutes at the start and two more at every fifteen-minute mark of PAID
session time; unused time banks. Nothing else on the backend may hold a copy
of 120 or 900.

    earned    = GRANT + GRANT * floor(paidSeconds / MARK)
    remaining = max(0, earned - used - live)

where `used` is the reflection time already spent in this reading and `live`
is the seconds of the reflection in progress, if any.
"""

from __future__ import annotations

import math

# Seconds granted at the start and again at every mark.
REFLECT_GRANT_SECONDS = 120

# The mark: every this many seconds of paid session time earns another grant.
REFLECT_MARK_SECONDS = 900


def _whole_seconds(value) -> int:
    """Non-negative whole seconds, the way the frontend coerces its inputs
    (Number.isFinite → Math.max(0, Math.floor(x)))."""
    try:
        v = float(value)
    except (TypeError, ValueError):
        return 0
    if not math.isfinite(v):
        return 0
    return max(0, int(math.floor(v)))


def reflect_earned_seconds(paid_seconds) -> int:
    """Total reflection seconds earned so far for `paid_seconds` of paid
    session time. Never negative, never fractional."""
    paid = _whole_seconds(paid_seconds)
    return REFLECT_GRANT_SECONDS + REFLECT_GRANT_SECONDS * (paid // REFLECT_MARK_SECONDS)


def reflect_remaining_seconds(paid_seconds, used_seconds, live_seconds=0) -> int:
    """What is left to spend: earned minus what was used in earlier
    reflections minus the reflection in progress, floored at zero."""
    used = _whole_seconds(used_seconds) + _whole_seconds(live_seconds)
    return max(0, reflect_earned_seconds(paid_seconds) - used)


def reflect_overdue_seconds(paid_seconds, used_seconds, live_seconds=0) -> int:
    """How far PAST zero the reflection in progress has run (0 while budget
    remains). The monitor ends a reflection a short grace after this turns
    positive, so the customer's own "time is up" beat can play first."""
    used = _whole_seconds(used_seconds) + _whole_seconds(live_seconds)
    return max(0, used - reflect_earned_seconds(paid_seconds))
