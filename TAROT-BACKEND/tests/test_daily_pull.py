"""Daily card pull: once-per-day, DOB fallback, weighted reward, streak."""

import random
from datetime import date, datetime, timedelta, timezone

import pytest

from app.exceptions.constellation import (
    AlreadyPulledTodayError,
    BirthdateRequiredError,
)
from app.services import daily_pull as dp
from app.services import stardust_rewards as sr


def _dob_user(make_user):
    user = make_user()
    user.date_of_birth = date(1990, 7, 15)  # Cancer
    return user


def _at(day_offset=0, hour=12):
    """A fixed UTC moment, offset by whole days."""
    base = datetime(2026, 7, 6, hour, 0, tzinfo=timezone.utc)
    return base + timedelta(days=day_offset)


# ── Once per day ─────────────────────────────────────────────────────────────
def test_pull_once_per_day(db, make_user):
    user = _dob_user(make_user)
    now = _at(0)

    result = dp.perform_daily_pull(db, user, now=now, rng=random.Random(1))
    assert result["reward"] >= 1
    assert result["card"]["card_name"]

    # Second pull the same day is refused.
    with pytest.raises(AlreadyPulledTodayError):
        dp.perform_daily_pull(db, user, now=_at(0, hour=20), rng=random.Random(2))


# ── DOB fallback gate ────────────────────────────────────────────────────────
def test_pull_requires_dob(db, make_user):
    user = make_user()  # no date_of_birth
    with pytest.raises(BirthdateRequiredError):
        dp.perform_daily_pull(db, user, now=_at(0))


# ── Weighted reward bounds + distribution ────────────────────────────────────
def test_roll_reward_always_in_bounds():
    rng = random.Random(42)
    for _ in range(5000):
        r = dp.roll_reward(rng)
        assert 1 <= r <= 10


def test_roll_reward_distribution_low_common_ten_rare():
    rng = random.Random(7)
    rolls = [dp.roll_reward(rng) for _ in range(20000)]
    avg = sum(rolls) / len(rolls)
    assert 2.8 <= avg <= 4.0  # target ~3-4 average
    low = sum(1 for r in rolls if r <= 3) / len(rolls)
    tens = sum(1 for r in rolls if r == 10) / len(rolls)
    assert low > 0.5  # 1-3 is common
    assert tens < 0.05  # 10 is rare


def test_pull_credits_reward_to_earned_ledger(db, make_user):
    user = _dob_user(make_user)
    now = _at(0)
    result = dp.perform_daily_pull(db, user, now=now, rng=random.Random(3))
    assert sr.get_earned_stardust_balance(db, user.id, now=now) == result["reward"]


# ── Streak rollover ──────────────────────────────────────────────────────────
def test_streak_increments_on_consecutive_days(db, make_user):
    user = _dob_user(make_user)
    for i in range(3):
        res = dp.perform_daily_pull(db, user, now=_at(i), rng=random.Random(i))
        assert res["streak"]["length"] == i + 1


def test_streak_resets_after_a_gap(db, make_user):
    user = _dob_user(make_user)
    dp.perform_daily_pull(db, user, now=_at(0), rng=random.Random(1))
    dp.perform_daily_pull(db, user, now=_at(1), rng=random.Random(2))  # streak 2
    # Skip day 2 entirely; pull on day 3 → streak resets to 1.
    res = dp.perform_daily_pull(db, user, now=_at(3), rng=random.Random(3))
    assert res["streak"]["length"] == 1


def test_day_seven_awards_bonus(db, make_user):
    user = _dob_user(make_user)
    results = [
        dp.perform_daily_pull(db, user, now=_at(i), rng=random.Random(100 + i))
        for i in range(7)
    ]
    # Days 1-6: no bonus. Day 7: +10 and week position 7.
    assert all(r["bonus"] == 0 for r in results[:6])
    day7 = results[6]
    assert day7["bonus"] == 10
    assert day7["streak"]["length"] == 7
    assert day7["streak"]["week_position"] == 7

    # Earned balance = sum of 7 daily rewards + the 10 bonus.
    expected = sum(r["reward"] for r in results) + 10
    assert sr.get_earned_stardust_balance(db, user.id, now=_at(6)) == expected

    # Day 8 starts a new cycle at position 1, no bonus.
    day8 = dp.perform_daily_pull(db, user, now=_at(7), rng=random.Random(200))
    assert day8["bonus"] == 0
    assert day8["streak"]["length"] == 8
    assert day8["streak"]["week_position"] == 1


# ── State machine: available -> revealed -> tomorrow ─────────────────────────
def test_state_machine_available_revealed_tomorrow(db, make_user):
    user = _dob_user(make_user)
    today = _at(0).date()
    tomorrow = _at(1).date()

    # AVAILABLE: no pull record yet.
    assert dp.get_pull_for_date(db, user.id, today) is None

    # REVEALED: after pulling, a record exists and carries the reward.
    result = dp.perform_daily_pull(db, user, now=_at(0), rng=random.Random(1))
    pull = dp.get_pull_for_date(db, user.id, today)
    assert pull is not None
    assert float(pull.reward) == result["reward"]

    # PERSISTS: re-reading the same day still returns the revealed record
    # (this is what keeps the card face-up across refreshes / re-logins).
    again = dp.get_pull_for_date(db, user.id, today)
    assert again is not None and again.id == pull.id

    # TOMORROW: a new day is available again (no record yet).
    assert dp.get_pull_for_date(db, user.id, tomorrow) is None


# ── Content is stable per sign per day ───────────────────────────────────────
def test_daily_content_stable_per_sign_day(db, make_user):
    from app.services.daily_content import get_daily_content

    a = get_daily_content(db, "Cancer", date(2026, 7, 6))
    b = get_daily_content(db, "Cancer", date(2026, 7, 6))
    assert a.id == b.id  # same row, not regenerated
