"""Failure-safe runtime access to owner-editable reading prompts.

The database registry is authoritative when reachable. Each successful read is
kept in process memory; a later database failure returns that last known good
text. The shipped constant is the cold-start fallback, so prompt storage can
never make a paid reading fail.
"""

from __future__ import annotations

from threading import RLock

from app.logging_config import get_logger

logger = get_logger(__name__)

_LAST_KNOWN_GOOD: dict[str, str] = {}
_LOCK = RLock()


def resolve_runtime_prompt(key: str, shipped_fallback: str) -> str:
    with _LOCK:
        fallback = _LAST_KNOWN_GOOD.setdefault(key, shipped_fallback)
    try:
        from app.database.client import SessionLocal
        from app.services.ai import registry

        with SessionLocal() as db:
            text = registry.get_prompt_text(db, key).strip()
        if not text:
            raise ValueError("The active prompt is empty.")
        with _LOCK:
            _LAST_KNOWN_GOOD[key] = text
        return text
    except Exception as error:  # noqa: BLE001 - reading delivery must never fail on registry I/O
        logger.warning(
            "reading_prompt_registry_fallback",
            prompt_key=key,
            error_type=type(error).__name__,
        )
        with _LOCK:
            return _LAST_KNOWN_GOOD.get(key, fallback)


def clear_runtime_prompt_cache() -> None:
    """Test seam. Registry writes still bust their own authoritative cache."""
    with _LOCK:
        _LAST_KNOWN_GOOD.clear()
