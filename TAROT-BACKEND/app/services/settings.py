from typing import List
from sqlalchemy import select
from sqlalchemy.orm import Session
from fastapi import HTTPException

from app.models.settings import Settings
from app.schemas.settings import SettingUpdate


def get_all_settings(db: Session) -> List[Settings]:
    """Get all settings."""
    stmt = select(Settings)
    return list(db.scalars(stmt))


def get_setting_by_key(db: Session, key: str) -> Settings:
    """Get a setting by key."""
    stmt = select(Settings).where(Settings.key == key)
    setting = db.scalar(stmt)
    if setting is None:
        raise HTTPException(
            status_code=404, detail=f"Setting with key '{key}' not found"
        )
    return setting


def update_setting(db: Session, key: str, setting_data: SettingUpdate) -> Settings:
    """Update a setting by key."""
    setting = get_setting_by_key(db, key)
    setting.value = setting_data.value
    db.commit()
    db.refresh(setting)
    return setting
