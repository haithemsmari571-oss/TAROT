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
_LAST_KNOWN_GOOD_BUNDLES: dict[str, tuple[str, str]] = {}
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


def resolve_runtime_prompt_and_model(
    key: str, shipped_prompt: str, shipped_model: str
) -> tuple[str, str]:
    """Resolve text and model from one registry row, with one coherent fallback."""
    with _LOCK:
        fallback = _LAST_KNOWN_GOOD_BUNDLES.setdefault(
            key, (shipped_prompt, shipped_model)
        )
    try:
        from app.database.client import SessionLocal
        from app.services.ai import registry

        with SessionLocal() as db:
            row = registry.get_prompt(db, key)
            text = registry.resolve_prompt_text(row).strip()
            model = str(row.model or "").strip()
            registry.validate_prompt_text(row, text)
            registry.validate_prompt_model(model)
        resolved = (text, model)
        with _LOCK:
            _LAST_KNOWN_GOOD_BUNDLES[key] = resolved
            _LAST_KNOWN_GOOD[key] = text
        return resolved
    except Exception as error:  # noqa: BLE001 - reading delivery must never fail on registry I/O
        logger.warning(
            "reading_prompt_registry_fallback",
            prompt_key=key,
            error_type=type(error).__name__,
        )
        with _LOCK:
            return _LAST_KNOWN_GOOD_BUNDLES.get(key, fallback)


def last_resolved_model(key: str) -> str | None:
    """The model this process last actually resolved for ``key``.

    Read-only view of the resolver's own cache, so run telemetry can report the
    model a reading really used rather than whatever is configured now.
    """
    with _LOCK:
        bundle = _LAST_KNOWN_GOOD_BUNDLES.get(key)
    if not bundle:
        return None
    model = (bundle[1] or "").strip()
    return model or None


def clear_runtime_prompt_cache() -> None:
    """Test seam. Registry writes still bust their own authoritative cache."""
    with _LOCK:
        _LAST_KNOWN_GOOD.clear()
        _LAST_KNOWN_GOOD_BUNDLES.clear()
