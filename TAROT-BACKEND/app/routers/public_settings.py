from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
from fastapi.encoders import jsonable_encoder
from sqlalchemy.orm import Session
from sqlalchemy import select

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
