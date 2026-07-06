"""Rituals strip rotation (Section 5, Step 5).

Shows exactly 4 tasks at a time, chosen per-user from the active pool the user
is still eligible for, rotating every 5 hours. Selection is deterministic per
(user, 5-hour window) so the strip is stable within a window and refreshes on
the boundary — the page reads the same thing on every visit in that window, and
the countdown to the next window is always shown.

The daily card pull and the streak are permanent page fixtures, not part of this
rotation (Section 5).
"""

from datetime import datetime, timezone
from typing import List, Optional

from sqlalchemy.orm import Session

from app.enums.claim_status import ClaimStatus
from app.enums.task_status import TaskStatus
from app.enums.verification_type import VerificationType
from app.models import Claim, Task
from app.services.settings import get_setting_value
from app.services.tasks import check_can_be_paid

# Real production interval is 5 HOURS (Section 5). There is no dev shortcut.
# The admin Settings screen (built later) writes the `rotation_window_hours`
# key; until then this default drives the rotation.
DEFAULT_ROTATION_WINDOW_HOURS = 5
DEFAULT_TASKS_PER_WINDOW = 4


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def get_window_hours(db: Session) -> float:
    """The rotation interval in hours — from admin Settings if set, else 5h."""
    raw = get_setting_value(db, "rotation_window_hours", None)
    try:
        hours = float(raw) if raw is not None else DEFAULT_ROTATION_WINDOW_HOURS
    except (TypeError, ValueError):
        hours = DEFAULT_ROTATION_WINDOW_HOURS
    return hours if hours > 0 else DEFAULT_ROTATION_WINDOW_HOURS


def get_tasks_per_window(db: Session) -> int:
    """How many tasks the strip shows — from admin Settings if set, else 4."""
    raw = get_setting_value(db, "tasks_per_window", None)
    try:
        n = int(float(raw)) if raw is not None else DEFAULT_TASKS_PER_WINDOW
    except (TypeError, ValueError):
        n = DEFAULT_TASKS_PER_WINDOW
    return n if n > 0 else DEFAULT_TASKS_PER_WINDOW


def window_index(now: datetime, hours: float) -> int:
    """Which rotation window we're in (integer, counts from the epoch)."""
    return int(now.timestamp() // (hours * 3600))


def next_rotation_at(now: datetime, hours: float) -> datetime:
    """UTC time the current window ends / the strip next refreshes."""
    nxt = (window_index(now, hours) + 1) * hours * 3600
    return datetime.fromtimestamp(nxt, tz=timezone.utc)


def _has_pending_claim(db: Session, user_id: int, task_id: int) -> bool:
    return (
        db.query(Claim.id)
        .filter(
            Claim.user_id == user_id,
            Claim.task_id == task_id,
            Claim.status == ClaimStatus.PENDING,
        )
        .first()
        is not None
    )


def get_rotation(
    db: Session, user_id: int, now: Optional[datetime] = None
) -> dict:
    """The 4-task strip for this user + the countdown to the next rotation."""
    now = now or _utcnow()
    hours = get_window_hours(db)
    tasks_per_window = get_tasks_per_window(db)

    # Candidate pool: active tasks the user can currently be paid for (this
    # applies the 24h guard + frequency + one-time-already-done exclusions).
    active_tasks = (
        db.query(Task).filter(Task.status == TaskStatus.ACTIVE).all()
    )
    eligible = []
    for task in active_tasks:
        ok, _ = check_can_be_paid(db, user_id, task, now=now)
        if ok:
            eligible.append(task)

    # Deterministic weighted selection, stable within the window.
    import random

    rng = random.Random(f"{user_id}:{window_index(now, hours)}")
    # Expand by rotation_weight so heavier tasks show more often, then sample
    # distinct tasks up to the window size.
    pool: List[Task] = []
    for task in eligible:
        pool.extend([task] * max(int(task.rotation_weight or 1), 1))
    rng.shuffle(pool)

    chosen: List[Task] = []
    seen = set()
    for task in pool:
        if task.id in seen:
            continue
        seen.add(task.id)
        chosen.append(task)
        if len(chosen) >= tasks_per_window:
            break

    rituals = []
    for task in chosen:
        is_manual = task.verification_type in (
            VerificationType.SCREENSHOT,
            VerificationType.HANDLE,
        )
        rituals.append(
            {
                "id": task.id,
                "title": task.title,
                "description": task.description,
                "icon": task.icon,
                "reward": float(task.reward) if task.reward is not None else 0,
                "verification_type": task.verification_type.value,
                "is_manual": is_manual,
                "pending": _has_pending_claim(db, user_id, task.id),
            }
        )

    nxt = next_rotation_at(now, hours)
    return {
        "rituals": rituals,
        "next_rotation_at": nxt.isoformat(),
        "seconds_to_rotation": max(int((nxt - now).total_seconds()), 0),
        "window_hours": hours,
        "tasks_per_window": tasks_per_window,
    }
