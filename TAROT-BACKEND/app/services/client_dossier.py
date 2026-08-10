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
from app.models.chat import Chat
from app.models.client_note import ClientNote
from app.models.transaction import Transaction
from app.models.user import User
from app.utils.life_path_calculator import calculate_life_path_number
from app.utils.zodiac_calculator import get_zodiac_sign_from_date

logger = get_logger(__name__)


def _auto_title(note: str) -> str:
    """Derive a short title from the first ~6 words of the body."""
    words = (note or "").strip().split()
    title = " ".join(words[:6])
    if len(words) > 6:
        title += "…"
    return title or "Note"


def create_client_note(
    db: Session,
    client_id: int,
    author_psychic_id: Optional[int],
    chat_id: Optional[int],
    note: str,
    title: Optional[str] = None,
) -> ClientNote:
    """Save a dossier note against the CLIENT's profile (platform-wide)."""
    clean_title = (title or "").strip() or _auto_title(note)
    entry = ClientNote(
        client_id=client_id,
        author_psychic_id=author_psychic_id,
        chat_id=chat_id,
        title=clean_title[:200],
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


def update_client_note(
    db: Session,
    client_id: int,
    note_id: int,
    title: Optional[str] = None,
    note: Optional[str] = None,
) -> Optional[ClientNote]:
    """Edit a note only when it belongs to the requested client."""
    entry = (
        db.query(ClientNote)
        .filter(ClientNote.id == note_id, ClientNote.client_id == client_id)
        .first()
    )
    if not entry:
        return None
    if note is not None:
        entry.note = note.strip()
        # If no explicit title was ever set, keep the auto-title in sync.
        if title is None and not (entry.title or "").strip():
            entry.title = _auto_title(entry.note)
    if title is not None:
        entry.title = (title.strip() or _auto_title(entry.note))[:200]
    db.commit()
    db.refresh(entry)
    logger.info("client_note_updated", note_id=note_id, client_id=client_id)
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


def get_client_sessions(db: Session, client_id: int, limit: int = 50) -> list:
    """
    A client's past readings, newest first. One row per billed chat (grouped by
    related_chat_id from the per-minute DEBITs): the reader, the reading date,
    minutes billed, and total client spend. Client spend only — psychics are
    salaried, there is no cut. Powers the superadmin dossier's session history.
    """
    rows = (
        db.query(
            Transaction.related_chat_id.label("chat_id"),
            func.coalesce(func.sum(Transaction.amount), 0).label("spend"),
            func.count(Transaction.id).label("minutes"),
            func.max(Transaction.created_at).label("last_at"),
        )
        .filter(
            Transaction.user_id == client_id,
            Transaction.transaction_type == TransactionType.DEBIT,
            Transaction.related_chat_id.isnot(None),
        )
        .group_by(Transaction.related_chat_id)
        .order_by(func.max(Transaction.created_at).desc())
        .limit(limit)
        .all()
    )

    chat_ids = [r.chat_id for r in rows]
    chats = {}
    if chat_ids:
        chats = {c.id: c for c in db.query(Chat).filter(Chat.id.in_(chat_ids)).all()}

    # Resolve reader (psychic) names in one pass.
    psychic_ids = {c.psychic_id for c in chats.values() if c.psychic_id}
    names = {}
    if psychic_ids:
        for u in db.query(User).filter(User.id.in_(psychic_ids)).all():
            names[u.id] = u.username

    out = []
    for r in rows:
        chat = chats.get(r.chat_id)
        psychic_id = chat.psychic_id if chat else None
        out.append(
            {
                "chat_id": r.chat_id,
                "reader_name": names.get(psychic_id) or "A reader",
                "spend": round(float(r.spend or 0), 2),
                "minutes": int(r.minutes or 0),
                "last_at": r.last_at.isoformat() if r.last_at else None,
            }
        )
    return out


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


def get_client_dob(db: Session, client_id: int):
    """The client's raw date_of_birth (a date), or None if unknown / on any error.
    Used by the single-agent Reader to compute authoritative numerology facts for
    injection — optional enrichment, so it must never raise and abort the turn."""
    try:
        return db.query(User.date_of_birth).filter(User.id == client_id).scalar()
    except Exception:  # noqa: BLE001 — DOB is optional; never break a reading over it
        return None


def get_client_gifts(db: Session, client_id: int, limit: int = 20) -> list:
    """Recent personal Stardust gifts sent to this client (newest first) — a
    simple log for the dossier. Reads GIFT ledger rows."""
    import json

    rows = (
        db.query(Transaction)
        .filter(
            Transaction.user_id == client_id,
            Transaction.transaction_type == TransactionType.GIFT,
        )
        .order_by(Transaction.created_at.desc())
        .limit(limit)
        .all()
    )
    out = []
    for t in rows:
        admin_name = None
        if t.transaction_metadata:
            try:
                admin_name = json.loads(t.transaction_metadata).get("admin_username")
            except Exception:
                admin_name = None
        # Description is "Admin gift: <message>" — surface the note if present.
        note = None
        if t.description and t.description.startswith("Admin gift:"):
            note = t.description[len("Admin gift:"):].strip() or None
        out.append(
            {
                "id": t.id,
                "amount": round(float(t.amount or 0), 2),
                "message": note,
                "sent_by": admin_name,
                "created_at": t.created_at.isoformat() if t.created_at else None,
            }
        )
    return out


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
            # Legacy notes have no stored title — auto-title from the body.
            "title": (n.title or "").strip() or _auto_title(n.note),
            "note": n.note,
            "chat_id": n.chat_id,
            "author_psychic_id": n.author_psychic_id,
            # "HUMAN" (a reader/admin wrote it) or "AI_ATLAS" (auto-summary).
            "source": n.source.value if n.source else "HUMAN",
            "author_name": (
                "Atlas (AI)"
                if (n.source and n.source.value == "AI_ATLAS")
                else authors.get(n.author_psychic_id) or "A reader"
            ),
            "created_at": n.created_at.isoformat() if n.created_at else None,
        }
        for n in notes
    ]

    stats = get_client_stats(db, client_id)
    astro = get_client_astro(client)
    sessions = get_client_sessions(db, client_id)

    return {
        "client": {
            "id": client.id,
            "username": client.username,
            "email": client.email,
            **astro,
        },
        "stats": stats,
        "sessions": sessions,
        "notes": notes_out,
        "gifts": get_client_gifts(db, client_id),
    }


# ─────────────────────────────────────────────────────────────────────────────
# ATLAS — auto-summarise a finished reading into the client's dossier.
#
# Runs when a session ends: sends the transcript to a cheap model, writes a short
# summary, and appends it to the client's dossier as a clearly-tagged AI note
# (source = AI_ATLAS, no human author). It only ever CREATES a note — it never
# edits or overwrites human-written notes.
# ─────────────────────────────────────────────────────────────────────────────
ATLAS_SUMMARY_SYSTEM = """You are Atlas, the memory-keeper for a tarot / psychic love-reading service. You are given the full transcript of ONE reading between a client and their reader. Write a short dossier note (3-5 sentences) that a DIFFERENT reader could skim before this client's next reading.

Capture: what the client came for and what was discussed, the client's emotional tone/state, and anything notable to remember (names, situations, recurring themes, what was explored). Do NOT invent facts that are not in the transcript. Do NOT include guarantees, predictions, or medical / legal / financial advice. Write in plain, factual third person about the client (e.g. "She asked about...", "He seemed...").

Return ONLY the note text — no preamble, no labels, no quotation marks."""

# Minimum client+reader messages before a session is worth summarising.
_ATLAS_MIN_MESSAGES = 2


def build_session_transcript(db: Session, chat_id: int) -> str:
    """Client/Reader labelled transcript of a chat (system messages omitted)."""
    from app.models.message import Message

    chat = db.query(Chat).filter(Chat.id == chat_id).first()
    if not chat:
        return ""
    rows = (
        db.query(Message)
        .filter(Message.chat_id == chat_id, Message.is_system == False)  # noqa: E712
        .order_by(Message.id.asc())
        .all()
    )
    lines = []
    for m in rows:
        who = "Client" if m.sender_id == chat.user_id else "Reader"
        lines.append(f"{who}: {m.content}")
    return "\n".join(lines)


def save_atlas_note(db: Session, client_id: int, chat_id: int, summary: str):
    """Append an AI-tagged summary note to the client's dossier (never overwrites)."""
    from app.enums.note_source import NoteSource

    entry = ClientNote(
        client_id=client_id,
        author_psychic_id=None,  # AI-authored; no human author
        chat_id=chat_id,
        title="Reading summary (Atlas)",
        note=summary.strip(),
        source=NoteSource.AI_ATLAS,
    )
    db.add(entry)
    db.commit()
    db.refresh(entry)
    logger.info("atlas_note_saved", note_id=entry.id, client_id=client_id, chat_id=chat_id)
    return entry


def run_atlas_summary(db: Session, chat_id: int):
    """Summarise a finished reading and store it as an AI dossier note.

    Blocking (calls the model) — run in a thread. Guarded by the master switch
    and the AI key. Returns the created ClientNote, or None if skipped/failed.
    """
    from app.config import get_app_settings
    from app.services.ai import client as ai_client

    settings = get_app_settings()
    if not settings.AI_DRAFTING_ENABLED or not ai_client.is_configured():
        return None

    chat = db.query(Chat).filter(Chat.id == chat_id).first()
    if not chat:
        return None

    transcript = build_session_transcript(db, chat_id)
    if len([ln for ln in transcript.splitlines() if ln.strip()]) < _ATLAS_MIN_MESSAGES:
        logger.info("atlas_skipped_too_short", chat_id=chat_id)
        return None

    try:
        result = ai_client.run_chat(
            system=ATLAS_SUMMARY_SYSTEM,
            user_content="TRANSCRIPT:\n" + transcript,
            model=settings.ATLAS_SUMMARY_MODEL,
            max_tokens=settings.ATLAS_SUMMARY_MAX_TOKENS,
        )
    except Exception as e:  # noqa: BLE001 — summarisation must never crash end-of-session
        logger.warning("atlas_summary_model_failed", chat_id=chat_id, error=str(e))
        return None

    summary = (result.get("text") or "").strip()
    if not summary:
        return None
    return save_atlas_note(db, chat.user_id, chat_id, summary)


async def _run_atlas_async(chat_id: int) -> None:
    """Open a fresh DB session and run Atlas off the event loop."""
    from app.database.client import SessionLocal

    db = SessionLocal()
    try:
        await __import__("asyncio").to_thread(run_atlas_summary, db, chat_id)
    except Exception as e:  # noqa: BLE001
        logger.warning("atlas_async_failed", chat_id=chat_id, error=str(e))
    finally:
        db.close()


def schedule_atlas_summary(chat_id: int) -> None:
    """Fire-and-forget Atlas summary (called at session end). Respects the master
    switch and never blocks or fails the session-end flow."""
    from app.config import get_app_settings

    if not get_app_settings().AI_DRAFTING_ENABLED:
        return
    import asyncio

    try:
        asyncio.create_task(_run_atlas_async(chat_id))
    except RuntimeError:
        logger.warning("atlas_no_event_loop", chat_id=chat_id)
