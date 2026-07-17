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
from app.schemas.reading_ai import DraftSend, ResponseModeUpdate

router = APIRouter()
logger = get_logger(__name__)


def _authorize(user: User, chat: Chat) -> bool:
    """Admins/superadmins, or the reader assigned to the chat. NOT the client."""
    if user.role in (Role.ADMIN, Role.SUPERADMIN):
        return True
    return user.id == chat.psychic_id


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
    from app.services.ai.reading_hybrid import cancel_ai_turns_for_mode_change

    await cancel_ai_turns_for_mode_change(chat_id, payload.mode)
    return JSONResponse(
        content={"chat_id": chat_id, "response_mode": payload.mode.value},
        status_code=200,
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

    # Deliver as the reader, tagged AI_DRAFTED (an admin approved this AI draft).
    from app.services.chats import broadcast_ai_message

    message = await broadcast_ai_message(db, chat, content)

    draft.status = AiDraftStatus.SENT
    db.commit()
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
    if draft.status == AiDraftStatus.PENDING:
        draft.status = AiDraftStatus.DISCARDED
        db.commit()
    logger.info("ai_draft_discarded", chat_id=chat_id, draft_id=draft_id, by=user.id)
    return JSONResponse(content={"draft_id": draft_id, "status": "DISCARDED"}, status_code=200)
