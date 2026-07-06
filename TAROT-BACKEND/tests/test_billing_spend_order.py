"""Per-minute reading debit spend order.

The PM rule (revised): earned Stardust spends at FULL value (1 ⭐ = £1, no cap),
and is consumed FIRST — soonest-to-expire lot first — then welcome/gift credit,
then purchased balance. Totals and the charged amount are unchanged; only which
bucket funds each minute changes.

Critical safety property exercised here: with NO earned lots the debit behaves
exactly like the pre-existing credit->paid logic, so every prior billing
scenario is untouched.
"""

import json
from datetime import timedelta

import pytest

from app.enums.transaction_type import TransactionType
from app.exceptions.transactions import InsufficientBalanceError
from app.models import StardustLot, Transaction
from app.services import stardust_rewards as sr
from app.services.transactions import create_debit_transaction

# Four representative reader per-minute charges, to the penny.
RATES_PER_MINUTE = [2.40, 3.60, 5.20, 1.99]


def _earn(db, user_id, amount, now, source="task:test"):
    """Award an earned lot with an explicit credit time (controls expiry order)."""
    return sr.credit_earned_stardust(
        db,
        user_id,
        amount,
        "Reward",
        source=source,
        idempotency_key=f"{source}:{now.isoformat()}:{amount}",
        now=now,
    )


def _debit_meta(txn) -> dict:
    return json.loads(txn.transaction_metadata)


# ── Earned = 0 → identical to the legacy credit-then-paid behaviour ───────────
def test_no_earned_spends_credit_then_paid_like_before(db, make_user):
    user = make_user(balance=10, credit_balance=1)

    txn = create_debit_transaction(db, user.id, 5, "Session #1 - Minute 1")

    db.refresh(user)
    assert float(user.credit_balance) == 0  # 1 credit spent first
    assert float(user.balance) == 6  # then 4 from paid
    meta = _debit_meta(txn)
    assert meta["earned_spent"] == 0
    assert meta["credit_spent"] == 1
    assert meta["paid_spent"] == 4
    assert meta["earned_lots"] == []
    # Ledger reconciles as one running balance.
    assert round(txn.balance_before - txn.balance_after, 2) == 5


# ── Earned is spent FIRST ─────────────────────────────────────────────────────
def test_earned_spent_before_credit_and_paid(db, make_user):
    user = make_user(balance=5, credit_balance=5)
    now = sr._utcnow()
    _earn(db, user.id, 10, now)

    txn = create_debit_transaction(db, user.id, 3, "Session #1 - Minute 1")

    db.refresh(user)
    # Only earned moved; cash is untouched.
    assert sr.get_earned_stardust_balance(db, user.id) == 7
    assert float(user.credit_balance) == 5
    assert float(user.balance) == 5
    meta = _debit_meta(txn)
    assert meta["earned_spent"] == 3
    assert meta["credit_spent"] == 0
    assert meta["paid_spent"] == 0


def test_spill_earned_then_credit_then_paid(db, make_user):
    user = make_user(balance=10, credit_balance=1)
    now = sr._utcnow()
    _earn(db, user.id, 2, now)

    txn = create_debit_transaction(db, user.id, 5, "Session #1 - Minute 1")

    db.refresh(user)
    assert sr.get_earned_stardust_balance(db, user.id) == 0  # 2 earned first
    assert float(user.credit_balance) == 0  # then 1 credit
    assert float(user.balance) == 8  # then 2 paid
    meta = _debit_meta(txn)
    assert (meta["earned_spent"], meta["credit_spent"], meta["paid_spent"]) == (2, 1, 2)


# ── Soonest-to-expire lot is spent first ─────────────────────────────────────
def test_earned_consumes_soonest_to_expire_first(db, make_user):
    user = make_user()
    now = sr._utcnow()
    older = _earn(db, user.id, 4, now, source="task:old")  # expires sooner
    newer = _earn(db, user.id, 4, now + timedelta(days=2), source="task:new")

    create_debit_transaction(db, user.id, 5, "Session #1 - Minute 1")

    db.refresh(older)
    db.refresh(newer)
    # The 4 nearest-expiry points go entirely, then 1 from the later lot.
    assert float(older.remaining) == 0
    assert float(newer.remaining) == 3


# ── Exact penny splits across all four reader rates ──────────────────────────
@pytest.mark.parametrize("per_minute", RATES_PER_MINUTE)
def test_exact_penny_split_all_rates(db, make_user, per_minute):
    # Deliberately awkward pennies in earned + credit so the split must be exact.
    user = make_user(balance=100, credit_balance=0.49)
    now = sr._utcnow()
    _earn(db, user.id, 0.37, now)

    txn = create_debit_transaction(db, user.id, per_minute, "minute")

    meta = _debit_meta(txn)
    earned_spent = meta["earned_spent"]
    credit_spent = meta["credit_spent"]
    paid_spent = meta["paid_spent"]
    # Order honoured: earned (0.37) then credit (0.49) then paid for the rest.
    assert earned_spent == 0.37
    assert credit_spent == 0.49
    assert paid_spent == round(per_minute - 0.86, 2)
    # The three buckets sum EXACTLY to the charge — no lost/gained penny.
    assert round(earned_spent + credit_spent + paid_spent, 2) == round(per_minute, 2)

    db.refresh(user)
    assert float(user.credit_balance) == 0
    assert float(user.balance) == round(100 - paid_spent, 2)
    assert sr.get_earned_stardust_balance(db, user.id) == 0
    assert round(txn.balance_before - txn.balance_after, 2) == round(per_minute, 2)


# ── Earned counts toward affordability ───────────────────────────────────────
def test_earned_only_can_fund_a_minute(db, make_user):
    user = make_user(balance=0, credit_balance=0)
    now = sr._utcnow()
    _earn(db, user.id, 5, now)

    txn = create_debit_transaction(db, user.id, 5, "Session #1 - Minute 1")

    db.refresh(user)
    assert sr.get_earned_stardust_balance(db, user.id) == 0
    assert _debit_meta(txn)["earned_spent"] == 5


def test_insufficient_counts_earned_and_leaves_lots_intact(db, make_user):
    user = make_user(balance=1, credit_balance=1)
    now = sr._utcnow()
    _earn(db, user.id, 1, now)  # total spendable = 3

    with pytest.raises(InsufficientBalanceError):
        create_debit_transaction(db, user.id, 5, "Session #1 - Minute 1")

    db.refresh(user)
    # Nothing was consumed — the check fails before any lot is touched.
    assert sr.get_earned_stardust_balance(db, user.id) == 1
    assert float(user.credit_balance) == 1
    assert float(user.balance) == 1
    # No DEBIT row was written.
    assert (
        db.query(Transaction)
        .filter(
            Transaction.user_id == user.id,
            Transaction.transaction_type == TransactionType.DEBIT,
        )
        .count()
        == 0
    )


# ── Expired earned is never spent ────────────────────────────────────────────
def test_expired_earned_is_not_spendable(db, make_user):
    user = make_user(balance=0, credit_balance=0)
    old = sr._utcnow() - timedelta(days=40)  # already past its 30-day life
    _earn(db, user.id, 10, old)

    # No live balance anywhere → cannot even start a £2 minute.
    with pytest.raises(InsufficientBalanceError):
        create_debit_transaction(db, user.id, 2, "Session #1 - Minute 1")


# ── The single spendable helper ──────────────────────────────────────────────
def test_get_spendable_stardust_sums_all_three_buckets(db, make_user):
    user = make_user(balance=7, credit_balance=3)
    now = sr._utcnow()
    _earn(db, user.id, 5, now)

    assert sr.get_spendable_stardust(db, user) == 15  # 5 earned + 3 credit + 7 paid


def test_spendable_ignores_expired_earned(db, make_user):
    user = make_user(balance=2, credit_balance=0)
    _earn(db, user.id, 9, sr._utcnow() - timedelta(days=40))  # expired

    assert sr.get_spendable_stardust(db, user) == 2  # expired earned excluded


# ── consume_earned_lots unit behaviour ───────────────────────────────────────
def test_consume_earned_lots_is_fifo_by_expiry_and_partial(db, make_user):
    user = make_user()
    now = sr._utcnow()
    a = _earn(db, user.id, 3, now, source="task:a")
    b = _earn(db, user.id, 3, now + timedelta(days=1), source="task:b")

    taken, consumed = sr.consume_earned_lots(db, user.id, 4)
    db.commit()

    assert taken == 4
    assert consumed == [
        {"lot_id": a.id, "amount": 3},
        {"lot_id": b.id, "amount": 1},
    ]
    db.refresh(a)
    db.refresh(b)
    assert float(a.remaining) == 0
    assert float(b.remaining) == 2


def test_consume_more_than_available_takes_all(db, make_user):
    user = make_user()
    now = sr._utcnow()
    _earn(db, user.id, 2, now)

    taken, consumed = sr.consume_earned_lots(db, user.id, 10)
    db.commit()

    assert taken == 2
    assert sum(c["amount"] for c in consumed) == 2
    assert sr.get_earned_stardust_balance(db, user.id) == 0
