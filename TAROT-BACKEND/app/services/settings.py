from typing import List, Optional
from sqlalchemy import select
from sqlalchemy.orm import Session
from fastapi import HTTPException

from app.models.settings import Settings
from app.schemas.settings import SettingUpdate

# Substrings that mark a setting key as a SECRET whose value must never be sent
# to the browser in full (Stripe keys, webhook secrets, etc.).
_SECRET_MARKERS = (
    "secret",
    "api_key",
    "apikey",
    "password",
    "token",
    "webhook",
    "private_key",
    "access_key",
)
MASK = "••••"  # ••••


def is_secret_key(key: str) -> bool:
    k = (key or "").lower()
    return any(m in k for m in _SECRET_MARKERS)


def redact_value(value: Optional[str]) -> str:
    """Mask a secret value, revealing only the last 4 chars for identification."""
    v = value or ""
    if len(v) <= 4:
        return MASK
    return f"{MASK}{v[-4:]}"


def is_redacted(value: Optional[str]) -> bool:
    """True if the value looks like a redacted placeholder (so a re-save of an
    unchanged secret field doesn't overwrite the real secret)."""
    return MASK in (value or "")


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


def get_setting_value(db: Session, key: str, default: Optional[str] = None) -> Optional[str]:
    """Get a setting value by key. Returns default if not found."""
    stmt = select(Settings).where(Settings.key == key)
    setting = db.scalar(stmt)
    if setting is None:
        return default
    return setting.value


def update_setting(db: Session, key: str, setting_data: SettingUpdate) -> Settings:
    """Update a setting by key. Ignores a no-op re-save of a redacted secret so
    the real value isn't clobbered by the masked placeholder from the UI."""
    setting = get_setting_by_key(db, key)
    if is_secret_key(key) and is_redacted(setting_data.value):
        return setting  # unchanged secret — keep the stored value
    setting.value = setting_data.value
    db.commit()
    db.refresh(setting)
    return setting
