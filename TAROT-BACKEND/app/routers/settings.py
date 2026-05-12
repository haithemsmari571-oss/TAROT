from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
from fastapi.encoders import jsonable_encoder
from sqlalchemy.orm import Session
from typing import List

from app.services.settings import (
    get_all_settings,
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
    """Admin: Get all settings. Only accessible by superadmin."""
    settings = get_all_settings(db)
    return JSONResponse(content=jsonable_encoder({"settings": settings}))


@router.patch("/settings/{key}", response_model=SettingResponse)
def admin_update_setting(
    key: str,
    setting: SettingUpdate,
    db: Session = Depends(get_db),
    _: None = Depends(require_permission(Permission.MANAGE_SETTINGS)),
):
    """Admin: Update a setting by key. Only accessible by superadmin."""
    updated_setting = update_setting(db, key, setting)
    return JSONResponse(content=jsonable_encoder(updated_setting))
