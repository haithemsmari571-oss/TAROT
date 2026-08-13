"""Admin/psychic endpoints for the AI reading pipeline.

- Set a conversation's response mode (Human / Hybrid / Sabri).
- List PENDING AI drafts awaiting review, and send or discard one.

Access is restricted to the assigned reader and admins/superadmins — drafts must
never reach the client. Mounted under /api/chat.
"""

import json

from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
from sqlalchemy import desc
from sqlalchemy.orm import Session

from app.database.client import get_db
from app.dependencies.get_current_user import get_current_user
from app.enums.ai_draft_status import AiDraftStatus
from app.enums.role import Role
from app.logging_config import get_logger
from app.models.ai_draft import AiDraft
from app.models.chat import Chat
from app.models.user import User
from app.schemas.reading_ai import (
    DraftSend,
    ResponseModeUpdate,
    SteeringNoteCreate,
    TypingUpdate,
)

router = APIRouter()
logger = get_logger(__name__)


def _authorize(user: User, chat: Chat) -> bool:
    """Admins/superadmins, or the reader assigned to the chat. NOT the client."""
    if user.role in (Role.ADMIN, Role.SUPERADMIN):
        return True
    return user.id == chat.psychic_id


def _stage_fallback_draft_decision(
    db: Session, chat_id: int, draft_id: int, status: AiDraftStatus
) -> bool:
    """Serialize manual decisions for legacy SABRI fallback drafts."""
    from app.enums.response_mode import ResponseMode

    current = (
        db.query(AiDraft)
        .filter(AiDraft.id == draft_id, AiDraft.chat_id == chat_id)
        .populate_existing()
        .with_for_update()
        .first()
    )
    if (
        current is None
        or current.mode == ResponseMode.HYBRID
        or current.status != AiDraftStatus.PENDING
    ):
        return False
    current.status = status
    return True


def _draft_out(d: AiDraft) -> dict:
    try:
        flags = json.loads(d.sabri_flags) if d.sabri_flags else []
    except (ValueError, TypeError):
        flags = []
    return {
        "id": d.id,
        "chat_id": d.chat_id,
        "client_message_id": d.client_message_id,
        "mode": d.mode.value,
        "draft_text": d.draft_text,
        "sabri_flags": flags,
        "sabri_passed": d.sabri_passed,
        "attempts": d.attempts,
        "status": d.status.value,
        "created_at": d.created_at.isoformat() if d.created_at else None,
    }


@router.put("/{chat_id}/response-mode")
async def set_response_mode(
    chat_id: int,
    payload: ResponseModeUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    chat = db.query(Chat).filter(Chat.id == chat_id).first()
    if not chat:
        return JSONResponse(content={"detail": "Chat not found"}, status_code=404)
    if not _authorize(user, chat):
        return JSONResponse(content={"detail": "Not authorized"}, status_code=403)

    chat.response_mode = payload.mode
    db.commit()
    logger.info(
        "response_mode_set", chat_id=chat_id, mode=payload.mode.value, by=user.id
    )
    # Switching away from full-auto must STOP any in-flight or queued AI turn —
    # otherwise a stale generation/reveal finishes (and a queued redirect runs as a
    # full extra AI turn) after the operator already took over. Committed first so a
    # message arriving during the cancel already sees the new mode. Never raises.
    from app.enums.response_mode import ResponseMode as _RM
    from app.services.ai import reading_hybrid

    await reading_hybrid.cancel_ai_turns_for_mode_change(chat_id, payload.mode)
    # Re-evaluate the durable burst after the committed mode change. HUMAN stays
    # manual; HYBRID/SABRI claim only still-unanswered client messages and retain
    # the six-second/typing boundary instead of launching the latest row directly.
    if payload.mode == _RM.SABRI:
        await reading_hybrid.handover_to_auto(chat_id, db, chat)
    else:
        from app.services.ai.reading_burst import note_mode_change

        await note_mode_change(chat_id, db=db)
    return JSONResponse(
        content={"chat_id": chat_id, "response_mode": payload.mode.value},
        status_code=200,
    )


@router.put("/{chat_id}/typing")
async def set_reader_typing(
    chat_id: int,
    payload: TypingUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Broadcast the reader's typing state to the client — the SAME typing_start/
    typing_stop events the AI engines already emit (and ClientChat already renders),
    now fireable by the operator while editing a draft or typing a manual reply."""
    chat = db.query(Chat).filter(Chat.id == chat_id).first()
    if not chat:
        return JSONResponse(content={"detail": "Chat not found"}, status_code=404)
    if not _authorize(user, chat):
        return JSONResponse(content={"detail": "Not authorized"}, status_code=403)

    from app.services.ai import reading_executor

    await reading_executor.broadcast_typing(chat_id, payload.typing, chat.psychic_id)
    return JSONResponse(
        content={"chat_id": chat_id, "typing": payload.typing}, status_code=200
    )


@router.get("/{chat_id}/drafts")
def list_drafts(
    chat_id: int,
    status: str = "PENDING",
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    chat = db.query(Chat).filter(Chat.id == chat_id).first()
    if not chat:
        return JSONResponse(content={"detail": "Chat not found"}, status_code=404)
    if not _authorize(user, chat):
        return JSONResponse(content={"detail": "Not authorized"}, status_code=403)

    q = db.query(AiDraft).filter(AiDraft.chat_id == chat_id)
    try:
        q = q.filter(AiDraft.status == AiDraftStatus(status.upper()))
    except ValueError:
        pass  # unknown status → return all for the chat
    drafts = q.order_by(desc(AiDraft.id)).all()
    return JSONResponse(content=[_draft_out(d) for d in drafts], status_code=200)


@router.get("/{chat_id}/drafts/generating")
def get_draft_generating(
    chat_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Whether a HYBRID draft generation is in flight for this chat — polled by the
    cockpit's "Valentina is writing…" indicator so a client message never leaves a
    silent gap while the draft generates."""
    chat = db.query(Chat).filter(Chat.id == chat_id).first()
    if not chat:
        return JSONResponse(content={"detail": "Chat not found"}, status_code=404)
    if not _authorize(user, chat):
        return JSONResponse(content={"detail": "Not authorized"}, status_code=403)

    from app.services.ai.reading_burst import is_generating as burst_is_generating
    from app.services.ai.reading_hybrid import is_generating

    return JSONResponse(
        content={
            "chat_id": chat_id,
            "generating": is_generating(chat_id) or burst_is_generating(chat_id),
        },
        status_code=200,
    )


@router.post("/{chat_id}/drafts/generate")
async def generate_draft(
    chat_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Queue one fresh Hybrid draft for the complete unanswered client turn."""
    from app.enums.chat_status import ChatStatus
    from app.enums.response_mode import ResponseMode
    from app.models.message import Message
    from app.services.ai import reading_burst

    chat = db.query(Chat).filter(Chat.id == chat_id).first()
    if not chat:
        return JSONResponse(content={"detail": "Chat not found"}, status_code=404)
    if not _authorize(user, chat):
        return JSONResponse(content={"detail": "Not authorized"}, status_code=403)
    if chat.response_mode != ResponseMode.HYBRID:
        return JSONResponse(
            content={"detail": "Chat is not in Hybrid mode"}, status_code=409
        )
    if chat.status != ChatStatus.ACTIVE:
        return JSONResponse(content={"detail": "Chat is not active"}, status_code=409)
    latest = (
        db.query(Message)
        .filter(
            Message.chat_id == chat_id,
            Message.sender_id == chat.user_id,
            Message.is_system.is_(False),
        )
        .order_by(desc(Message.id))
        .first()
    )
    if not latest:
        return JSONResponse(
            content={"detail": "No client message to reply to"}, status_code=400
        )

    launched = reading_burst.request_hybrid_regeneration(chat_id)
    if launched is None:
        return JSONResponse(
            content={"detail": "Hybrid generation is unavailable for this engine"},
            status_code=409,
        )
    if not launched:
        return JSONResponse(
            content={"detail": "There are no unanswered client messages"},
            status_code=409,
        )
    logger.info("hybrid_regen_requested", chat_id=chat_id, by=user.id, message_id=latest.id)
    return JSONResponse(
        content={"chat_id": chat_id, "status": "generating"}, status_code=202
    )


@router.post("/{chat_id}/drafts/{draft_id}/send")
async def send_draft(
    chat_id: int,
    draft_id: int,
    payload: DraftSend,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    chat = db.query(Chat).filter(Chat.id == chat_id).first()
    if not chat:
        return JSONResponse(content={"detail": "Chat not found"}, status_code=404)
    if not _authorize(user, chat):
        return JSONResponse(content={"detail": "Not authorized"}, status_code=403)

    draft = (
        db.query(AiDraft)
        .filter(AiDraft.id == draft_id, AiDraft.chat_id == chat_id)
        .first()
    )
    if not draft:
        return JSONResponse(content={"detail": "Draft not found"}, status_code=404)
    if draft.status != AiDraftStatus.PENDING:
        return JSONResponse(
            content={"detail": f"Draft already {draft.status.value.lower()}"},
            status_code=400,
        )

    content = (payload.content or draft.draft_text or "").strip()
    if not content:
        return JSONResponse(content={"detail": "Empty message"}, status_code=400)

    # Advance a Hybrid unanswered-message boundary in the SAME transaction as
    # delivery. SABRI fallback drafts retain their established manual-send path.
    from app.enums.response_mode import ResponseMode
    from app.services.chats import (
        broadcast_persisted_ai_message,
        prepare_ai_message,
    )

    client_turn = None
    exact_session_id = None
    if draft.mode == ResponseMode.HYBRID:
        from app.services.ai.reading_burst import stage_hybrid_draft_send

        staged = stage_hybrid_draft_send(db, chat, draft.id)
        if staged is None:
            if draft.status == AiDraftStatus.DISCARDED:
                db.commit()
                return JSONResponse(
                    content={
                        "detail": "This draft is no longer current. Generate a fresh reply."
                    },
                    status_code=409,
                )
            db.rollback()
            current = db.get(AiDraft, draft.id)
            if current is not None and current.status != AiDraftStatus.PENDING:
                return JSONResponse(
                    content={
                        "detail": f"Draft already {current.status.value.lower()}"
                    },
                    status_code=400,
                )
            return JSONResponse(
                content={
                    "detail": "This draft is no longer current. Generate a fresh reply."
                },
                status_code=409,
            )
        client_turn, exact_session_id = staged
    else:
        if not _stage_fallback_draft_decision(
            db, chat.id, draft.id, AiDraftStatus.SENT
        ):
            db.rollback()
            current = db.get(AiDraft, draft.id)
            return JSONResponse(
                content={
                    "detail": (
                        f"Draft already {current.status.value.lower()}"
                        if current is not None
                        else "Draft not found"
                    )
                },
                status_code=400 if current is not None else 404,
            )

    message = prepare_ai_message(
        db, chat, content, chat_session_id=exact_session_id
    )
    db.commit()
    db.refresh(message)
    await broadcast_persisted_ai_message(db, chat, message)

    # Memory: the APPROVED text (operator edits included) is delivered content,
    # so record it on the engine's session state — Valentina's next turn must
    # see what was actually said, exactly as Automatic reveals already do. Also
    # advance the commitment ledger (cards/timing) — delivery is the only event
    # that does; discarded or regenerated drafts never touch memory.
    try:
        from app.services.ai.reading_ledger import record_commitments
        from app.services.ai.reading_session import (
            get_session_store,
            record_client_message,
            record_sent_message,
        )

        store = get_session_store()
        # get_or_create, not get: a chat whose drafts only ever came from the
        # manual "New reply" path has no persisted state yet (that path builds
        # its state throwaway) — the first APPROVED delivery is exactly when
        # durable engine memory should begin to exist.
        state = store.get_or_create(
            f"chat:{chat_id}", client_id=chat.user_id, chat_id=chat_id
        )
        transcript = getattr(state, "chat_transcript", None) or []
        client_turn_already_recorded = bool(
            client_turn is not None
            and transcript
            and isinstance(transcript[-1], dict)
            and transcript[-1].get("role") == "client"
            and transcript[-1].get("content") == client_turn
        )
        if client_turn is not None and not client_turn_already_recorded:
            record_client_message(state, client_turn)
        record_sent_message(state, content)
        record_commitments(state, content)
        store.put(state)
    except Exception:  # noqa: BLE001 — memory must never break a send
        logger.exception("draft_send_memory_record_failed", chat_id=chat_id)

    logger.info("ai_draft_sent", chat_id=chat_id, draft_id=draft_id, by=user.id)
    return JSONResponse(
        content={"draft_id": draft_id, "message_id": message.id, "status": "SENT"},
        status_code=200,
    )


@router.post("/{chat_id}/drafts/{draft_id}/discard")
def discard_draft(
    chat_id: int,
    draft_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    chat = db.query(Chat).filter(Chat.id == chat_id).first()
    if not chat:
        return JSONResponse(content={"detail": "Chat not found"}, status_code=404)
    if not _authorize(user, chat):
        return JSONResponse(content={"detail": "Not authorized"}, status_code=403)

    draft = (
        db.query(AiDraft)
        .filter(AiDraft.id == draft_id, AiDraft.chat_id == chat_id)
        .first()
    )
    if not draft:
        return JSONResponse(content={"detail": "Draft not found"}, status_code=404)
    if draft.status != AiDraftStatus.PENDING:
        return JSONResponse(
            content={"detail": f"Draft already {draft.status.value.lower()}"},
            status_code=400,
        )

    from app.enums.response_mode import ResponseMode

    if draft.mode == ResponseMode.HYBRID:
        from app.services.ai.reading_burst import stage_hybrid_draft_discard

        if not stage_hybrid_draft_discard(db, chat, draft.id):
            db.rollback()
            current = db.get(AiDraft, draft.id)
            if current is not None and current.status != AiDraftStatus.PENDING:
                return JSONResponse(
                    content={
                        "detail": f"Draft already {current.status.value.lower()}"
                    },
                    status_code=400,
                )
            return JSONResponse(
                content={"detail": "This draft is no longer current."},
                status_code=409,
            )
    else:
        if not _stage_fallback_draft_decision(
            db, chat.id, draft.id, AiDraftStatus.DISCARDED
        ):
            db.rollback()
            current = db.get(AiDraft, draft.id)
            return JSONResponse(
                content={
                    "detail": (
                        f"Draft already {current.status.value.lower()}"
                        if current is not None
                        else "Draft not found"
                    )
                },
                status_code=400 if current is not None else 404,
            )
    db.commit()
    logger.info("ai_draft_discarded", chat_id=chat_id, draft_id=draft_id, by=user.id)
    return JSONResponse(content={"draft_id": draft_id, "status": "DISCARDED"}, status_code=200)


# ── Operator steering notes (Hybrid-only, session-scoped) ────────────────────
# Guidance the operator leaves for Valentina's drafting. Bound to the chat's
# CURRENT session (expires with it) and only ever retrieved while the chat is
# in HYBRID mode — reading_steering.get_active_notes enforces both. Retired
# notes are kept inactive as the audit trail.


def _note_out(n) -> dict:
    return {
        "id": n.id,
        "chat_id": n.chat_id,
        "chat_session_id": n.chat_session_id,
        "note": n.note,
        "active": n.active,
        "created_by": n.created_by,
        "created_at": n.created_at.isoformat() if n.created_at else None,
    }


@router.get("/{chat_id}/steering-notes")
def list_steering_notes(
    chat_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Active notes of the chat's CURRENT session (chips in the cockpit)."""
    chat = db.query(Chat).filter(Chat.id == chat_id).first()
    if not chat:
        return JSONResponse(content={"detail": "Chat not found"}, status_code=404)
    if not _authorize(user, chat):
        return JSONResponse(content={"detail": "Not authorized"}, status_code=403)

    from app.models.reading_steering_note import ReadingSteeringNote
    from app.services.ai.reading_steering import current_session

    session = current_session(db, chat_id)
    if session is None:
        return JSONResponse(content=[], status_code=200)
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
    return JSONResponse(content=[_note_out(n) for n in rows], status_code=200)


@router.post("/{chat_id}/steering-notes")
def add_steering_note(
    chat_id: int,
    payload: SteeringNoteCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Leave guidance for Valentina's next drafts. HYBRID chats only; requires
    a current session to bind to (notes are session-scoped by contract)."""
    from app.enums.response_mode import ResponseMode

    chat = db.query(Chat).filter(Chat.id == chat_id).first()
    if not chat:
        return JSONResponse(content={"detail": "Chat not found"}, status_code=404)
    if not _authorize(user, chat):
        return JSONResponse(content={"detail": "Not authorized"}, status_code=403)
    if chat.response_mode != ResponseMode.HYBRID:
        return JSONResponse(
            content={"detail": "Steering notes are Hybrid-mode only"}, status_code=409
        )
    text = (payload.note or "").strip()
    if not text:
        return JSONResponse(content={"detail": "Empty note"}, status_code=400)

    from app.services.ai.reading_steering import create_note

    row = create_note(db, chat_id, text, created_by=user.id)
    if row is None:
        return JSONResponse(
            content={"detail": "No active session to attach the note to"},
            status_code=409,
        )
    return JSONResponse(content=_note_out(row), status_code=201)


@router.post("/{chat_id}/steering-notes/{note_id}/retire")
def retire_steering_note(
    chat_id: int,
    note_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """One-tap retire from the chips row (kept inactive as audit trail)."""
    chat = db.query(Chat).filter(Chat.id == chat_id).first()
    if not chat:
        return JSONResponse(content={"detail": "Chat not found"}, status_code=404)
    if not _authorize(user, chat):
        return JSONResponse(content={"detail": "Not authorized"}, status_code=403)

    from app.services.ai.reading_steering import retire_note

    row = retire_note(db, chat_id, note_id, retired_by=user.id)
    if row is None:
        return JSONResponse(content={"detail": "Note not found"}, status_code=404)
    return JSONResponse(content=_note_out(row), status_code=200)
