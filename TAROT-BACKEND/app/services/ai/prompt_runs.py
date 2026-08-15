"""Record that an owner-editable prompt actually executed.

Pure instrumentation. The Prompts screen could only ever say "never run" for
the reading prompts because nothing wrote a run record outside the nightly
Daily Content job, so a reading that plainly happened left no trace.

Two properties matter more than the record itself:

* It never raises. Every call is wrapped, so a registry hiccup can never turn
  into a failed reading.
* It never touches the caller's session. ``registry.record_run`` commits, and
  the reading and memory paths call this while their own transaction is open,
  so this opens its own short-lived session and commits only its own row.
"""

from __future__ import annotations

from typing import Optional

from app.logging_config import get_logger

logger = get_logger(__name__)


def record_prompt_run(
    key: str,
    *,
    ok: bool,
    model: Optional[str] = None,
    detail: Optional[str] = None,
) -> None:
    """Note one execution of ``key``: when it ran, on which model, and how it went."""
    try:
        from app.database.client import SessionLocal
        from app.services.ai import registry
        from app.services.ai.runtime_prompts import last_resolved_model

        resolved_model = (model or "").strip() or last_resolved_model(key)
        status = "success" if ok else "failed"
        if detail:
            status = f"{status}: {detail}"
        with SessionLocal() as db:
            registry.record_run(db, key, status, model=resolved_model)
    except Exception as error:  # noqa: BLE001 - telemetry must never break a reading
        logger.warning(
            "prompt_run_record_failed",
            prompt_key=key,
            error_type=type(error).__name__,
        )
