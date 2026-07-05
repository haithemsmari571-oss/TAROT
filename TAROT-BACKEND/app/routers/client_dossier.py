"""
Client dossier router.

The platform-wide client dossier: any psychic (or admin/superadmin) can read a
client's full reading history + notes during or outside a reading, and save a
note that follows the client across every future reading. Client spend only —
psychics are salaried, there is no cut.
"""
from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from app.database.client import get_db
from app.dependencies.get_current_user import get_current_user
from app.enums.role import Role
from app.logging_config import get_logger
from app.models.user import User
from app.models.chat import Chat
from app.schemas.client_dossier import ClientNoteCreate
from app.services.client_dossier import (
    create_client_note,
    get_chat_spend_split,
    get_client_dossier,
    get_client_stats,
)

router = APIRouter()
logger = get_logger(__name__)

_ALLOWED = (Role.PSYCHIC, Role.ADMIN, Role.SUPERADMIN)


@router.get("/clients/{client_id}/dossier")
def get_dossier(
    client_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Full dossier for a client (psychic/admin/superadmin only)."""
    if user.role not in _ALLOWED:
        return JSONResponse(content={"detail": "Not authorized"}, status_code=403)

    dossier = get_client_dossier(db, client_id)
    if dossier is None:
        return JSONResponse(content={"detail": "Client not found"}, status_code=404)

    return JSONResponse(content=dossier, status_code=200)


@router.get("/chat/{chat_id}/spend-summary")
def chat_spend_summary(
    chat_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    End-screen summary for a reading: the client's spend this session (free/paid
    split + minutes) plus their today / this-week client-spend totals. Client
    spend only — psychics are salaried.
    """
    if user.role not in _ALLOWED:
        return JSONResponse(content={"detail": "Not authorized"}, status_code=403)

    chat = db.query(Chat).filter(Chat.id == chat_id).first()
    if not chat:
        return JSONResponse(content={"detail": "Chat not found"}, status_code=404)

    split = get_chat_spend_split(db, chat_id)
    stats = get_client_stats(db, chat.user_id)
    return JSONResponse(
        content={
            "chat_id": chat_id,
            "client_id": chat.user_id,
            "session": split,
            "today_spend": stats["today_spend"],
            "week_spend": stats["week_spend"],
            "lifetime_spend": stats["lifetime_spend"],
        },
        status_code=200,
    )


@router.post("/clients/{client_id}/notes")
def add_note(
    client_id: int,
    body: ClientNoteCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Save a dossier note against the client's profile. Written on session end by
    the psychic (or by an admin/superadmin from the dossier view). The author is
    the current user unless an admin is acting as a psychic, in which case the
    author still records who wrote it.
    """
    if user.role not in _ALLOWED:
        return JSONResponse(content={"detail": "Not authorized"}, status_code=403)

    client = db.query(User).filter(User.id == client_id).first()
    if not client:
        return JSONResponse(content={"detail": "Client not found"}, status_code=404)

    entry = create_client_note(
        db=db,
        client_id=client_id,
        author_psychic_id=user.id,
        chat_id=body.chat_id,
        note=body.note,
    )

    return JSONResponse(
        content={
            "id": entry.id,
            "client_id": entry.client_id,
            "author_psychic_id": entry.author_psychic_id,
            "chat_id": entry.chat_id,
            "note": entry.note,
            "author_name": user.username,
            "created_at": entry.created_at.isoformat() if entry.created_at else None,
        },
        status_code=201,
    )
