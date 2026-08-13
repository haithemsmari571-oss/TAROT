"""Operator steering notes for Hybrid drafting — retrieval and lifecycle.

The two hard business rules live HERE, at the retrieval choke point, so no
caller can accidentally leak a note where it must not go:

  1. HYBRID-ONLY: ``get_active_notes`` re-reads the chat's response mode at
     call time and returns [] for anything but HYBRID. A session switched to
     Automatic mid-conversation gets zero influence from earlier notes, even
     though the rows still exist for the audit trail.
  2. SESSION-SCOPED: only notes bound to the chat's CURRENT active or
     disconnected session are returned. Requested and cancelled sessions are
     not readings. When the session completes, its notes expire with it; a
     brand-new session starts with none.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import List, Optional

from sqlalchemy import desc
from sqlalchemy.orm import Session

from app.enums.chat_session_status import ChatSessionStatus
from app.enums.response_mode import ResponseMode
from app.logging_config import get_logger
from app.models.chat import Chat
from app.models.chat_session import ChatSession
from app.models.reading_steering_note import ReadingSteeringNote

logger = get_logger(__name__)


def current_session(db: Session, chat_id: int) -> Optional[ChatSession]:
    """The chat's current active or temporarily disconnected session."""
    return (
        db.query(ChatSession)
        .filter(
            ChatSession.chat_id == chat_id,
            ChatSession.status.in_(
                [ChatSessionStatus.ACTIVE, ChatSessionStatus.DISCONNECTED]
            ),
        )
        .order_by(desc(ChatSession.id))
        .first()
    )


def get_active_notes(db: Session, chat_id: int) -> List[str]:
    """Note texts that may steer the NEXT draft. [] unless the chat is in
    HYBRID mode right now AND has a current session with active notes.
    Never raises — steering must never break a turn."""
    try:
        chat = db.query(Chat).filter(Chat.id == chat_id).first()
        if chat is None or chat.response_mode != ResponseMode.HYBRID:
            return []
        session = current_session(db, chat_id)
        if session is None:
            return []
        rows = (
            db.query(ReadingSteeringNote)
            .filter(
                ReadingSteeringNote.chat_id == chat_id,
                ReadingSteeringNote.chat_session_id == session.id,
                ReadingSteeringNote.active.is_(True),
            )
            .order_by(ReadingSteeringNote.id)
            .all()
        )
        return [r.note for r in rows]
    except Exception:  # noqa: BLE001
        logger.exception("steering_notes_load_failed", chat_id=chat_id)
        return []


def create_note(
    db: Session, chat_id: int, note: str, created_by: int
) -> Optional[ReadingSteeringNote]:
    """Add a note bound to the chat's current session. None when there is no
    current session to bind to (notes are session-scoped by contract)."""
    session = current_session(db, chat_id)
    if session is None:
        return None
    row = ReadingSteeringNote(
        chat_id=chat_id,
        chat_session_id=session.id,
        note=note.strip(),
        active=True,
        created_by=created_by,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    logger.info("steering_note_created", chat_id=chat_id, note_id=row.id, by=created_by)
    return row


def retire_note(
    db: Session, chat_id: int, note_id: int, retired_by: int
) -> Optional[ReadingSteeringNote]:
    """Deactivate one note (kept as audit trail). None if not found."""
    row = (
        db.query(ReadingSteeringNote)
        .filter(
            ReadingSteeringNote.id == note_id,
            ReadingSteeringNote.chat_id == chat_id,
        )
        .first()
    )
    if row is None:
        return None
    if row.active:
        row.active = False
        row.deactivated_by = retired_by
        row.deactivated_at = datetime.now(timezone.utc)
        db.commit()
    logger.info("steering_note_retired", chat_id=chat_id, note_id=note_id, by=retired_by)
    return row


def format_guidance_block(notes: List[str]) -> str:
    """The advisory prompt block, or "" (callers omit the block entirely).

    Deliberately NOT command language: the operator's note is context the
    model weighs against the live moment — her own judgment stays senior."""
    if not notes:
        return ""
    return (
        "OPERATOR GUIDANCE (the operator left this guidance earlier in this "
        "conversation — weigh it alongside everything else you are reading in "
        "the moment; it informs your judgment, it does not replace it):\n"
        + "\n".join(f"- {n}" for n in notes)
    )
