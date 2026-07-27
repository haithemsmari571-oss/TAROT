"""Rolling per-(client, psychic) memory: merge forward, never re-read history.

Replaces the append-a-fresh-summary-of-everything behaviour at session end. The
model is handed the EXISTING summary plus only the messages since the last
watermark, and returns one updated summary that replaces it.

Why this module is not in client_dossier.py: that file is production-locked.
Keeping the merge here, and pointing the session-end hook at it from
session_manager.py (which is not locked), means the whole feature — including
durable deletion — ships without a lock re-baseline.

Scope note, accepted by the owner: purging memory here does NOT produce full
erasure. Spend-derived lines ("Returning client", "Past readings", "Lifetime
spend") and the CRM vault archive are injected by reading_assistant.py, which is
locked, and are deliberately out of scope.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.logging_config import get_logger
from app.models.chat import Chat
from app.models.client_memory_summary import ClientMemorySummary

logger = get_logger(__name__)

MERGE_SYSTEM = """You are Atlas, the memory-keeper for a tarot / psychic love-reading service.

You maintain ONE running summary per client, for one specific reader. You are given the CURRENT SUMMARY (which may be empty) and the transcript of the NEW SESSION that has just ended. Return the UPDATED summary.

Merge, do not restart. Keep what still matters from the current summary, fold in what the new session adds, correct anything the new session contradicts, and drop detail that has clearly been superseded. The result must read as one coherent note, not as two notes joined together, and must stay roughly 4-8 sentences however many sessions accumulate — compress older material rather than letting it grow.

Capture: what the client keeps coming back for, their emotional tone, names and situations that recur, and anything a reader should know before the next reading. Do NOT invent facts absent from both inputs. Do NOT include guarantees, predictions, or medical / legal / financial advice. Write plain third person about the client.

Return ONLY the updated summary text — no preamble, no labels, no quotation marks."""

# Below this many client/reader lines a session is not worth a model call.
MIN_NEW_MESSAGES = 2


def get_or_create_record(db: Session, client_id: int, psychic_id: int) -> ClientMemorySummary:
    row = db.execute(
        select(ClientMemorySummary).where(
            ClientMemorySummary.client_id == client_id,
            ClientMemorySummary.psychic_id == psychic_id,
        )
    ).scalar_one_or_none()
    if row is not None:
        return row
    now = datetime.now(timezone.utc)
    row = ClientMemorySummary(
        client_id=client_id, psychic_id=psychic_id, created_at=now, updated_at=now
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def resume_point(row: ClientMemorySummary) -> Optional[datetime]:
    """The instant the next merge should read from, exclusive.

    The later of the fold-in watermark and any purge. Taking the max is what
    stops a purge being undone: even if `covers_through` predates the purge,
    `cleared_at` holds the floor.
    """
    stamps = [s for s in (row.covers_through, row.cleared_at) if s is not None]
    if not stamps:
        return None
    return max(_aware(s) for s in stamps)


def _aware(value: datetime) -> datetime:
    """SQLite hands back naive datetimes; compare everything in UTC."""
    return value if value.tzinfo is not None else value.replace(tzinfo=timezone.utc)


def _for_column(db: Session, value: datetime) -> datetime:
    """Shape a datetime the way this backend stores them, for use in a filter.

    The timestamp columns are DateTime(timezone=True), which Postgres honours but
    SQLite does not: SQLite writes and returns naive strings, so binding an
    aware value produces a string with an offset that sorts against the stored
    naive strings incorrectly — every row silently falls outside the window.
    """
    bind = db.get_bind()
    if bind is not None and bind.dialect.name == "sqlite":
        return _aware(value).astimezone(timezone.utc).replace(tzinfo=None)
    return _aware(value)


def build_new_session_transcript(
    db: Session, chat_id: int, since: Optional[datetime]
) -> tuple[str, Optional[datetime]]:
    """Labelled transcript of the messages not yet folded in, plus their high-water mark."""
    from app.models.message import Message

    chat = db.query(Chat).filter(Chat.id == chat_id).first()
    if not chat:
        return "", None

    query = db.query(Message).filter(
        Message.chat_id == chat_id,
        Message.is_system == False,  # noqa: E712
    )
    if since is not None:
        query = query.filter(Message.created_at > _for_column(db, since))
    rows = query.order_by(Message.id.asc()).all()
    if not rows:
        return "", None

    lines = [
        f"{'Client' if m.sender_id == chat.user_id else 'Reader'}: {m.content}" for m in rows
    ]
    newest = max(_aware(m.created_at) for m in rows if m.created_at is not None) if any(
        m.created_at is not None for m in rows
    ) else None
    return "\n".join(lines), newest


def merge_session(db: Session, chat_id: int) -> Optional[ClientMemorySummary]:
    """Fold one finished session into the client's rolling summary.

    Blocking (calls the model) — run in a thread. Never raises into the
    session-end flow; returns None when it declines or fails.
    """
    from app.config import get_app_settings
    from app.services.ai import client as ai_client

    settings = get_app_settings()
    if not settings.AI_DRAFTING_ENABLED or not ai_client.is_configured():
        return None

    chat = db.query(Chat).filter(Chat.id == chat_id).first()
    if not chat or chat.psychic_id is None:
        return None

    row = get_or_create_record(db, chat.user_id, chat.psychic_id)
    transcript, newest = build_new_session_transcript(db, chat_id, resume_point(row))
    if len([ln for ln in transcript.splitlines() if ln.strip()]) < MIN_NEW_MESSAGES:
        logger.info("client_memory_skipped_too_short", chat_id=chat_id)
        return None

    current = (row.summary or "").strip() or "(no summary yet — this is the first session)"
    try:
        result = ai_client.run_chat(
            system=MERGE_SYSTEM,
            user_content=f"CURRENT SUMMARY:\n{current}\n\nNEW SESSION:\n{transcript}",
            model=settings.ATLAS_SUMMARY_MODEL,
            max_tokens=settings.ATLAS_SUMMARY_MAX_TOKENS,
        )
    except Exception as exc:  # noqa: BLE001 — must never break end-of-session
        logger.warning("client_memory_merge_failed", chat_id=chat_id, error=str(exc))
        return None

    merged = (result.get("text") or "").strip()
    if not merged:
        return None

    row.summary = merged
    # Only advance the watermark on a successful merge; a failed model call must
    # leave those messages pending so the next session picks them up.
    if newest is not None:
        row.covers_through = newest
    row.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(row)
    _mirror_to_dossier(db, row, chat_id)
    logger.info(
        "client_memory_merged",
        chat_id=chat_id,
        client_id=chat.user_id,
        psychic_id=chat.psychic_id,
        summary_chars=len(merged),
    )
    return row


async def _merge_async(chat_id: int) -> None:
    """Open a fresh DB session and merge off the event loop."""
    import asyncio

    from app.database.client import SessionLocal

    db = SessionLocal()
    try:
        await asyncio.to_thread(merge_session, db, chat_id)
    except Exception as exc:  # noqa: BLE001
        logger.warning("client_memory_async_failed", chat_id=chat_id, error=str(exc))
    finally:
        db.close()


def schedule_memory_merge(chat_id: int) -> None:
    """Fire-and-forget merge at session end. Never blocks or fails the flow."""
    import asyncio

    from app.config import get_app_settings

    if not get_app_settings().AI_DRAFTING_ENABLED:
        return
    try:
        asyncio.create_task(_merge_async(chat_id))
    except RuntimeError:
        logger.warning("client_memory_no_event_loop", chat_id=chat_id)


def _retire_legacy_notes(db: Session, client_id: int) -> int:
    """Drop the pre-merge pile of unattributed Atlas notes on first merge.

    The old summariser wrote one AI_ATLAS note per session with
    ``author_psychic_id = NULL``. Left in place they would sit beside the new
    single note and both would feed the reading prompt — the exact duplication
    the merge exists to remove, plus the old notes are unattributed so they leak
    across readers.

    Keyed on the NULL author, so it can only ever match the old writer's rows:
    human notes have an author, and the merge's own mirror is keyed to a psychic.
    Idempotent — after the first merge there is nothing left to match.
    """
    from app.enums.note_source import NoteSource
    from app.models.client_note import ClientNote

    legacy = (
        db.query(ClientNote)
        .filter(
            ClientNote.client_id == client_id,
            ClientNote.author_psychic_id.is_(None),
            ClientNote.source == NoteSource.AI_ATLAS,
        )
        .all()
    )
    for note in legacy:
        db.delete(note)
    if legacy:
        db.commit()
        logger.info("client_memory_legacy_notes_retired", client_id=client_id, count=len(legacy))
    return len(legacy)


def _mirror_to_dossier(db: Session, row: ClientMemorySummary, chat_id: int) -> None:
    """Keep exactly one AI_ATLAS dossier note per (client, psychic), updated in place.

    reading_assistant.py reads memory through the dossier notes and is locked, so
    the merged summary has to appear there to be used at all. Updating the single
    row rather than inserting is what stops the pile re-forming.
    """
    from app.enums.note_source import NoteSource
    from app.models.client_note import ClientNote

    _retire_legacy_notes(db, row.client_id)

    note = (
        db.query(ClientNote)
        .filter(
            ClientNote.client_id == row.client_id,
            ClientNote.author_psychic_id == row.psychic_id,
            ClientNote.source == NoteSource.AI_ATLAS,
        )
        .order_by(ClientNote.id.asc())
        .first()
    )
    if note is None:
        note = ClientNote(
            client_id=row.client_id,
            author_psychic_id=row.psychic_id,
            chat_id=chat_id,
            title="Rolling summary (Atlas)",
            note=row.summary or "",
            source=NoteSource.AI_ATLAS,
        )
        db.add(note)
    else:
        note.note = row.summary or ""
        note.chat_id = chat_id
    db.commit()


def purge_client_memory(db: Session, client_id: int, psychic_id: Optional[int] = None) -> dict:
    """Delete a client's derived memory. Real removal, with a resume floor kept.

    Clears the summary text and every mirrored AI_ATLAS dossier note, drops the
    deterministic situation records, and evicts any cached in-memory reading
    state. `cleared_at` is stamped rather than deleting the row outright: the
    watermark is what tells the next merge where to resume, and without it the
    following session would sweep the pre-deletion transcript back in.

    Does NOT delete raw messages, and does NOT remove spend-derived context or
    the vault archive — both live in locked code and are out of scope.
    """
    from app.enums.note_source import NoteSource
    from app.models.client_note import ClientNote

    now = datetime.now(timezone.utc)

    records = db.query(ClientMemorySummary).filter(ClientMemorySummary.client_id == client_id)
    if psychic_id is not None:
        records = records.filter(ClientMemorySummary.psychic_id == psychic_id)
    cleared = 0
    for row in records.all():
        row.summary = None
        row.cleared_at = now
        row.covers_through = now
        row.updated_at = now
        cleared += 1

    notes_q = db.query(ClientNote).filter(
        ClientNote.client_id == client_id, ClientNote.source == NoteSource.AI_ATLAS
    )
    if psychic_id is not None:
        notes_q = notes_q.filter(ClientNote.author_psychic_id == psychic_id)
    notes_deleted = 0
    for note in notes_q.all():
        db.delete(note)
        notes_deleted += 1

    situations_deleted = _purge_situation_records(db, client_id, psychic_id)
    db.commit()

    sessions_evicted = _evict_reading_sessions(db, client_id, psychic_id)
    logger.info(
        "client_memory_purged",
        client_id=client_id,
        psychic_id=psychic_id,
        summaries_cleared=cleared,
        notes_deleted=notes_deleted,
        situations_deleted=situations_deleted,
        sessions_evicted=sessions_evicted,
    )
    return {
        "summaries_cleared": cleared,
        "notes_deleted": notes_deleted,
        "situation_records_deleted": situations_deleted,
        "reading_sessions_evicted": sessions_evicted,
        "cleared_at": now.isoformat(),
    }


def _purge_situation_records(db: Session, client_id: int, psychic_id: Optional[int]) -> int:
    try:
        from app.models.client_situation_record import ClientSituationRecord
    except Exception:  # noqa: BLE001 — model absent in trimmed schemas
        return 0
    query = db.query(ClientSituationRecord).filter(ClientSituationRecord.client_id == client_id)
    if psychic_id is not None:
        query = query.filter(ClientSituationRecord.psychic_id == psychic_id)
    rows = query.all()
    for row in rows:
        db.delete(row)
    return len(rows)


def _evict_reading_sessions(db: Session, client_id: int, psychic_id: Optional[int]) -> int:
    """Drop cached in-memory reading state for this client's chats.

    Without this the purge is cosmetic on any chat that is still warm: chats are
    reused per (client, psychic), and the persisted session state rehydrates the
    pre-deletion transcript into the next prompt regardless of what was removed
    from the database. SessionStore.delete existed but nothing called it.
    """
    try:
        from app.services.ai.reading_session import get_session_store
    except Exception:  # noqa: BLE001
        return 0

    query = db.query(Chat).filter(Chat.user_id == client_id)
    if psychic_id is not None:
        query = query.filter(Chat.psychic_id == psychic_id)

    store = get_session_store()
    evicted = 0
    for chat in query.all():
        try:
            store.delete(f"chat:{chat.id}")
            evicted += 1
        except Exception as exc:  # noqa: BLE001 — eviction must not fail a purge
            logger.warning("client_memory_evict_failed", chat_id=chat.id, error=str(exc))
    return evicted
