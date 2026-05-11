from datetime import datetime
from dataclasses import dataclass
from typing import Dict, Optional
from pydantic import BaseModel

from app.logging_config import get_logger

logger = get_logger(__name__)


@dataclass()
class Value:
    value: bytes
    exp_at: datetime


class Cache:
    def __init__(self):
        self._store: Dict[str, Value] = {}

    def get_all(self):
        return self._store

    def get(self, key: str) -> Optional[bytes]:
        val = self._store.get(key)
        if not val:
            logger.debug("cache_miss", key_prefix=key[:8] if len(key) >= 8 else key)
            return None

        if val.exp_at < datetime.now():
            logger.debug(
                "cache_entry_expired",
                key_prefix=key[:8] if len(key) >= 8 else key,
                expired_at=val.exp_at.isoformat(),
            )
            self.remove(key)
            return None

        logger.debug("cache_hit", key_prefix=key[:8] if len(key) >= 8 else key)
        return val.value

    def set_value(self, key: str, value: Value) -> bytes:
        val = self._store[key] = value
        logger.debug(
            "cache_set",
            key_prefix=key[:8] if len(key) >= 8 else key,
            expires_at=value.exp_at.isoformat(),
        )
        return val.value

    def remove(self, key: str) -> None:
        """Remove a key from cache. Handles KeyError gracefully."""
        try:
            del self._store[key]
            logger.debug("cache_removed", key_prefix=key[:8] if len(key) >= 8 else key)
        except KeyError:
            logger.warning(
                "cache_remove_key_not_found",
                key_prefix=key[:8] if len(key) >= 8 else key,
            )
