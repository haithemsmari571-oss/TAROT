from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
from fastapi.encoders import jsonable_encoder
from sqlalchemy.orm import Session
from sqlalchemy import select

from app.config import get_app_settings
from app.models.settings import Settings
from app.schemas.settings import PublicSettingsResponse
from app.database.client import get_db

router = APIRouter()


@router.get("/settings/public", response_model=PublicSettingsResponse)
def public_get_settings(
    db: Session = Depends(get_db),
):
    stmt = select(Settings).where(
        Settings.key.in_(["privacy_policy", "terms_of_service"])
    )
    results = {row.key: row.value for row in db.scalars(stmt)}
    return PublicSettingsResponse(
        privacy_policy=results.get("privacy_policy", ""),
        terms_of_service=results.get("terms_of_service", ""),
    )


@router.get("/billing-mode")
def public_billing_mode():
    """The billing mode the app should render for: "per_minute" or "per_message".

    Public and unauthenticated. The app reads it once at load, before any session
    exists; a session payload's own billing_mode wins after that."""
    return {"billing_mode": get_app_settings().BILLING_MODE}
