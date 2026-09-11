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
