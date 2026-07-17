"""Append-only audit log of the reading pipeline's intermediate work.

``get_draft_log().log(...)`` writes ONE row per generation attempt to
``reading_draft_attempts`` so a human can later review what actually happened during a
reading (Valentina's raw draft, Sabri's curated delivery + notes, or the single-agent
Reader's raw output + holds) — not just the delivered bubbles.

Same safety contract as the Phase-1 durable session store: a logging failure must NEVER
slow down or block a live reading. Every write is wrapped so any DB error degrades to a
no-op, and DB availability is probed once and cached so a down/absent DB can't slow the
hot path (or the test suite). ``session_factory`` is injectable for tests; the process
singleton uses the app's ``SessionLocal``. Backend only — no UI here.
"""
from __future__ import annotations

from typing import Optional

from app.logging_config import get_logger

logger = get_logger(__name__)


class DraftAttemptLog:
    """Writes append-only reading_draft_attempts rows; never raises into a turn."""

    def __init__(self, session_factory=None) -> None:
        self._session_factory = session_factory  # None -> app SessionLocal (lazy)
        self._db_ok: Optional[bool] = None       # None=unprobed; cached True/False after

    def _open(self):
        if self._session_factory is not None:
            return self._session_factory()
        from app.database.client import SessionLocal

        return SessionLocal()

    def log(
        self,
        *,
        chat_id: int,
        turn_number: int,
        engine: str,
        stage: str,
        raw_content: str,
        attempt_number: int = 1,
        notes: Optional[str] = None,
        is_delivered: bool = False,
    ) -> None:
        """Append one attempt row. Returns nothing and never raises — a failed write is
        swallowed (logged) so it can never block or slow a delivery."""
        if chat_id is None or self._db_ok is False:
            return
        try:
            from app.models.reading_draft_attempt import ReadingDraftAttempt

            with self._open() as db:
                db.add(
                    ReadingDraftAttempt(
                        chat_id=chat_id,
                        turn_number=turn_number,
                        attempt_number=attempt_number,
                        engine=engine,
                        stage=stage,
                        raw_content=raw_content or "",
                        notes=notes,
                        is_delivered=is_delivered,
                    )
                )
                db.commit()
            self._db_ok = True
        except Exception as e:  # noqa: BLE001 — logging must never break a turn
            if self._db_ok is None:
                self._db_ok = False  # DB down/absent this process -> stop retrying
            logger.warning("reading_draft_log_failed", chat_id=chat_id, stage=stage, error=str(e))


_LOG = DraftAttemptLog()


def get_draft_log() -> DraftAttemptLog:
    return _LOG
