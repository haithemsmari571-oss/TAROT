"""Billing-mode gates for routes that only make sense under one mode."""

from fastapi import HTTPException

from app.config import get_app_settings


def require_per_minute_billing() -> None:
    """Refuse a clock-only endpoint under per-message billing.

    /pause, /topup, /resume, /reflect and /reflect/return all manipulate the
    session clock. A per-message reading has no clock, so they answer 409 before
    a single row is read. Declared as a FastAPI dependency so the check runs
    ahead of every handler body, from one place rather than five copies.
    """
    if get_app_settings().BILLING_MODE == "per_message":
        raise HTTPException(status_code=409, detail="NOT_AVAILABLE_PER_MESSAGE")


def require_per_message_billing() -> None:
    """Refuse a per-message-only endpoint under per-minute billing.

    POST /conversation opens a thread with the reader's opener and no charge,
    which only means something when every message pays for itself. Under the
    clock it answers 409 before a single row is read. The mirror of the gate
    above, so both modes refuse from one place.
    """
    if get_app_settings().BILLING_MODE != "per_message":
        raise HTTPException(status_code=409, detail="PER_MESSAGE_ONLY")
