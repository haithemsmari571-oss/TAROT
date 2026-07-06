"""Earned-Stardust ledger: crediting, the 50% cap, and 30-day expiry."""

from datetime import timedelta

import pytest

from app.enums.transaction_type import TransactionType
from app.exceptions.transactions import (
    DuplicateTransactionError,
    InvalidTransactionAmountError,
)
from app.models import StardustLot, Transaction
from app.services import stardust_rewards as sr


# ── Crediting ────────────────────────────────────────────────────────────────
def test_credit_creates_lot_and_earn_transaction(db, make_user):
    user = make_user()
    now = sr._utcnow()

    lot = sr.credit_earned_stardust(
        db, user.id, 10, "Reward: daily pull", source="task:daily_pull", now=now
    )

    assert sr.get_earned_stardust_balance(db, user.id, now=now) == 10
    assert lot.remaining == 10
    # Expires 30 days after credit.
    assert (lot.expires_at - lot.credited_at) == timedelta(days=sr.EARNED_STARDUST_TTL_DAYS)

    txn = db.query(Transaction).filter(Transaction.id == lot.transaction_id).one()
    assert txn.transaction_type == TransactionType.EARN
    assert txn.amount == 10


def test_credit_does_not_touch_purchased_balance(db, make_user):
    user = make_user(balance=100, credit_balance=5)
    sr.credit_earned_stardust(db, user.id, 20, "Reward")

    db.refresh(user)
    # Purchased balance and legacy credit are untouched by earned Stardust.
    assert float(user.balance) == 100
    assert float(user.credit_balance) == 5
    assert sr.get_earned_stardust_balance(db, user.id) == 20


def test_credit_is_idempotent(db, make_user):
    user = make_user()
    sr.credit_earned_stardust(db, user.id, 10, "Reward", idempotency_key="claim:1")

    with pytest.raises(DuplicateTransactionError):
        sr.credit_earned_stardust(db, user.id, 10, "Reward", idempotency_key="claim:1")

    # Only the first award stuck.
    assert sr.get_earned_stardust_balance(db, user.id) == 10
    assert db.query(StardustLot).filter(StardustLot.user_id == user.id).count() == 1


def test_credit_rejects_nonpositive(db, make_user):
    user = make_user()
    with pytest.raises(InvalidTransactionAmountError):
        sr.credit_earned_stardust(db, user.id, 0, "Reward")


# ── The 50% redemption cap ───────────────────────────────────────────────────
def test_max_earned_redeemable_is_half():
    assert sr.max_earned_redeemable(100) == 50
    assert sr.max_earned_redeemable(9) == 4.5
    assert sr.max_earned_redeemable(0) == 0


def test_redeem_capped_at_50pct_of_order(db, make_user):
    user = make_user()
    now = sr._utcnow()
    sr.credit_earned_stardust(db, user.id, 100, "Reward", now=now)

    # Order of £40 → earned may cover at most £20.
    redeemed = sr.redeem_earned_stardust(db, user.id, 40, "Order #1", now=now)

    assert redeemed == 20
    assert sr.get_earned_stardust_balance(db, user.id, now=now) == 80


def test_redeem_limited_by_available_when_below_cap(db, make_user):
    user = make_user()
    now = sr._utcnow()
    sr.credit_earned_stardust(db, user.id, 5, "Reward", now=now)

    # Cap would be £50 but the user only has £5 earned.
    redeemed = sr.redeem_earned_stardust(db, user.id, 100, "Order", now=now)

    assert redeemed == 5
    assert sr.get_earned_stardust_balance(db, user.id, now=now) == 0


def test_redeem_spends_soonest_to_expire_first(db, make_user):
    user = make_user()
    now = sr._utcnow()
    # Older lot (expires sooner) and newer lot (expires later).
    old_lot = sr.credit_earned_stardust(
        db, user.id, 30, "Old", now=now - timedelta(days=20)
    )
    new_lot = sr.credit_earned_stardust(db, user.id, 30, "New", now=now)

    # Order £40 → cap £20, all should come from the soonest-to-expire (old) lot.
    sr.redeem_earned_stardust(db, user.id, 40, "Order", now=now)

    db.refresh(old_lot)
    db.refresh(new_lot)
    assert old_lot.remaining == 10  # 30 - 20
    assert new_lot.remaining == 30  # untouched


# ── 30-day expiry ────────────────────────────────────────────────────────────
def test_expired_lot_excluded_from_balance_before_sweep(db, make_user):
    user = make_user()
    now = sr._utcnow()
    # Credited 31 days ago → already past its 30-day life.
    sr.credit_earned_stardust(db, user.id, 10, "Reward", now=now - timedelta(days=31))

    # Balance read as of "now" already ignores the dead lot.
    assert sr.get_earned_stardust_balance(db, user.id, now=now) == 0


def test_expire_forfeits_and_writes_expire_row(db, make_user):
    user = make_user()
    now = sr._utcnow()
    lot = sr.credit_earned_stardust(
        db, user.id, 10, "Reward", now=now - timedelta(days=31)
    )

    result = sr.expire_earned_stardust(db, now=now)

    assert result == {"lots_expired": 1, "total_forfeited": 10}
    db.refresh(lot)
    assert lot.remaining == 0
    assert lot.is_expired is True

    expire_txn = (
        db.query(Transaction)
        .filter(
            Transaction.user_id == user.id,
            Transaction.transaction_type == TransactionType.EXPIRE,
        )
        .one()
    )
    assert expire_txn.amount == 10


def test_expire_is_idempotent(db, make_user):
    user = make_user()
    now = sr._utcnow()
    sr.credit_earned_stardust(db, user.id, 10, "Reward", now=now - timedelta(days=31))

    first = sr.expire_earned_stardust(db, now=now)
    second = sr.expire_earned_stardust(db, now=now)

    assert first["lots_expired"] == 1
    assert second == {"lots_expired": 0, "total_forfeited": 0}
    # Exactly one EXPIRE row, no double forfeiture.
    assert (
        db.query(Transaction)
        .filter(Transaction.transaction_type == TransactionType.EXPIRE)
        .count()
        == 1
    )


def test_unexpired_lot_is_not_swept(db, make_user):
    user = make_user()
    now = sr._utcnow()
    sr.credit_earned_stardust(db, user.id, 10, "Reward", now=now)  # fresh

    result = sr.expire_earned_stardust(db, now=now)

    assert result["lots_expired"] == 0
    assert sr.get_earned_stardust_balance(db, user.id, now=now) == 10


# ── Breakdown for display ────────────────────────────────────────────────────
def test_breakdown_reports_buckets_and_expiring_soon(db, make_user):
    user = make_user(balance=100, credit_balance=10)
    now = sr._utcnow()
    # One lot expiring in 3 days (within the 7-day warning window)…
    sr.credit_earned_stardust(
        db, user.id, 8, "Soon", now=now - timedelta(days=27)
    )
    # …and one fresh lot (not expiring soon).
    sr.credit_earned_stardust(db, user.id, 12, "Fresh", now=now)

    b = sr.get_stardust_breakdown(db, user.id, now=now)

    assert b["purchased"] == 110  # paid balance + legacy free credit
    assert b["earned"] == 20
    assert b["earned_expiring_soon"] == 8
    assert b["total"] == 130
