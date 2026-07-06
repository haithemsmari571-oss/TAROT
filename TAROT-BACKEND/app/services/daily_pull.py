"""Daily card pull mechanics (Step 4).

One pull per client per day, gated on date-of-birth (needed to choose the
zodiac content). The reward is a weighted-random 1-10 Stardust — common at the
low end, 10 genuinely rare, averaging ~3.3 — and is credited server-side through
the earned-Stardust ledger (Step 1). The client never sends or sees the amount
until it lands.

Streak: consecutive days build a 7-day cycle; completing a multiple of 7 awards
a +10 bonus. Both the pull reward and the streak bonus use idempotency keys so a
retried request can never double-pay.
"""

import random
from datetime import date, datetime, timedelta, timezone
from typing import Optional

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.exceptions.constellation import (
    AlreadyPulledTodayError,
    BirthdateRequiredError,
)
from app.exceptions.transactions import DuplicateTransactionError
from app.logging_config import get_logger
from app.models import DailyPull, User
from app.services.daily_content import get_daily_content
from app.services.stardust_rewards import credit_earned_stardust, get_stardust_breakdown
from app.utils.zodiac_calculator import get_zodiac_sign_from_date

logger = get_logger(__name__)

# Weighted reward table for the daily pull. Low values common, 10 rare.
# Expected value ≈ 3.27 ⭐ (within the target 3-4 average).
REWARD_WEIGHTS = {
    1: 22, 2: 22, 3: 20, 4: 12, 5: 9, 6: 6, 7: 4, 8: 2, 9: 2, 10: 1,
}
STREAK_CYCLE = 7
STREAK_BONUS = 10  # ⭐ awarded on completing each 7-day cycle


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def roll_reward(rng: Optional[random.Random] = None) -> int:
    """Weighted-random 1-10 ⭐. Always within bounds. Server-side only."""
    rng = rng or random
    values = list(REWARD_WEIGHTS.keys())
    weights = list(REWARD_WEIGHTS.values())
    return int(rng.choices(values, weights=weights, k=1)[0])


def _last_pull_before(db: Session, user_id: int, on_date: date) -> Optional[DailyPull]:
    return (
        db.query(DailyPull)
        .filter(DailyPull.user_id == user_id, DailyPull.pull_date < on_date)
        .order_by(DailyPull.pull_date.desc())
        .first()
    )


def get_pull_for_date(db: Session, user_id: int, on_date: date) -> Optional[DailyPull]:
    return (
        db.query(DailyPull)
        .filter(DailyPull.user_id == user_id, DailyPull.pull_date == on_date)
        .first()
    )


def _compute_streak(db: Session, user_id: int, on_date: date) -> int:
    """Total consecutive days including today's pull."""
    last = _last_pull_before(db, user_id, on_date)
    if last and last.pull_date == on_date - timedelta(days=1):
        return int(last.streak_length) + 1
    return 1  # first ever, or a gap broke the streak


def week_position(streak_length: int) -> int:
    """Position (1-7) within the current 7-day cycle."""
    return ((int(streak_length) - 1) % STREAK_CYCLE) + 1


def get_streak_status(db: Session, user_id: int, on_date: date) -> dict:
    """Streak info for display without pulling. Reflects today's pull if done,
    otherwise the streak the next pull would build on."""
    today = get_pull_for_date(db, user_id, on_date)
    if today:
        length = int(today.streak_length)
    else:
        last = _last_pull_before(db, user_id, on_date)
        if last and last.pull_date == on_date - timedelta(days=1):
            length = int(last.streak_length)  # streak still alive, today not pulled yet
        else:
            length = 0
    pos = week_position(length) if length else 0
    return {
        "length": length,
        "week_position": pos,
        "days_to_bonus": (STREAK_CYCLE - pos) if length else STREAK_CYCLE,
        "cycle": STREAK_CYCLE,
        "bonus": STREAK_BONUS,
    }


def perform_daily_pull(
    db: Session,
    user: User,
    now: Optional[datetime] = None,
    rng: Optional[random.Random] = None,
) -> dict:
    """Do today's pull: validate DOB + once-per-day, roll the reward, credit it
    (plus any streak bonus) through the ledger, and return the card + result.

    Raises:
        BirthdateRequiredError, AlreadyPulledTodayError.
    """
    now = now or _utcnow()
    on_date = now.date()

    if user.date_of_birth is None:
        raise BirthdateRequiredError()

    if get_pull_for_date(db, user.id, on_date):
        raise AlreadyPulledTodayError()

    sign = get_zodiac_sign_from_date(user.date_of_birth)
    content = get_daily_content(db, sign, on_date)

    streak_length = _compute_streak(db, user.id, on_date)
    pos = week_position(streak_length)
    reward = roll_reward(rng)
    is_bonus_day = streak_length % STREAK_CYCLE == 0
    bonus = STREAK_BONUS if is_bonus_day else 0

    # Reserve the once-per-day slot first (unique constraint is the real guard).
    pull = DailyPull(
        user_id=user.id,
        pull_date=on_date,
        card_key=content.card_key,
        reward=reward,
        streak_length=streak_length,
        week_position=pos,
        bonus_awarded=bonus,
    )
    db.add(pull)
    try:
        db.commit()
    except IntegrityError:
        # A concurrent request beat us to today's pull.
        db.rollback()
        raise AlreadyPulledTodayError()
    db.refresh(pull)

    # Credit through the earned ledger (idempotent per user+day). If the credit
    # was already recorded (idempotency key seen), the reward is already in the
    # ledger — treat as done rather than failing the pull.
    try:
        credit_earned_stardust(
            db,
            user.id,
            reward,
            description=f"Daily card pull — {content.card_name}",
            source=f"daily_pull:{on_date.isoformat()}",
            idempotency_key=f"daily_pull:{user.id}:{on_date.isoformat()}",
            now=now,
        )
    except DuplicateTransactionError:
        logger.info("daily_pull_reward_already_credited", user_id=user.id, on_date=on_date.isoformat())
    if bonus:
        try:
            credit_earned_stardust(
                db,
                user.id,
                bonus,
                description="7-day practice streak bonus",
                source="streak_bonus",
                idempotency_key=f"streak_bonus:{user.id}:{streak_length}",
                now=now,
            )
        except DuplicateTransactionError:
            logger.info("streak_bonus_already_credited", user_id=user.id, streak_length=streak_length)

    logger.info(
        "daily_pull_completed",
        user_id=user.id,
        reward=reward,
        bonus=bonus,
        streak_length=streak_length,
        card=content.card_name,
    )

    return {
        "reward": reward,
        "bonus": bonus,
        "streak": {
            "length": streak_length,
            "week_position": pos,
            "days_to_bonus": STREAK_CYCLE - pos,
            "cycle": STREAK_CYCLE,
            "bonus": STREAK_BONUS,
        },
        "card": {
            "card_key": content.card_key,
            "card_name": content.card_name,
            "interpretation": content.interpretation,
            "manifestation": content.manifestation,
            "ritual": content.ritual,
            "quote_line": content.quote_line,
        },
        "balance": get_stardust_breakdown(db, user.id, now=now),
    }
