"""The owner's phone routes for per-message conversations, mounted at /api/admin.

Owner-only: every route depends on require_permission(Permission.MANAGE_SETTINGS),
which only SUPERADMIN holds (app/enums/role.py), as the admin library routes do,
and answers only under per-message billing. No reader token ever reaches the
phone: a reply is sent as the reader on the server
(services/owner_messaging.send_as_reader).
"""

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.database.client import get_db
from app.dependencies.authorization import require_permission
from app.dependencies.billing_mode import require_per_message_billing
from app.dependencies.get_current_user import get_current_user
from app.enums.permissions import Permission
from app.enums.response_mode import ResponseMode
from app.models import Chat, User
from app.schemas.owner_messaging import (
    OwnerInbox,
    OwnerModeResult,
    OwnerModeUpdate,
    OwnerReply,
    OwnerReplySent,
    OwnerSuggestionDiscarded,
    OwnerSuggestionRequested,
    OwnerThread,
    OwnerTyping,
)
from app.schemas.reading_ai import TypingUpdate
from app.services import offline_replies
from app.services.ai import reading_single
from app.services.owner_messaging import (
    MODES,
    NotPersonAnswered,
    chat_thread,
    current_suggestion_id,
    discard_suggestion,
    owner_inbox,
    send_as_reader,
    set_conversation_mode,
)

router = APIRouter(
    dependencies=[
        Depends(require_permission(Permission.MANAGE_SETTINGS)),
        Depends(require_per_message_billing),
    ]
)

CHAT_NOT_FOUND = "Chat not found"
CHAT_IS_AUTOMATIC = "CHAT_IS_AUTOMATIC"
NOTHING_TO_ANSWER = "NOTHING_TO_ANSWER"
NO_SUGGESTION = "NO_SUGGESTION"


def _chat(db: Session, chat_id: int) -> Chat:
    chat = db.get(Chat, chat_id)
    if chat is None:
        raise HTTPException(status_code=404, detail=CHAT_NOT_FOUND)
    return chat


def _person_answered(db: Session, chat_id: int) -> Chat:
    chat = _chat(db, chat_id)
    if chat.response_mode == ResponseMode.SABRI:
        raise HTTPException(status_code=409, detail=CHAT_IS_AUTOMATIC)
    return chat


@router.get("/inbox", response_model=OwnerInbox)
def get_owner_inbox(
    offset: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
):
    """Every conversation across every reader, in one query: suggestion waiting
    first, then waiting for a reply (soonest refund first), then newest."""
    return owner_inbox(db, offset=offset, limit=limit)


@router.get("/chats/{chat_id}/thread", response_model=OwnerThread)
def get_owner_thread(
    chat_id: int,
    before_id: Optional[int] = Query(None, ge=1),
    limit: int = Query(50, ge=1, le=100),
    db: Session = Depends(get_db),
):
    """The newest messages, or those before ``before_id``. Marks nothing read."""
    try:
        return chat_thread(db, chat_id, before_id=before_id, limit=limit)
    except LookupError:
        raise HTTPException(status_code=404, detail=CHAT_NOT_FOUND)


@router.put("/chats/{chat_id}/mode", response_model=OwnerModeResult)
async def put_owner_mode(
    chat_id: int,
    payload: OwnerModeUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    try:
        return await set_conversation_mode(db, chat_id, MODES[payload.mode], by=user.id)
    except LookupError:
        raise HTTPException(status_code=404, detail=CHAT_NOT_FOUND)


@router.post("/chats/{chat_id}/suggestion/send", response_model=OwnerReplySent)
async def send_owner_reply(
    chat_id: int,
    payload: OwnerReply,
    db: Session = Depends(get_db),
):
    """Send the (possibly edited) suggestion, or his own words, as the reader.
    The current suggestion, if any, is marked SENT."""
    chat = _person_answered(db, chat_id)
    suggestion_id = current_suggestion_id(db, chat)
    try:
        message, closed, used = await send_as_reader(
            db, chat_id, payload.content, suggestion_id=suggestion_id
        )
    except NotPersonAnswered:
        raise HTTPException(status_code=409, detail=CHAT_IS_AUTOMATIC)
    return {"chat_id": chat_id, "message_id": message.id, "suggestion_id": used,
            "closed_as_answered": closed}


@router.post("/chats/{chat_id}/suggestion/discard", response_model=OwnerSuggestionDiscarded)
def discard_owner_suggestion(chat_id: int, db: Session = Depends(get_db)):
    """Drop the pending suggestion. Nothing is sent."""
    _chat(db, chat_id)
    suggestion_id = discard_suggestion(db, chat_id)
    if suggestion_id is None:
        raise HTTPException(status_code=404, detail=NO_SUGGESTION)
    return {"chat_id": chat_id, "suggestion_id": suggestion_id}


@router.post(
    "/chats/{chat_id}/suggestion/regenerate",
    status_code=202,
    response_model=OwnerSuggestionRequested,
)
async def regenerate_owner_suggestion(chat_id: int, db: Session = Depends(get_db)):
    """Write a new suggestion for every unanswered paid message; it replaces
    the pending one when it is stored."""
    chat = _person_answered(db, chat_id)
    waiting = offline_replies.unanswered(db, chat)
    if not waiting:
        raise HTTPException(status_code=409, detail=NOTHING_TO_ANSWER)
    reading_single.request_suggestion(chat_id)
    return {"chat_id": chat_id, "status": "generating",
            "unanswered_message_ids": [m.id for m in waiting]}


@router.put("/chats/{chat_id}/typing", response_model=OwnerTyping)
async def put_owner_typing(
    chat_id: int,
    payload: TypingUpdate,
    db: Session = Depends(get_db),
):
    """The reader's typing dots in her room while the owner types: the same
    typing_start and typing_stop frames the reader engines send."""
    from app.services.ai.reading_executor import broadcast_typing

    chat = _person_answered(db, chat_id)
    await broadcast_typing(chat_id, payload.typing, chat.psychic_id)
    return {"chat_id": chat_id, "typing": payload.typing}
