"""Earned-Stardust ledger — the "earned vs. purchased" balance split.

This module owns the NEW rules from Section 2 of the gamification spec, and
touches only earned Stardust. It never modifies ``users.balance`` (purchased)
or ``users.credit_balance`` (legacy free credit) — per the PM decision, every
balance that existed before this feature stays "purchased": no expiry, no cap.

The three hard rules implemented here:

  1. Earned Stardust covers AT MOST 50% of any order (:func:`max_earned_redeemable`).
  2. Earned Stardust expires 30 days after it is credited (:func:`expire_earned_stardust`).
  3. Reward amounts are validated/known server-side — callers pass a fixed amount
     that originates from a task record, never from the client.

Each award is a :class:`StardustLot` with its own expiry clock, so awards expire
independently and the soonest-to-expire lot is spent first (FIFO by expiry).
Every mutation also writes a row to the existing ``transactions`` ledger (types
EARN / EXPIRE) reusing the idempotency pattern, so the admin ledger stays the
single running history.
"""

import json
from datetime import datetime, timedelta, timezone
from typing import Optional

from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.enums.transaction_status import TransactionStatus
from app.enums.transaction_type import TransactionType
from app.exceptions.transactions import (
    DuplicateTransactionError,
    InvalidTransactionAmountError,
)
from app.logging_config import get_logger
from app.models import StardustLot, Transaction, User
from app.services.transactions import get_user_balance_with_lock

logger = get_logger(__name__)

# ── The economy defaults (Section 2). These are the DEFAULTS; the live values
# come from admin Settings so the owner can tune them without a redeploy. ─────
# Earned Stardust may fund at most this fraction of any single order.
EARNED_REDEMPTION_CAP_PCT = 0.50
# Earned Stardust expires this many days after it is credited.
EARNED_STARDUST_TTL_DAYS = 30
# Soft "your Stardust is fading" warning threshold (days remaining).
EARNED_EXPIRY_WARNING_DAYS = 7


def get_redemption_cap_pct(db: Session) -> float:
    """Live redemption cap fraction — from admin Settings, else the 50% default."""
    from app.services.settings import get_setting_value

    raw = get_setting_value(db, "earned_redemption_cap_pct", None)
    try:
        pct = float(raw) if raw is not None else EARNED_REDEMPTION_CAP_PCT
    except (TypeError, ValueError):
        pct = EARNED_REDEMPTION_CAP_PCT
    return pct if 0 < pct <= 1 else EARNED_REDEMPTION_CAP_PCT


def get_ttl_days(db: Session) -> int:
    """Live earned-Stardust expiry in days — from admin Settings, else 30."""
    from app.services.settings import get_setting_value

    raw = get_setting_value(db, "earned_expiry_days", None)
    try:
        days = int(float(raw)) if raw is not None else EARNED_STARDUST_TTL_DAYS
    except (TypeError, ValueError):
        days = EARNED_STARDUST_TTL_DAYS
    return days if days > 0 else EARNED_STARDUST_TTL_DAYS


def _utcnow() -> datetime:
    """Timezone-aware UTC now. Kept in one place so tests can reason about it."""
    return datetime.now(timezone.utc)


def _round2(value: float) -> float:
    return round(float(value or 0), 2)


# ── Crediting ────────────────────────────────────────────────────────────────
def credit_earned_stardust(
    db: Session,
    user_id: int,
    amount: float,
    description: str,
    source: Optional[str] = None,
    idempotency_key: Optional[str] = None,
    now: Optional[datetime] = None,
) -> StardustLot:
    """Award earned Stardust: create one lot (30-day expiry) + an EARN ledger row.

    ``amount`` must originate from a trusted server-side source (a task record),
    never from the client. ``idempotency_key`` (e.g. ``"claim:42"``) makes the
    award safe to retry — a duplicate key is rejected, mirroring the Stripe
    webhook credit path.

    Raises:
        InvalidTransactionAmountError: if amount <= 0.
        DuplicateTransactionError: if idempotency_key was already used.
    """
    amount = _round2(amount)
    if amount <= 0:
        raise InvalidTransactionAmountError("Earned Stardust amount must be positive")

    now = now or _utcnow()
    expires_at = now + timedelta(days=get_ttl_days(db))

    try:
        # Lock the user row so the ledger's balance_before/after is consistent
        # under concurrency, exactly like create_credit_transaction.
        user, _ = get_user_balance_with_lock(db, user_id)
        purchased_before = float(user.balance or 0)
        credit_before = float(user.credit_balance or 0)
        earned_before = get_earned_stardust_balance(db, user_id, now=now)
        total_before = purchased_before + credit_before + earned_before

        transaction = Transaction(
            user_id=user_id,
            transaction_type=TransactionType.EARN,
            amount=amount,
            balance_before=total_before,
            balance_after=total_before + amount,
            status=TransactionStatus.COMPLETED,
            description=description,
            idempotency_key=idempotency_key,
            transaction_metadata=json.dumps(
                {
                    "bucket": "earned",
                    "source": source,
                    "expires_at": expires_at.isoformat(),
                }
            ),
        )
        db.add(transaction)
        db.flush()  # assign transaction.id without ending the transaction

        lot = StardustLot(
            user_id=user_id,
            amount=amount,
            remaining=amount,
            source=source,
            credited_at=now,
            expires_at=expires_at,
            is_expired=False,
            transaction_id=transaction.id,
        )
        db.add(lot)
        db.commit()
        db.refresh(lot)

        logger.info(
            "earned_stardust_credited",
            user_id=user_id,
            amount=amount,
            lot_id=lot.id,
            transaction_id=transaction.id,
            source=source,
            expires_at=expires_at.isoformat(),
            idempotency_key=idempotency_key,
        )
        return lot

    except IntegrityError as e:
        db.rollback()
        if idempotency_key and "idempotency_key" in str(e):
            logger.warning(
                "earned_stardust_duplicate_idempotency_key",
                user_id=user_id,
                amount=amount,
                idempotency_key=idempotency_key,
            )
            raise DuplicateTransactionError()
        logger.error(
            "earned_stardust_credit_integrity_error",
            user_id=user_id,
            amount=amount,
            error=str(e),
            exc_info=True,
        )
        raise


# ── Reading balances ─────────────────────────────────────────────────────────
def _active_lots_query(db: Session, user_id: int, now: datetime):
    """Lots that are still spendable: unexpired and with remaining > 0."""
    return (
        db.query(StardustLot)
        .filter(
            StardustLot.user_id == user_id,
            StardustLot.remaining > 0,
            StardustLot.expires_at > now,
        )
        .order_by(StardustLot.expires_at.asc())  # soonest-to-expire spent first
    )


def get_earned_stardust_balance(
    db: Session, user_id: int, now: Optional[datetime] = None
) -> float:
    """Total spendable EARNED Stardust (unexpired, unspent). Excludes purchased."""
    now = now or _utcnow()
    total = (
        db.query(func.coalesce(func.sum(StardustLot.remaining), 0))
        .filter(
            StardustLot.user_id == user_id,
            StardustLot.remaining > 0,
            StardustLot.expires_at > now,
        )
        .scalar()
    )
    return _round2(total)


def get_stardust_breakdown(
    db: Session, user_id: int, now: Optional[datetime] = None
) -> dict:
    """The dual-balance view for display (Section 3, item 5).

    Returns purchased, earned, earned-expiring-soon, and the combined total.
    ``purchased`` folds in legacy free credit, since per the PM decision every
    pre-existing balance counts as purchased (no cap, no expiry).
    """
    now = now or _utcnow()
    user = db.query(User).filter(User.id == user_id).first()
    purchased = float(user.balance or 0) if user else 0.0
    legacy_credit = float(user.credit_balance or 0) if user else 0.0
    purchased_total = _round2(purchased + legacy_credit)

    earned = get_earned_stardust_balance(db, user_id, now=now)

    warning_cutoff = now + timedelta(days=EARNED_EXPIRY_WARNING_DAYS)
    expiring_soon = (
        db.query(func.coalesce(func.sum(StardustLot.remaining), 0))
        .filter(
            StardustLot.user_id == user_id,
            StardustLot.remaining > 0,
            StardustLot.expires_at > now,
            StardustLot.expires_at <= warning_cutoff,
        )
        .scalar()
    )

    return {
        "purchased": purchased_total,
        "earned": earned,
        "earned_expiring_soon": _round2(expiring_soon),
        "total": _round2(purchased_total + earned),
    }


# ── The 50% redemption cap ───────────────────────────────────────────────────
def max_earned_redeemable(order_cost: float, pct: float = EARNED_REDEMPTION_CAP_PCT) -> float:
    """The most earned Stardust that may fund an order of ``order_cost`` (Rule 1).

    Pure function of the order value and the cap fraction — earned Stardust can
    never cover more than the cap, so every earned point forces a purchase for
    the rest.
    """
    return _round2(max(order_cost, 0) * pct)


def redeem_earned_stardust(
    db: Session,
    user_id: int,
    order_cost: float,
    description: str,
    now: Optional[datetime] = None,
) -> float:
    """Spend earned Stardust against an order, honouring the 50% cap.

    Consumes lots soonest-to-expire first, up to
    ``min(50% of order, available earned)``. Writes a DEBIT ledger row tagged as
    an earned redemption and returns the amount redeemed. The remainder of the
    order must be paid from purchased balance by the caller — this function only
    moves the earned portion.

    This is the reusable "cap at checkout" primitive; wiring it into the live
    billing/checkout path is a later, separately-reviewed step.
    """
    now = now or _utcnow()
    order_cost = _round2(order_cost)
    if order_cost <= 0:
        return 0.0

    # Lock the user row for a consistent read/modify/write of their lots.
    get_user_balance_with_lock(db, user_id)

    cap = max_earned_redeemable(order_cost, get_redemption_cap_pct(db))
    available = get_earned_stardust_balance(db, user_id, now=now)
    to_redeem = _round2(min(cap, available))
    if to_redeem <= 0:
        return 0.0

    remaining_to_take = to_redeem
    consumed = []
    for lot in _active_lots_query(db, user_id, now).with_for_update().all():
        if remaining_to_take <= 0:
            break
        take = _round2(min(float(lot.remaining), remaining_to_take))
        lot.remaining = _round2(float(lot.remaining) - take)
        remaining_to_take = _round2(remaining_to_take - take)
        consumed.append({"lot_id": lot.id, "amount": take})

    actually_redeemed = _round2(to_redeem - remaining_to_take)

    transaction = Transaction(
        user_id=user_id,
        transaction_type=TransactionType.DEBIT,
        amount=actually_redeemed,
        # Balance columns track the earned bucket movement for this row.
        balance_before=available,
        balance_after=_round2(available - actually_redeemed),
        status=TransactionStatus.COMPLETED,
        description=description,
        transaction_metadata=json.dumps(
            {
                "bucket": "earned",
                "earned_redeemed": actually_redeemed,
                "order_cost": order_cost,
                "cap_applied": cap,
                "lots": consumed,
            }
        ),
    )
    db.add(transaction)
    db.commit()

    logger.info(
        "earned_stardust_redeemed",
        user_id=user_id,
        order_cost=order_cost,
        cap=cap,
        redeemed=actually_redeemed,
        lots=consumed,
    )
    return actually_redeemed


# ── Expiry ───────────────────────────────────────────────────────────────────
def expire_earned_stardust(db: Session, now: Optional[datetime] = None) -> dict:
    """Forfeit any earned Stardust past its 30-day life (Rule 2).

    Idempotent: only touches lots that still have ``remaining > 0`` and haven't
    been marked ``is_expired``. For each, writes one EXPIRE ledger row for the
    forfeited remainder, zeroes ``remaining`` and flags the lot. Designed to be
    called by the nightly job (built later) but safe to run any time.

    Returns a summary: number of lots expired and total Stardust forfeited.
    """
    now = now or _utcnow()

    expired_lots = (
        db.query(StardustLot)
        .filter(
            StardustLot.expires_at <= now,
            StardustLot.remaining > 0,
            StardustLot.is_expired.is_(False),
        )
        .with_for_update()
        .all()
    )

    lots_expired = 0
    total_forfeited = 0.0
    for lot in expired_lots:
        forfeited = _round2(lot.remaining)
        if forfeited <= 0:
            lot.is_expired = True
            continue

        transaction = Transaction(
            user_id=lot.user_id,
            transaction_type=TransactionType.EXPIRE,
            amount=forfeited,
            balance_before=forfeited,
            balance_after=0,
            status=TransactionStatus.COMPLETED,
            description="Earned Stardust expired (30-day limit)",
            transaction_metadata=json.dumps(
                {
                    "bucket": "earned",
                    "lot_id": lot.id,
                    "credited_at": lot.credited_at.isoformat()
                    if lot.credited_at
                    else None,
                    "expires_at": lot.expires_at.isoformat()
                    if lot.expires_at
                    else None,
                }
            ),
        )
        db.add(transaction)
        lot.remaining = 0
        lot.is_expired = True
        lots_expired += 1
        total_forfeited = _round2(total_forfeited + forfeited)

    db.commit()

    if lots_expired:
        logger.info(
            "earned_stardust_expired",
            lots_expired=lots_expired,
            total_forfeited=total_forfeited,
        )
    return {"lots_expired": lots_expired, "total_forfeited": total_forfeited}
