from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
from fastapi.encoders import jsonable_encoder
from sqlalchemy.orm import Session
from typing import List

from app.services.settings import (
    get_all_settings,
    is_secret_key,
    redact_value,
    update_setting,
)
from app.schemas.settings import (
    SettingResponse,
    SettingUpdate,
    SettingsListResponse,
)
from app.database.client import get_db
from app.dependencies.authorization import require_permission
from app.enums.permissions import Permission

router = APIRouter()


@router.get("/settings", response_model=SettingsListResponse)
def admin_list_settings(
    db: Session = Depends(get_db),
    _: None = Depends(require_permission(Permission.MANAGE_SETTINGS)),
):
    """Admin: Get all settings. Secret values (Stripe/webhook keys) are redacted
    server-side — the raw secret never reaches the browser."""
    settings = get_all_settings(db)
    out = []
    for s in settings:
        secret = is_secret_key(s.key)
        out.append(
            {
                "id": s.id,
                "key": s.key,
                "value": redact_value(s.value) if secret else s.value,
                "is_secret": secret,
            }
        )
    return JSONResponse(content=jsonable_encoder({"settings": out}))


@router.patch("/settings/{key}", response_model=SettingResponse)
def admin_update_setting(
    key: str,
    setting: SettingUpdate,
    db: Session = Depends(get_db),
    _: None = Depends(require_permission(Permission.MANAGE_SETTINGS)),
):
    """Admin: Update a setting by key. Only accessible by superadmin."""
    updated_setting = update_setting(db, key, setting)
    secret = is_secret_key(updated_setting.key)
    return JSONResponse(
        content=jsonable_encoder(
            {
                "id": updated_setting.id,
                "key": updated_setting.key,
                "value": redact_value(updated_setting.value)
                if secret
                else updated_setting.value,
                "is_secret": secret,
            }
        )
    )
