from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
from fastapi.encoders import jsonable_encoder
from sqlalchemy.orm import Session
from sqlalchemy import select

from app.config import get_app_settings
from app.models.settings import Settings
from app.schemas.settings import PublicSettingsResponse
from app.database.client import get_db
from app.services.auth import SIGNUP_BONUS_SETTING, parse_signup_bonus
from app.services.offline_replies import refund_after_hours

router = APIRouter()

# The settings rows anyone may read, signed in or not.
PUBLIC_SETTING_KEYS = ["privacy_policy", "terms_of_service", SIGNUP_BONUS_SETTING]


@router.get("/settings/public", response_model=PublicSettingsResponse)
def public_get_settings(
    db: Session = Depends(get_db),
):
    stmt = select(Settings).where(Settings.key.in_(PUBLIC_SETTING_KEYS))
    results = {row.key: row.value for row in db.scalars(stmt)}
    # The welcome credit exactly as sign_up would award it today; 0 when the
    # setting is missing or not a whole number, so the app draws no welcome line.
    try:
        signup_bonus_gbp = parse_signup_bonus(results.get(SIGNUP_BONUS_SETTING))
    except (ValueError, TypeError):
        signup_bonus_gbp = 0
    return PublicSettingsResponse(
        privacy_policy=results.get("privacy_policy", ""),
        terms_of_service=results.get("terms_of_service", ""),
        signup_bonus_gbp=signup_bonus_gbp,
        refund_after_hours=refund_after_hours(),
    )


@router.get("/billing-mode")
def public_billing_mode():
    """The billing mode the app should render for: "per_minute" or "per_message".

    Public and unauthenticated. The app reads it once at load, before any session
    exists; a session payload's own billing_mode wins after that."""
    return {"billing_mode": get_app_settings().BILLING_MODE}
