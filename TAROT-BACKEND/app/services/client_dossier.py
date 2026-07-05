"""
Client dossier service — platform-wide reading history for a client.

Powers the psychic cockpit's client-context card and the superadmin dossier
view: past reading notes (from ANY psychic), spend totals (client spend only —
psychics are salaried, there is no cut), reading count, new/returning status,
and astrology (zodiac + life path derived from DOB via the /oracle engine).
"""
import json
from datetime import datetime, timedelta
from typing import Optional

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.enums.transaction_type import TransactionType
from app.logging_config import get_logger
from app.models.client_note import ClientNote
from app.models.transaction import Transaction
from app.models.user import User
from app.utils.life_path_calculator import calculate_life_path_number
from app.utils.zodiac_calculator import get_zodiac_sign_from_date

logger = get_logger(__name__)


def create_client_note(
    db: Session,
    client_id: int,
    author_psychic_id: Optional[int],
    chat_id: Optional[int],
    note: str,
) -> ClientNote:
    """Save a dossier note against the CLIENT's profile (platform-wide)."""
    entry = ClientNote(
        client_id=client_id,
        author_psychic_id=author_psychic_id,
        chat_id=chat_id,
        note=note.strip(),
    )
    db.add(entry)
    db.commit()
    db.refresh(entry)
    logger.info(
        "client_note_created",
        note_id=entry.id,
        client_id=client_id,
        author_psychic_id=author_psychic_id,
        chat_id=chat_id,
    )
    return entry


def _spend_since(db: Session, client_id: int, since: Optional[datetime]) -> float:
    """Sum of a client's DEBITs (their spend) since `since` (or all-time)."""
    q = db.query(func.coalesce(func.sum(Transaction.amount), 0)).filter(
        Transaction.user_id == client_id,
        Transaction.transaction_type == TransactionType.DEBIT,
    )
    if since is not None:
        q = q.filter(Transaction.created_at >= since)
    return round(float(q.scalar() or 0), 2)


def get_client_stats(db: Session, client_id: int) -> dict:
    """Client-spend totals + reading count + new/returning (client spend only)."""
    now = datetime.now()
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    # "This week" = since Monday 00:00.
    week_start = today_start - timedelta(days=today_start.weekday())

    lifetime_spend = _spend_since(db, client_id, None)
    today_spend = _spend_since(db, client_id, today_start)
    week_spend = _spend_since(db, client_id, week_start)

    # Distinct billed chats = past readings that consumed time.
    session_count = (
        db.query(func.count(func.distinct(Transaction.related_chat_id)))
        .filter(
            Transaction.user_id == client_id,
            Transaction.transaction_type == TransactionType.DEBIT,
            Transaction.related_chat_id.isnot(None),
        )
        .scalar()
        or 0
    )

    notes_count = (
        db.query(func.count(ClientNote.id))
        .filter(ClientNote.client_id == client_id)
        .scalar()
        or 0
    )

    is_returning = session_count > 1 or notes_count > 0

    return {
        "lifetime_spend": lifetime_spend,
        "today_spend": today_spend,
        "week_spend": week_spend,
        "session_count": int(session_count),
        "notes_count": int(notes_count),
        "is_returning": bool(is_returning),
    }


def get_chat_spend_split(db: Session, chat_id: int) -> dict:
    """
    What the client spent in THIS reading (the current session only), split into
    free credit vs paid — read from each per-minute DEBIT's metadata
    (credit_spent / paid_spent). Used by the psychic end screen. Client spend only.

    Chat rows are REUSED across repeat readings with the same psychic, so scope to
    the latest ChatSession — otherwise this sums every past session's spend
    (lifetime totals live in the dossier, not the session receipt).
    """
    from app.models.chat_session import ChatSession
    from app.models.session_intervals import SessionInterval

    session = (
        db.query(ChatSession)
        .filter(ChatSession.chat_id == chat_id)
        .order_by(ChatSession.id.desc())
        .first()
    )

    debits = []
    if session:
        debits = (
            db.query(Transaction)
            .join(
                SessionInterval,
                Transaction.related_session_interval_id == SessionInterval.id,
            )
            .filter(
                SessionInterval.session_id == session.id,
                Transaction.transaction_type == TransactionType.DEBIT,
            )
            .all()
        )
    total = 0.0
    credit_spent = 0.0
    paid_spent = 0.0
    for t in debits:
        total += float(t.amount or 0)
        meta = {}
        if t.transaction_metadata:
            try:
                meta = json.loads(t.transaction_metadata)
            except (ValueError, TypeError):
                meta = {}
        credit_spent += float(meta.get("credit_spent", 0) or 0)
        paid_spent += float(meta.get("paid_spent", 0) or 0)

    # If metadata was missing (legacy rows), fall back to all-paid.
    if round(credit_spent + paid_spent, 2) != round(total, 2):
        credit_spent = credit_spent if credit_spent else 0.0
        paid_spent = round(total - credit_spent, 2)

    return {
        "total_spent": round(total, 2),
        "credit_spent": round(credit_spent, 2),
        "paid_spent": round(paid_spent, 2),
        "minutes": len(debits),
    }


def get_client_astro(client: User) -> dict:
    """Zodiac + life path derived from the client's DOB (reuses /oracle utils)."""
    dob = client.date_of_birth
    if not dob:
        return {"date_of_birth": None, "zodiac": None, "life_path": None}
    try:
        zodiac = get_zodiac_sign_from_date(dob)
    except Exception:
        zodiac = None
    try:
        life_path = calculate_life_path_number(dob)
    except Exception:
        life_path = None
    return {
        "date_of_birth": dob.isoformat() if dob else None,
        "zodiac": zodiac,
        "life_path": life_path,
    }


def get_client_dossier(db: Session, client_id: int) -> Optional[dict]:
    """
    Full dossier for a client: profile + astro + spend stats + all reading notes
    (newest first), each with its author psychic's name.
    """
    client = db.query(User).filter(User.id == client_id).first()
    if not client:
        return None

    notes = (
        db.query(ClientNote)
        .filter(ClientNote.client_id == client_id)
        .order_by(ClientNote.created_at.desc())
        .all()
    )

    # Resolve author names in one pass.
    author_ids = {n.author_psychic_id for n in notes if n.author_psychic_id}
    authors = {}
    if author_ids:
        for u in db.query(User).filter(User.id.in_(author_ids)).all():
            authors[u.id] = u.username

    notes_out = [
        {
            "id": n.id,
            "note": n.note,
            "chat_id": n.chat_id,
            "author_psychic_id": n.author_psychic_id,
            "author_name": authors.get(n.author_psychic_id) or "A reader",
            "created_at": n.created_at.isoformat() if n.created_at else None,
        }
        for n in notes
    ]

    stats = get_client_stats(db, client_id)
    astro = get_client_astro(client)

    return {
        "client": {
            "id": client.id,
            "username": client.username,
            "email": client.email,
            **astro,
        },
        "stats": stats,
        "notes": notes_out,
    }
