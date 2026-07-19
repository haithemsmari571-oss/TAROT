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
from app.schemas.client_dossier import ClientNoteCreate, ClientNoteUpdate
from app.services.client_dossier import (
    create_client_note,
    get_chat_spend_split,
    get_client_dossier,
    get_client_stats,
    update_client_note,
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
        title=body.title,
    )

    return JSONResponse(
        content={
            "id": entry.id,
            "client_id": entry.client_id,
            "author_psychic_id": entry.author_psychic_id,
            "chat_id": entry.chat_id,
            "title": entry.title,
            "note": entry.note,
            "author_name": user.username,
            "created_at": entry.created_at.isoformat() if entry.created_at else None,
        },
        status_code=201,
    )


@router.patch("/clients/{client_id}/notes/{note_id}")
def edit_note(
    client_id: int,
    note_id: int,
    body: ClientNoteUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Edit an existing dossier note (title and/or body). Psychic/admin/superadmin."""
    if user.role not in _ALLOWED:
        return JSONResponse(content={"detail": "Not authorized"}, status_code=403)

    entry = update_client_note(db, note_id, title=body.title, note=body.note)
    if entry is None:
        return JSONResponse(content={"detail": "Note not found"}, status_code=404)

    return JSONResponse(
        content={
            "id": entry.id,
            "client_id": entry.client_id,
            "author_psychic_id": entry.author_psychic_id,
            "chat_id": entry.chat_id,
            "title": entry.title,
            "note": entry.note,
            "created_at": entry.created_at.isoformat() if entry.created_at else None,
        },
        status_code=200,
    )


# ── Client-records vault mappings (Second Brain CRM, read-only) ──────────────
# Review workflow for auto-proposed tarot-client → vault-file matches. Admins
# only (not psychics): confirming a mapping feeds a long-term client archive
# into draft generation, an operator-level trust decision. Only CONFIRMED rows
# are ever read by the pipeline — PENDING/REJECTED are invisible to it.

_MAPPING_ADMIN = (Role.ADMIN, Role.SUPERADMIN)


def _mapping_out(m) -> dict:
    return {
        "id": m.id,
        "user_id": m.user_id,
        "vault_filename": m.vault_filename,
        "vault_client_uid": m.vault_client_uid,
        "vault_dob": m.vault_dob.isoformat() if m.vault_dob else None,
        "dob_tier": m.dob_tier,
        "match_method": m.match_method,
        "match_score": m.match_score,
        "status": m.status,
        "reviewed_by": m.reviewed_by,
        "reviewed_at": m.reviewed_at.isoformat() if m.reviewed_at else None,
        "created_at": m.created_at.isoformat() if m.created_at else None,
    }


@router.post("/client-record-mappings/scan")
def scan_client_record_mappings(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Run the auto-matcher over all client users; upsert PENDING proposals."""
    if user.role not in _MAPPING_ADMIN:
        return JSONResponse(content={"detail": "Not authorized"}, status_code=403)
    from app.services.client_record_matching import scan_and_propose

    return JSONResponse(content=scan_and_propose(db), status_code=200)


@router.get("/client-record-mappings")
def list_client_record_mappings(
    status: str | None = None,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """List mapping proposals, optionally filtered by status (PENDING/...)."""
    if user.role not in _MAPPING_ADMIN:
        return JSONResponse(content={"detail": "Not authorized"}, status_code=403)
    from app.models.client_record_mapping import ClientRecordMapping

    q = db.query(ClientRecordMapping).order_by(ClientRecordMapping.id)
    if status:
        q = q.filter(ClientRecordMapping.status == status.upper())
    rows = q.all()
    # username alongside each row so the reviewer can judge without a join
    names = {
        u.id: u.username
        for u in db.query(User).filter(User.id.in_([m.user_id for m in rows])).all()
    } if rows else {}
    out = [{**_mapping_out(m), "username": names.get(m.user_id)} for m in rows]
    return JSONResponse(content=out, status_code=200)


@router.post("/client-record-mappings/{mapping_id}/confirm")
def confirm_client_record_mapping(
    mapping_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Human approval: this mapping becomes usable by draft generation."""
    if user.role not in _MAPPING_ADMIN:
        return JSONResponse(content={"detail": "Not authorized"}, status_code=403)
    from app.services.client_record_matching import review_mapping

    row = review_mapping(db, mapping_id, confirm=True, reviewer_id=user.id)
    if row is None:
        return JSONResponse(content={"detail": "Mapping not found"}, status_code=404)
    return JSONResponse(content=_mapping_out(row), status_code=200)


@router.post("/client-record-mappings/{mapping_id}/reject")
def reject_client_record_mapping(
    mapping_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Human refusal: kept as REJECTED so the scanner never re-proposes it."""
    if user.role not in _MAPPING_ADMIN:
        return JSONResponse(content={"detail": "Not authorized"}, status_code=403)
    from app.services.client_record_matching import review_mapping

    row = review_mapping(db, mapping_id, confirm=False, reviewer_id=user.id)
    if row is None:
        return JSONResponse(content={"detail": "Mapping not found"}, status_code=404)
    return JSONResponse(content=_mapping_out(row), status_code=200)
