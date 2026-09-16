"""Per-message client inbox and explicit chat-open acknowledgement."""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.config import get_app_settings
from app.database.client import get_db
from app.dependencies.get_current_user import get_current_user
from app.enums.role import Role
from app.models import User
from app.schemas.client_inbox import ChatOpened, ClientInbox
from app.services.client_inbox import list_client_chats, mark_chat_opened


def _client(user: User = Depends(get_current_user)):
    if get_app_settings().BILLING_MODE != "per_message":
        raise HTTPException(status_code=409, detail="NOT_AVAILABLE_PER_MINUTE")
    if user.role != Role.USER:
        raise HTTPException(status_code=403, detail="Client account required")
    return user


router = APIRouter()


@router.get("/inbox", response_model=ClientInbox)
def get_client_inbox(
    offset: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    user: User = Depends(_client),
    db: Session = Depends(get_db),
):
    """Newest activity first; unread excludes system messages and fixed openers."""
    return list_client_chats(db, user.id, offset=offset, limit=limit)


@router.post("/{chat_id}/open", response_model=ChatOpened)
def open_client_chat(
    chat_id: int,
    user: User = Depends(_client),
    db: Session = Depends(get_db),
):
    """Acknowledge opening this chat; replies arriving later are unread again."""
    return mark_chat_opened(db, chat_id, user.id)
