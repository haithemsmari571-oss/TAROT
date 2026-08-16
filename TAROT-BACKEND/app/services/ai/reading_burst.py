"""Session-scoped client-message burst coordination for live readings.

Every inbound message remains an individual canonical ``messages`` row. This
module waits for six seconds of message silence (and for all per-socket typing
leases to clear), then gives the active response mode one ordered turn. Durable
PostgreSQL fencing prevents concurrent sockets or restarted workers from owning
the same turn, while persisted reveal progress prevents already-sent Sabri
bubbles from being repeated after a restart.
"""

from __future__ import annotations

import asyncio
import copy
import json
import time
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Dict, Optional
from uuid import uuid4

from sqlalchemy import desc
from sqlalchemy.exc import IntegrityError

from app.logging_config import get_logger

logger = get_logger(__name__)

MESSAGE_BURST_SILENCE_SECONDS = 6.0

# ---------------------------------------------------------------------------
# Turn timing.
#
# Nothing on the reading path has ever been timed, so "the reading is slow" has
# never had a number attached to it. These marks answer the only question a
# waiting client cares about: how long from her message to the first words on
# her screen.
#
# Deliberately inert: a process-local dict of floats, written and read from code
# that already runs here. No database, no I/O, no await, nothing that can stall
# the event loop - the failure mode this file has already paid for once.
# ---------------------------------------------------------------------------
_TURN_MARKS: Dict[int, float] = {}
_TURN_MARKS_LIMIT = 512


def _mark_message_arrival(chat_session_id: Optional[int]) -> None:
    """Stamp the first unanswered message of a turn; later ones keep the first."""
    if chat_session_id is None:
        return
    if chat_session_id in _TURN_MARKS:
        return
    if len(_TURN_MARKS) >= _TURN_MARKS_LIMIT:
        # A session that never delivered would otherwise pin its mark forever.
        _TURN_MARKS.clear()
    _TURN_MARKS[chat_session_id] = time.perf_counter()


_first_word_tasks: Dict[int, "asyncio.Task"] = {}
_presence_tasks: Dict[int, "asyncio.Task"] = {}


# ---------------------------------------------------------------------------
# The client clock. Entirely visual: none of it gates when generation runs, which
# is still the six-second burst guard and nothing else.
# ---------------------------------------------------------------------------
def read_pause_ms(text: str) -> int:
    """How long a reader spends reading the message before she starts to type.

    A fixed beat was wrong in both directions: instant for a twenty-line letter, and a
    needless wait after "ok". It scales with what she actually wrote, and it is capped,
    because nobody reads for more than about fifteen seconds before saying anything.
    Nothing is visible during this pause — no dots, no line."""
    from app.config import get_app_settings

    settings = get_app_settings()
    words = len((text or "").split())
    return min(
        settings.READ_PAUSE_MAX_MS,
        settings.READ_PAUSE_BASE_MS + words * settings.READ_PAUSE_PER_WORD_MS,
    )


async def _hold_typing_presence(chat_id: int, chat_session_id: int, delay_seconds: float) -> None:
    """Turn the typing indicator on after the silence ceiling and leave it on.

    The old coordinator held the dots from the moment a message arrived, through generation,
    into the reveal. That coordinator is dead code and the burst engine never replaced the
    behaviour, so a client sat through 45 to 65 seconds of complete silence in the middle of
    a reading she was paying for by the minute. This restores it.

    Deliberately a separate fire-and-forget task with no database access of any kind: it must
    never be able to touch the generation coroutine, which is the rule this file has already
    paid for breaking once. The indicator is cleared by delivery itself (or by the failure
    path in _execute_claim); the long backstop below only covers a process that dies mid-turn."""
    from app.config import get_app_settings
    from app.services.ai import reading_executor

    try:
        await asyncio.sleep(max(0.0, delay_seconds))
        with_psychic = _psychic_id_for_presence.get(chat_session_id)
        await reading_executor.broadcast_typing(chat_id, True, with_psychic)
        logger.info("reading_typing_presence_on", chat_id=chat_id,
                    chat_session_id=chat_session_id, after_seconds=round(delay_seconds, 2))
        await asyncio.sleep(get_app_settings().TYPING_PRESENCE_MAX_MS / 1000.0)
        # Nothing delivered in four minutes: something died. Do not leave her watching dots.
        await reading_executor.broadcast_typing(chat_id, False, with_psychic)
        logger.warning("reading_typing_presence_expired", chat_id=chat_id)
    except asyncio.CancelledError:
        raise
    except Exception as error:  # noqa: BLE001 — a typing hiccup must never touch a reading
        logger.warning("reading_typing_presence_failed", chat_id=chat_id,
                       error_type=type(error).__name__)


_psychic_id_for_presence: Dict[int, Optional[int]] = {}


def _stop_typing_presence(chat_session_id: Optional[int]) -> None:
    """Delivery has taken over the indicator (or the turn is over) — stand the watchdog down."""
    task = _presence_tasks.pop(chat_session_id, None)
    if task is not None and not task.done():
        task.cancel()


def _start_first_word(
    chat_id: int, chat_session_id: Optional[int], arrived_at: float, message_id: Optional[int] = None,
    client_text: str = "", psychic_id: Optional[int] = None,
) -> None:
    """React to the message that just arrived, and keep the screen alive after that.

    Called for EVERY client message, with no first-of-burst gate. The gate used to be
    ``first_of_turn``, which is true only while no earlier message is still unanswered — and
    that is exactly backwards. Live: "it is indeed" arrived, got its line, and eight seconds
    later "when will i leave the country" arrived while the first was still unanswered, so it
    counted as not-first, took no presence line and armed no indicator. The client watched two
    minutes of nothing and then received the word "yeah".

    A rapid burst is handled by cancellation instead: each new message cancels the pass that
    the previous one started, so three texts in five seconds still produce ONE line, and it is
    about the last of the three rather than the first. Fire and forget — nothing here is
    awaited, so the burst window and the generation loop are untouched by it.
    """
    if chat_session_id is None:
        return
    from app.config import get_app_settings
    from app.services.ai import reading_first_word

    # Whatever the previous message started is now out of date: she has said something newer.
    superseded = _first_word_tasks.pop(chat_session_id, None)
    if superseded is not None and not superseded.done():
        superseded.cancel()

    pause_seconds = read_pause_ms(client_text) / 1000.0
    try:
        task = asyncio.create_task(
            reading_first_word.speak_now(
                chat_id, chat_session_id, arrived_at, message_id,
                read_pause_seconds=pause_seconds,
            )
        )
    except RuntimeError:
        # No running loop (synchronous caller): the reading is unaffected.
        return
    _first_word_tasks[chat_session_id] = task

    def _done(finished: "asyncio.Task", session_id: int = chat_session_id) -> None:
        _first_word_tasks.pop(session_id, None)
        # Retrieve any exception so it is never reported as unhandled.
        if not finished.cancelled():
            finished.exception()

    task.add_done_callback(_done)

    # The silence ceiling: from the end of the read pause the client has at most this long
    # before something is on screen. Sabri's line normally lands first and switches the dots
    # on itself; this is what covers the turn where it is slow, or refused, or fails.
    _psychic_id_for_presence[chat_session_id] = psychic_id
    _stop_typing_presence(chat_session_id)
    ceiling = get_app_settings().SILENCE_CEILING_MS / 1000.0
    elapsed = max(0.0, time.perf_counter() - arrived_at)
    presence = asyncio.create_task(
        _hold_typing_presence(
            chat_id, chat_session_id, max(0.0, pause_seconds + ceiling - elapsed)
        )
    )
    _presence_tasks[chat_session_id] = presence
    presence.add_done_callback(
        lambda done: done.cancelled() or done.exception()
    )


def _elapsed_ms_since_arrival(chat_session_id: Optional[int], clear: bool = False) -> Optional[int]:
    if chat_session_id is None:
        return None
    started = _TURN_MARKS.pop(chat_session_id, None) if clear else _TURN_MARKS.get(chat_session_id)
    if started is None:
        return None
    return int((time.perf_counter() - started) * 1000)
CLIENT_TYPING_EXPIRY_SECONDS = 12.0
GENERATION_LEASE_SECONDS = 90.0
GENERATION_HEARTBEAT_SECONDS = 15.0

_tasks: Dict[int, asyncio.Task] = {}
_wake_events: Dict[int, asyncio.Event] = {}
_generating: set[int] = set()
_message_flow_locks: Dict[int, asyncio.Lock] = {}
_stopping = False


def message_flow_lock(chat_id: int) -> asyncio.Lock:
    """Serialize one chat's persistence-through-notification boundary.

    Production runs one Uvicorn worker. Keeping the client/manual send path and
    Automatic bubble delivery under this same per-chat lock prevents an older
    committed bubble from notifying after a newer client message.
    """
    lock = _message_flow_locks.get(chat_id)
    if lock is None:
        lock = asyncio.Lock()
        _message_flow_locks[chat_id] = lock
    return lock


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _aware(value: Optional[datetime]) -> Optional[datetime]:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _signals(raw: Optional[str], now: Optional[datetime] = None) -> dict[str, datetime]:
    now = now or _now()
    try:
        decoded = json.loads(raw or "{}")
    except (TypeError, ValueError):
        decoded = {}
    active: dict[str, datetime] = {}
    if isinstance(decoded, dict):
        for source, value in decoded.items():
            try:
                expiry = _aware(datetime.fromisoformat(str(value)))
            except (TypeError, ValueError):
                continue
            if expiry is not None and expiry > now:
                active[str(source)] = expiry
    return active


def _dump_signals(signals: dict[str, datetime]) -> str:
    return json.dumps(
        {source: expiry.isoformat() for source, expiry in sorted(signals.items())},
        separators=(",", ":"),
    )


def format_client_turn(contents: list[str]) -> str:
    """Preserve each message verbatim and in order inside one Valentina turn."""
    if len(contents) == 1:
        return contents[0]
    separator = "\n\n--- next message in the same client turn ---\n\n"
    return separator.join(contents)


def _pending_client_turn_is_recorded(state, turn: str) -> bool:
    """Return whether durable memory already ends on this unanswered turn."""
    transcript = getattr(state, "chat_transcript", None) or []
    if not transcript:
        return False
    latest = transcript[-1]
    return bool(
        isinstance(latest, dict)
        and latest.get("role") == "client"
        and latest.get("content") == turn
    )


def is_generating(chat_id: int) -> bool:
    return chat_id in _generating


def _engine_config() -> tuple[bool, str]:
    from app.config import get_app_settings

    settings = get_app_settings()
    return settings.AI_DRAFTING_ENABLED, settings.READING_ENGINE


def _wake(chat_session_id: int) -> None:
    event = _wake_events.setdefault(chat_session_id, asyncio.Event())
    event.set()
    task = _tasks.get(chat_session_id)
    if task is not None and not task.done():
        return
    try:
        task = asyncio.create_task(_run_session(chat_session_id))
    except RuntimeError:
        logger.warning("reading_burst_no_event_loop", chat_session_id=chat_session_id)
        return
    _tasks[chat_session_id] = task
    task.add_done_callback(
        lambda finished, sid=chat_session_id: _clear_task(sid, finished)
    )


def _clear_task(chat_session_id: int, task: asyncio.Task) -> None:
    if _tasks.get(chat_session_id) is task:
        _tasks.pop(chat_session_id, None)


def _locked_row(db, chat_session_id: int):
    from app.models.reading_message_burst import ReadingMessageBurst

    return (
        db.query(ReadingMessageBurst)
        .filter(ReadingMessageBurst.chat_session_id == chat_session_id)
        .with_for_update()
        .first()
    )


def _row_for_update(db, chat_session_id: int, chat_id: int):
    from app.models.reading_message_burst import ReadingMessageBurst

    row = _locked_row(db, chat_session_id)
    if row is None:
        row = ReadingMessageBurst(chat_session_id=chat_session_id, chat_id=chat_id)
        db.add(row)
        db.flush()
    return row


def _clear_plan(row) -> None:
    row.response_bubbles = None
    row.response_reserve = None
    row.response_route = None
    row.delivery_position = 0


def _legacy_pending_hybrid_boundary(db, row, trigger, client_id: int) -> Optional[int]:
    """Recognize a D30 pending draft without changing it until owner action.

    D30 marked the triggering client message complete as soon as it drafted.
    It also persisted the whole coalesced client turn in engine memory. Recover
    the old boundary only when exactly one ordered message suffix reproduces
    that final pending transcript entry; otherwise fail closed rather than lose
    or invent part of the client's turn.
    """
    from app.models.message import Message
    from app.services.ai.reading_session import get_session_store

    if not (
        row.status == "IDLE"
        and row.latest_client_message_id == trigger.id
        and row.completed_client_message_id == trigger.id
    ):
        return None

    state = get_session_store().get(f"chat:{row.chat_id}")
    transcript = getattr(state, "chat_transcript", None) or []
    if not transcript or not isinstance(transcript[-1], dict):
        return None
    pending_entry = transcript[-1]
    if pending_entry.get("role") != "client":
        return None
    persisted_turn = pending_entry.get("content")
    if not isinstance(persisted_turn, str):
        return None

    messages = (
        db.query(Message)
        .filter(
            Message.chat_id == row.chat_id,
            Message.chat_session_id == trigger.chat_session_id,
            Message.sender_id == client_id,
            Message.is_system.is_(False),
            Message.id <= trigger.id,
        )
        .order_by(Message.id.asc())
        .all()
    )
    if not messages or messages[-1].id != trigger.id:
        return None

    matches = [
        index
        for index in range(len(messages))
        if format_client_turn([message.content for message in messages[index:]])
        == persisted_turn
    ]
    if len(matches) != 1:
        return None
    start = matches[0]
    return int(messages[start - 1].id) if start else 0


def _discard_pending_hybrid_drafts(db, chat_id: int) -> None:
    """Invalidate review drafts superseded by a newer client turn.

    A PENDING draft is an unfinished response, not a completed reader turn.  A
    newly stored client message therefore fences that draft in the same
    transaction as the durable burst update so it can never be sent stale.
    """
    from app.enums.ai_draft_status import AiDraftStatus
    from app.enums.response_mode import ResponseMode
    from app.models.ai_draft import AiDraft

    db.query(AiDraft).filter(
        AiDraft.chat_id == chat_id,
        AiDraft.mode == ResponseMode.HYBRID,
        AiDraft.status == AiDraftStatus.PENDING,
    ).update({AiDraft.status: AiDraftStatus.DISCARDED}, synchronize_session=False)


async def note_client_message(
    chat_id: int,
    chat_session_id: Optional[int],
    message_id: int,
    content: str = "",
    psychic_id: Optional[int] = None,
) -> None:
    """Open/reset a burst after the canonical Message row has committed.

    ``content`` sizes the read pause (a long message takes longer to read) and ``psychic_id``
    addresses the typing indicator. Both are optional so an older caller still works."""
    if chat_session_id is None:
        return
    from app.database.client import SessionLocal

    for attempt in range(2):
        try:
            with SessionLocal() as db:
                row = _row_for_update(db, chat_session_id, chat_id)
                if (
                    row.latest_client_message_id is not None
                    and message_id <= row.latest_client_message_id
                ):
                    db.commit()
                    break
                now = _now()
                _discard_pending_hybrid_drafts(db, chat_id)
                row.latest_client_message_id = message_id
                row.generation_version += 1
                row.status = "WAITING"
                row.silence_until = now + timedelta(
                    seconds=MESSAGE_BURST_SILENCE_SECONDS
                )
                _clear_plan(row)
                if (
                    _aware(row.lease_expires_at) is None
                    or _aware(row.lease_expires_at) <= now
                ):
                    row.lease_owner = None
                    row.lease_expires_at = None
                db.commit()
            break
        except IntegrityError:
            if attempt:
                raise
    # _TURN_MARKS still stamps only the FIRST unanswered message, because that is the honest
    # answer to "how long has this turn gone unanswered" for the timing logs and for how much
    # Sabri owes her. It no longer gates whether she gets a presence line — see _start_first_word.
    first_of_turn = chat_session_id is not None and chat_session_id not in _TURN_MARKS
    _mark_message_arrival(chat_session_id)
    logger.info(
        "reading_burst_message_noted",
        chat_id=chat_id,
        chat_session_id=chat_session_id,
        message_id=message_id,
        first_of_turn=first_of_turn,
        read_pause_ms=read_pause_ms(content),
    )
    # EVERY message, not only the first of a burst. The read pause and the silence ceiling are
    # measured from THIS message, because this is the one she is waiting on an answer to.
    _start_first_word(
        chat_id, chat_session_id, time.perf_counter(), message_id,
        client_text=content, psychic_id=psychic_id,
    )
    _wake(chat_session_id)


async def note_reader_message(
    chat_id: int, chat_session_id: Optional[int], reader_message_id: int
) -> Optional[tuple[str, bool]]:
    """Close a human-answered turn and say if Automatic already stored it."""
    if chat_session_id is None:
        return None
    from app.database.client import SessionLocal
    from app.models.chat import Chat
    from app.models.message import Message

    with SessionLocal() as db:
        chat = db.query(Chat).filter(Chat.id == chat_id).first()
        if chat is None:
            return None
        row = _row_for_update(db, chat_session_id, chat_id)
        automatic_already_recorded = row.status == "DELIVERING"
        latest_client = (
            db.query(Message)
            .filter(
                Message.chat_session_id == chat_session_id,
                Message.sender_id == chat.user_id,
                Message.is_system.is_(False),
                Message.id < reader_message_id,
            )
            .order_by(desc(Message.id))
            .first()
        )
        client_turn = None
        if latest_client is not None:
            boundary = int(latest_client.id)
            previous = row.completed_client_message_id or 0
            if (
                row.completed_client_message_id is None
                or boundary > row.completed_client_message_id
            ):
                messages = (
                    db.query(Message)
                    .filter(
                        Message.chat_session_id == chat_session_id,
                        Message.sender_id == chat.user_id,
                        Message.is_system.is_(False),
                        Message.id > previous,
                        Message.id <= boundary,
                    )
                    .order_by(Message.id.asc())
                    .all()
                )
                if messages and messages[-1].id == boundary:
                    client_turn = format_client_turn(
                        [message.content for message in messages]
                    )
                row.completed_client_message_id = boundary
        _discard_pending_hybrid_drafts(db, chat_id)
        row.generation_version += 1
        _clear_plan(row)
        if row.latest_client_message_id is not None and (
            row.completed_client_message_id is None
            or row.latest_client_message_id > row.completed_client_message_id
        ):
            row.status = "WAITING"
        else:
            row.status = "IDLE"
        db.commit()
    _wake(chat_session_id)
    if client_turn is None:
        return None
    return client_turn, automatic_already_recorded


async def note_client_typing(
    chat_id: int, user_id: int, source_id: str, is_typing: bool
) -> None:
    """Refresh or clear one socket's typing lease; other sockets remain active."""
    from app.database.client import SessionLocal
    from app.models.chat import Chat
    from app.models.chat_session import ChatSession

    with SessionLocal() as db:
        chat = db.query(Chat).filter(Chat.id == chat_id).first()
        if chat is None or chat.user_id != user_id:
            return
        session = (
            db.query(ChatSession)
            .filter(ChatSession.chat_id == chat_id)
            .order_by(desc(ChatSession.id))
            .first()
        )
        if session is None:
            return
        row = _row_for_update(db, session.id, chat_id)
        now = _now()
        active = _signals(row.typing_signals, now)
        if is_typing:
            active[source_id] = now + timedelta(seconds=CLIENT_TYPING_EXPIRY_SECONDS)
        else:
            active.pop(source_id, None)
        row.typing_signals = _dump_signals(active)
        db.commit()
        session_id = session.id
    _wake(session_id)


async def release_typing_source(chat_id: int, user_id: int, source_id: str) -> None:
    await note_client_typing(chat_id, user_id, source_id, False)


async def note_mode_change(chat_id: int, db=None) -> None:
    """Fence old work and re-evaluate the latest session under its committed mode."""
    from contextlib import nullcontext

    from app.database.client import SessionLocal
    from app.models.chat import Chat
    from app.models.chat_session import ChatSession
    from app.models.message import Message

    context = SessionLocal() if db is None else nullcontext(db)
    with context as working_db:
        chat = working_db.query(Chat).filter(Chat.id == chat_id).first()
        session = (
            working_db.query(ChatSession)
            .filter(ChatSession.chat_id == chat_id)
            .order_by(desc(ChatSession.id))
            .first()
        )
        if chat is None or session is None:
            return
        latest = (
            working_db.query(Message)
            .filter(
                Message.chat_session_id == session.id,
                Message.sender_id == chat.user_id,
                Message.is_system.is_(False),
            )
            .order_by(desc(Message.id))
            .first()
        )
        row = _row_for_update(working_db, session.id, chat_id)
        _discard_pending_hybrid_drafts(working_db, chat_id)
        row.generation_version += 1
        _clear_plan(row)
        if latest is not None:
            row.latest_client_message_id = latest.id
            due = _aware(latest.created_at) + timedelta(
                seconds=MESSAGE_BURST_SILENCE_SECONDS
            )
            row.silence_until = due
            row.status = (
                "WAITING"
                if row.completed_client_message_id is None
                or latest.id > row.completed_client_message_id
                else "IDLE"
            )
        else:
            row.status = "IDLE"
        working_db.commit()
        session_id = session.id
    _wake(session_id)


def _client_gender(db, client_id: int) -> Optional[str]:
    """The client's stated gender, read in the caller's already-open session.

    Deliberately called only from _claim_or_delay, which runs BEFORE generation starts.
    Never call this from inside the generation coroutine."""
    from app.models.user import User

    try:
        row = db.query(User.gender).filter(User.id == client_id).first()
    except Exception:  # noqa: BLE001 — an unreadable gender must never stop a reading
        logger.warning("reading_client_gender_unreadable", client_id=client_id)
        return None
    if row is None or row[0] is None:
        return None
    return getattr(row[0], "value", str(row[0]))


@dataclass
class _Claim:
    chat_session_id: int
    chat_id: int
    client_id: int
    psychic_id: int
    mode: str
    owner: str
    version: int
    through_message_id: int
    contents: list[str]
    # Read here, at claim time, because the claim is built OUTSIDE the generation coroutine
    # in a session that is already open. Reading it later would mean a database call in the
    # window between generation starting and delivery finishing, which is the one thing this
    # file is not allowed to do.
    client_gender: Optional[str] = None
    response_bubbles: Optional[list[str]] = None
    response_reserve: str = ""
    response_route: Optional[str] = None
    delivery_position: int = 0


@dataclass
class _Next:
    claim: Optional[_Claim] = None
    delay: Optional[float] = None


def _claim_or_delay(chat_session_id: int) -> _Next:
    from app.database.client import SessionLocal
    from app.enums.chat_session_status import ChatSessionStatus
    from app.enums.chat_status import ChatStatus
    from app.enums.response_mode import ResponseMode
    from app.models.chat import Chat
    from app.models.chat_session import ChatSession
    from app.models.message import Message

    drafting_enabled, reading_engine = _engine_config()
    with SessionLocal() as db:
        row = _locked_row(db, chat_session_id)
        if row is None or row.latest_client_message_id is None:
            return _Next()
        chat = db.query(Chat).filter(Chat.id == row.chat_id).first()
        if chat is None or chat.status != ChatStatus.ACTIVE:
            row.status = "IDLE"
            db.commit()
            return _Next()
        current_session = (
            db.query(ChatSession)
            .filter(ChatSession.chat_id == chat.id)
            .order_by(desc(ChatSession.id))
            .first()
        )
        if (
            current_session is None
            or current_session.id != chat_session_id
            or current_session.status != ChatSessionStatus.ACTIVE
        ):
            row.status = "IDLE"
            row.lease_owner = None
            row.lease_expires_at = None
            _clear_plan(row)
            db.commit()
            return _Next()
        if chat.response_mode == ResponseMode.HUMAN:
            return _Next()
        if not drafting_enabled or reading_engine != "two_role":
            logger.info(
                "reading_burst_engine_unavailable",
                chat_id=chat.id,
                engine=reading_engine,
            )
            return _Next()
        if row.status == "FAILED":
            return _Next()
        if row.status in {"PENDING_REVIEW", "AWAITING_REGEN"}:
            return _Next()
        if (
            row.completed_client_message_id is not None
            and row.latest_client_message_id <= row.completed_client_message_id
        ):
            row.status = "IDLE"
            db.commit()
            return _Next()

        now = _now()
        active_signals = _signals(row.typing_signals, now)
        cleaned = _dump_signals(active_signals)
        if cleaned != (row.typing_signals or "{}"):
            row.typing_signals = cleaned

        lease_until = _aware(row.lease_expires_at)
        if row.lease_owner and lease_until and lease_until > now:
            db.commit()
            return _Next(delay=max(0.05, (lease_until - now).total_seconds()))

        due = _aware(row.silence_until) or now
        if active_signals:
            due = max(due, max(active_signals.values()))
        if due > now:
            db.commit()
            return _Next(delay=max(0.05, (due - now).total_seconds()))

        owner = uuid4().hex
        row.lease_owner = owner
        row.lease_expires_at = now + timedelta(seconds=GENERATION_LEASE_SECONDS)

        if row.status == "DELIVERING" and row.response_bubbles:
            try:
                bubbles = json.loads(row.response_bubbles)
            except (TypeError, ValueError):
                bubbles = []
            if isinstance(bubbles, list) and row.delivery_position < len(bubbles):
                claim = _Claim(
                    chat_session_id=chat_session_id,
                    chat_id=chat.id,
                    client_id=chat.user_id,
                    psychic_id=chat.psychic_id,
                    mode=chat.response_mode.value,
                    owner=owner,
                    version=row.generation_version,
                    through_message_id=row.latest_client_message_id,
                    contents=[],
                    response_bubbles=[str(item) for item in bubbles],
                    response_reserve=row.response_reserve or "",
                    response_route=row.response_route,
                    delivery_position=row.delivery_position,
                )
                db.commit()
                return _Next(claim=claim)

        boundary = row.completed_client_message_id or 0
        messages = (
            db.query(Message)
            .filter(
                Message.chat_session_id == chat_session_id,
                Message.sender_id == chat.user_id,
                Message.is_system.is_(False),
                Message.id > boundary,
                Message.id <= row.latest_client_message_id,
            )
            .order_by(Message.id.asc())
            .all()
        )
        if not messages:
            row.status = "IDLE"
            row.lease_owner = None
            row.lease_expires_at = None
            db.commit()
            return _Next()
        row.status = "GENERATING"
        _clear_plan(row)
        claim = _Claim(
            chat_session_id=chat_session_id,
            chat_id=chat.id,
            client_id=chat.user_id,
            psychic_id=chat.psychic_id,
            mode=chat.response_mode.value,
            owner=owner,
            version=row.generation_version,
            through_message_id=messages[-1].id,
            contents=[message.content for message in messages],
            client_gender=_client_gender(db, chat.user_id),
        )
        db.commit()
        return _Next(claim=claim)


def _claim_valid(claim: _Claim, expected_status: Optional[str] = None) -> bool:
    from app.database.client import SessionLocal
    from app.enums.chat_status import ChatStatus
    from app.models.chat import Chat

    with SessionLocal() as db:
        row = _locked_row(db, claim.chat_session_id)
        chat = db.query(Chat).filter(Chat.id == claim.chat_id).first()
        valid = bool(
            row
            and chat
            and chat.status == ChatStatus.ACTIVE
            and chat.response_mode.value == claim.mode
            and row.lease_owner == claim.owner
            and row.generation_version == claim.version
            and row.latest_client_message_id == claim.through_message_id
            and (expected_status is None or row.status == expected_status)
        )
        return valid


def _heartbeat(claim: _Claim) -> bool:
    from app.database.client import SessionLocal
    from app.enums.chat_status import ChatStatus
    from app.models.chat import Chat

    with SessionLocal() as db:
        row = _locked_row(db, claim.chat_session_id)
        chat = db.query(Chat).filter(Chat.id == claim.chat_id).first()
        if not (
            row
            and chat
            and chat.status == ChatStatus.ACTIVE
            and chat.response_mode.value == claim.mode
            and row.lease_owner == claim.owner
            and row.generation_version == claim.version
        ):
            return False
        row.lease_expires_at = _now() + timedelta(seconds=GENERATION_LEASE_SECONDS)
        db.commit()
        return True


async def _heartbeat_loop(claim: _Claim) -> None:
    while True:
        await asyncio.sleep(GENERATION_HEARTBEAT_SECONDS)
        if not _heartbeat(claim):
            _wake_events.setdefault(claim.chat_session_id, asyncio.Event()).set()
            return


def _release_claim(claim: _Claim, *, failed: bool = False) -> None:
    from app.database.client import SessionLocal

    with SessionLocal() as db:
        row = _locked_row(db, claim.chat_session_id)
        if row is None or row.lease_owner != claim.owner:
            return
        row.lease_owner = None
        row.lease_expires_at = None
        if row.generation_version == claim.version:
            row.status = "FAILED" if failed else "WAITING"
        _clear_plan(row) if row.status != "DELIVERING" else None
        db.commit()


def _working_state(claim: _Claim):
    from app.services.ai.reading_session import (
        create_session_state,
        get_session_store,
        record_client_message,
    )

    store = get_session_store()
    state = store.get(f"chat:{claim.chat_id}")
    if state is None:
        state = create_session_state(
            f"chat:{claim.chat_id}",
            client_id=claim.client_id,
            chat_id=claim.chat_id,
            is_first_session=True,
        )
    state = copy.deepcopy(state)
    turn = format_client_turn(claim.contents)
    if not _pending_client_turn_is_recorded(state, turn):
        record_client_message(state, turn)
    return store, state, turn, state.chat_transcript[-1]


def _commit_hybrid(claim: _Claim, text: str) -> bool:
    from app.database.client import SessionLocal
    from app.enums.ai_draft_status import AiDraftStatus
    from app.enums.chat_session_status import ChatSessionStatus
    from app.enums.chat_status import ChatStatus
    from app.enums.response_mode import ResponseMode
    from app.models.ai_draft import AiDraft
    from app.models.chat import Chat
    from app.models.chat_session import ChatSession

    with SessionLocal() as db:
        row = _locked_row(db, claim.chat_session_id)
        chat = db.query(Chat).filter(Chat.id == claim.chat_id).first()
        current_session = (
            db.query(ChatSession)
            .filter(ChatSession.chat_id == claim.chat_id)
            .order_by(desc(ChatSession.id))
            .first()
        )
        if not (
            row
            and chat
            and chat.status == ChatStatus.ACTIVE
            and chat.response_mode == ResponseMode.HYBRID
            and current_session is not None
            and current_session.id == claim.chat_session_id
            and current_session.status == ChatSessionStatus.ACTIVE
            and row.status == "GENERATING"
            and row.lease_owner == claim.owner
            and row.generation_version == claim.version
            and row.latest_client_message_id == claim.through_message_id
        ):
            return False
        _discard_pending_hybrid_drafts(db, claim.chat_id)
        db.add(
            AiDraft(
                chat_id=claim.chat_id,
                client_message_id=claim.through_message_id,
                mode=ResponseMode.HYBRID,
                draft_text=text,
                sabri_flags=None,
                sabri_passed=False,
                attempts=1,
                status=AiDraftStatus.PENDING,
            )
        )
        # A review draft is not a completed reader response. Keep the client
        # boundary open until the owner actually sends the draft; rejecting or
        # superseding it must regenerate from every still-unanswered message.
        row.status = "PENDING_REVIEW"
        row.lease_owner = None
        row.lease_expires_at = None
        _clear_plan(row)
        db.commit()
        return True


async def _generate_hybrid(claim: _Claim) -> None:
    from app.services.ai import reading_duo

    _store, state, turn, trigger = _working_state(claim)
    text = await reading_duo._write_valentina_turn(
        claim.chat_id,
        turn,
        trigger,
        state,
        claim.client_id,
        psychic_id=claim.psychic_id,
        gender=claim.client_gender,
    )
    if not (text or "").strip():
        raise RuntimeError("Valentina returned an empty Hybrid draft")
    if _commit_hybrid(claim, text):
        logger.info(
            "reading_burst_hybrid_completed",
            chat_id=claim.chat_id,
            messages=len(claim.contents),
        )


def request_hybrid_regeneration(chat_id: int) -> Optional[bool]:
    """Queue one explicit owner-requested Hybrid regeneration.

    The coordinator, rather than the legacy latest-message helper, owns this
    path so the regenerated prompt contains the complete unanswered sequence.
    """
    from app.database.client import SessionLocal
    from app.enums.chat_session_status import ChatSessionStatus
    from app.enums.chat_status import ChatStatus
    from app.enums.response_mode import ResponseMode
    from app.models.chat import Chat
    from app.models.chat_session import ChatSession
    from app.models.message import Message

    drafting_enabled, reading_engine = _engine_config()
    if not drafting_enabled or reading_engine != "two_role":
        return None

    with SessionLocal() as db:
        chat = db.query(Chat).filter(Chat.id == chat_id).first()
        session = (
            db.query(ChatSession)
            .filter(
                ChatSession.chat_id == chat_id,
                ChatSession.status == ChatSessionStatus.ACTIVE,
            )
            .order_by(desc(ChatSession.id))
            .first()
        )
        if (
            chat is None
            or session is None
            or chat.status != ChatStatus.ACTIVE
            or chat.response_mode != ResponseMode.HYBRID
        ):
            return False
        latest = (
            db.query(Message)
            .filter(
                Message.chat_session_id == session.id,
                Message.sender_id == chat.user_id,
                Message.is_system.is_(False),
            )
            .order_by(desc(Message.id))
            .first()
        )
        if latest is None:
            return False
        row = _row_for_update(db, session.id, chat_id)
        latest = (
            db.query(Message)
            .filter(
                Message.chat_session_id == session.id,
                Message.sender_id == chat.user_id,
                Message.is_system.is_(False),
            )
            .order_by(desc(Message.id))
            .first()
        )
        if latest is None:
            return False
        if (
            row.completed_client_message_id is not None
            and latest.id <= row.completed_client_message_id
        ):
            return False
        if (
            row.latest_client_message_id == latest.id
            and row.status in {"WAITING", "GENERATING"}
        ):
            if row.status == "WAITING":
                row.silence_until = _now()
        else:
            _discard_pending_hybrid_drafts(db, chat_id)
            row.latest_client_message_id = latest.id
            row.generation_version += 1
            row.status = "WAITING"
            row.silence_until = _now()
            row.lease_owner = None
            row.lease_expires_at = None
            _clear_plan(row)
        db.commit()
        session_id = session.id
    _wake(session_id)
    return True


def stage_hybrid_draft_send(
    db, chat, draft_id: int
) -> Optional[tuple[str, int]]:
    """Advance the Hybrid boundary inside the caller's delivery transaction.

    Returns the exact ordered client turn for durable AI memory, or ``None``
    when the draft has become stale and must not be delivered.
    """
    from app.enums.ai_draft_status import AiDraftStatus
    from app.enums.chat_session_status import ChatSessionStatus
    from app.enums.chat_status import ChatStatus
    from app.enums.response_mode import ResponseMode
    from app.models.ai_draft import AiDraft
    from app.models.chat import Chat
    from app.models.chat_session import ChatSession
    from app.models.message import Message

    draft = (
        db.query(AiDraft)
        .filter(AiDraft.id == draft_id, AiDraft.chat_id == chat.id)
        .first()
    )
    if draft is None or draft.mode != ResponseMode.HYBRID:
        return None
    trigger = (
        db.get(Message, draft.client_message_id)
        if draft.client_message_id
        else None
    )
    if trigger is None or trigger.chat_session_id is None:
        return None
    current_chat = (
        db.query(Chat)
        .filter(Chat.id == chat.id)
        .populate_existing()
        .with_for_update()
        .first()
    )
    current_session = (
        db.query(ChatSession)
        .filter(ChatSession.chat_id == chat.id)
        .order_by(desc(ChatSession.id))
        .with_for_update()
        .first()
    )
    row = _locked_row(db, trigger.chat_session_id)
    current_draft = (
        db.query(AiDraft)
        .filter(AiDraft.id == draft_id, AiDraft.chat_id == chat.id)
        .populate_existing()
        .with_for_update()
        .first()
    )
    legacy_boundary = (
        _legacy_pending_hybrid_boundary(db, row, trigger, current_chat.user_id)
        if row is not None and current_chat is not None
        else None
    )
    current_boundary = row.completed_client_message_id if row is not None else None
    valid_review_state = (
        row is not None
        and (
            (
                row.status == "PENDING_REVIEW"
                and (
                    row.completed_client_message_id is None
                    or row.completed_client_message_id < trigger.id
                )
            )
            or legacy_boundary is not None
        )
    )
    invalid = (
        row is None
        or current_chat is None
        or current_chat.status != ChatStatus.ACTIVE
        or current_chat.response_mode != ResponseMode.HYBRID
        or current_session is None
        or current_session.id != trigger.chat_session_id
        or current_session.status != ChatSessionStatus.ACTIVE
        or current_draft is None
        or current_draft.status != AiDraftStatus.PENDING
        or current_draft.mode != ResponseMode.HYBRID
        or current_draft.client_message_id != trigger.id
        or trigger.chat_id != current_chat.id
        or trigger.sender_id != current_chat.user_id
        or trigger.is_system
        or row.chat_id != current_chat.id
        or not valid_review_state
        or row.latest_client_message_id != trigger.id
    )
    if invalid:
        if current_draft is not None and current_draft.status == AiDraftStatus.PENDING:
            current_draft.status = AiDraftStatus.DISCARDED
            if (
                row is not None
                and row.chat_id == chat.id
                and row.status == "PENDING_REVIEW"
                and row.latest_client_message_id == trigger.id
            ):
                row.generation_version += 1
                row.status = (
                    "AWAITING_REGEN"
                    if current_chat is not None
                    and current_chat.status == ChatStatus.ACTIVE
                    and current_chat.response_mode == ResponseMode.HYBRID
                    and current_session is not None
                    and current_session.id == trigger.chat_session_id
                    and current_session.status == ChatSessionStatus.ACTIVE
                    else "IDLE"
                )
                row.lease_owner = None
                row.lease_expires_at = None
                _clear_plan(row)
        return None
    latest_non_system = (
        db.query(Message.id)
        .filter(
            Message.chat_session_id == trigger.chat_session_id,
            Message.is_system.is_(False),
        )
        .order_by(desc(Message.id))
        .first()
    )
    if latest_non_system is None or int(latest_non_system[0]) != trigger.id:
        current_draft.status = AiDraftStatus.DISCARDED
        row.generation_version += 1
        row.status = "AWAITING_REGEN"
        row.lease_owner = None
        row.lease_expires_at = None
        _clear_plan(row)
        return None
    boundary = (
        legacy_boundary
        if legacy_boundary is not None
        else (current_boundary or 0)
    )
    messages = (
        db.query(Message)
        .filter(
            Message.chat_session_id == trigger.chat_session_id,
            Message.sender_id == chat.user_id,
            Message.is_system.is_(False),
            Message.id > boundary,
            Message.id <= draft.client_message_id,
        )
        .order_by(Message.id.asc())
        .all()
    )
    if not messages or messages[-1].id != draft.client_message_id:
        return None
    row.completed_client_message_id = draft.client_message_id
    row.generation_version += 1
    row.status = "IDLE"
    row.silence_until = None
    row.lease_owner = None
    row.lease_expires_at = None
    _clear_plan(row)
    current_draft.status = AiDraftStatus.SENT
    return (
        format_client_turn([message.content for message in messages]),
        int(current_session.id),
    )


def stage_hybrid_draft_discard(db, chat, draft_id: int) -> bool:
    """Keep an explicitly rejected turn open until owner regeneration/new input."""
    from app.enums.ai_draft_status import AiDraftStatus
    from app.enums.chat_session_status import ChatSessionStatus
    from app.enums.chat_status import ChatStatus
    from app.enums.response_mode import ResponseMode
    from app.models.ai_draft import AiDraft
    from app.models.chat import Chat
    from app.models.chat_session import ChatSession
    from app.models.message import Message

    draft = (
        db.query(AiDraft)
        .filter(AiDraft.id == draft_id, AiDraft.chat_id == chat.id)
        .first()
    )
    if draft is None or draft.mode != ResponseMode.HYBRID:
        return False
    trigger = (
        db.get(Message, draft.client_message_id)
        if draft.client_message_id
        else None
    )
    if trigger is None or trigger.chat_session_id is None:
        return False
    current_chat = (
        db.query(Chat)
        .filter(Chat.id == chat.id)
        .populate_existing()
        .with_for_update()
        .first()
    )
    current_session = (
        db.query(ChatSession)
        .filter(ChatSession.chat_id == chat.id)
        .order_by(desc(ChatSession.id))
        .with_for_update()
        .first()
    )
    row = _locked_row(db, trigger.chat_session_id)
    current_draft = (
        db.query(AiDraft)
        .filter(AiDraft.id == draft_id, AiDraft.chat_id == chat.id)
        .populate_existing()
        .with_for_update()
        .first()
    )
    if current_draft is None or current_draft.status != AiDraftStatus.PENDING:
        return False
    current_draft.status = AiDraftStatus.DISCARDED
    legacy_boundary = (
        _legacy_pending_hybrid_boundary(db, row, trigger, current_chat.user_id)
        if row is not None and current_chat is not None
        else None
    )
    latest_non_system = (
        db.query(Message.id)
        .filter(
            Message.chat_session_id == trigger.chat_session_id,
            Message.is_system.is_(False),
        )
        .order_by(desc(Message.id))
        .first()
    )
    if (
        row
        and current_chat is not None
        and current_chat.status == ChatStatus.ACTIVE
        and current_chat.response_mode == ResponseMode.HYBRID
        and current_session is not None
        and current_session.id == trigger.chat_session_id
        and current_session.status == ChatSessionStatus.ACTIVE
        and trigger.chat_id == current_chat.id
        and trigger.sender_id == current_chat.user_id
        and not trigger.is_system
        and row.chat_id == current_chat.id
        and (row.status == "PENDING_REVIEW" or legacy_boundary is not None)
        and row.latest_client_message_id == trigger.id
        and latest_non_system is not None
        and int(latest_non_system[0]) == trigger.id
    ):
        if legacy_boundary is not None:
            row.completed_client_message_id = legacy_boundary or None
        row.generation_version += 1
        row.status = "AWAITING_REGEN"
        row.lease_owner = None
        row.lease_expires_at = None
        _clear_plan(row)
    elif (
        row
        and row.chat_id == chat.id
        and row.status == "PENDING_REVIEW"
        and row.latest_client_message_id == trigger.id
    ):
        row.generation_version += 1
        row.status = (
            "AWAITING_REGEN"
            if current_chat is not None
            and current_chat.status == ChatStatus.ACTIVE
            and current_chat.response_mode == ResponseMode.HYBRID
            and current_session is not None
            and current_session.id == trigger.chat_session_id
            and current_session.status == ChatSessionStatus.ACTIVE
            else "IDLE"
        )
        row.lease_owner = None
        row.lease_expires_at = None
        _clear_plan(row)
    return True


def _store_auto_plan(
    claim: _Claim, bubbles: list[str], reserve: str, route: str
) -> bool:
    from app.database.client import SessionLocal
    from app.enums.chat_status import ChatStatus
    from app.enums.response_mode import ResponseMode
    from app.models.chat import Chat

    with SessionLocal() as db:
        row = _locked_row(db, claim.chat_session_id)
        chat = db.query(Chat).filter(Chat.id == claim.chat_id).first()
        if not (
            row
            and chat
            and chat.status == ChatStatus.ACTIVE
            and chat.response_mode == ResponseMode.SABRI
            and row.status == "GENERATING"
            and row.lease_owner == claim.owner
            and row.generation_version == claim.version
            and row.latest_client_message_id == claim.through_message_id
        ):
            return False
        row.status = "DELIVERING"
        row.response_bubbles = json.dumps(bubbles)
        row.response_reserve = reserve
        row.response_route = route
        row.delivery_position = 0
        db.commit()
        return True


async def _deliver_bubble(
    claim: _Claim, bubble: str, expected_position: int, total: int
):
    """Serialize, commit and notify one Automatic bubble in causal order."""
    async with message_flow_lock(claim.chat_id):
        return await _deliver_bubble_serialized(
            claim, bubble, expected_position, total
        )


async def _deliver_bubble_serialized(
    claim: _Claim, bubble: str, expected_position: int, total: int
):
    """Commit one reader Message and reveal progress atomically, then broadcast it."""
    from app.database.client import SessionLocal
    from app.enums.chat_status import ChatStatus
    from app.enums.response_mode import ResponseMode
    from app.models.chat import Chat
    from app.services.chats import broadcast_persisted_ai_message, prepare_ai_message

    db = SessionLocal()
    try:
        row = _locked_row(db, claim.chat_session_id)
        chat = db.query(Chat).filter(Chat.id == claim.chat_id).first()
        if not (
            row
            and chat
            and chat.status == ChatStatus.ACTIVE
            and chat.response_mode == ResponseMode.SABRI
            and row.status == "DELIVERING"
            and row.lease_owner == claim.owner
            and row.generation_version == claim.version
            and row.latest_client_message_id == claim.through_message_id
            and row.delivery_position == expected_position
        ):
            db.rollback()
            return None, False
        message = prepare_ai_message(db, chat, bubble)
        row.delivery_position = expected_position + 1
        finished = row.delivery_position == total
        if finished:
            row.completed_client_message_id = claim.through_message_id
            row.status = "IDLE"
            row.lease_owner = None
            row.lease_expires_at = None
            _clear_plan(row)
        db.commit()
        db.refresh(message)
        await broadcast_persisted_ai_message(db, chat, message)
        return message, finished
    finally:
        db.close()


async def _sleep_or_wake(chat_session_id: int, seconds: float) -> None:
    if seconds <= 0:
        return
    event = _wake_events.setdefault(chat_session_id, asyncio.Event())
    event.clear()
    try:
        await asyncio.wait_for(event.wait(), timeout=seconds)
    except asyncio.TimeoutError:
        pass


async def _deliver_auto_plan(claim: _Claim, state=None, store=None) -> bool:
    from app.services.ai import reading_executor
    from app.services.ai.reading_ledger import record_commitments
    from app.services.ai.reading_session import get_session_store, record_sent_message

    bubbles = claim.response_bubbles or []
    if not bubbles:
        return False
    store = store or get_session_store()
    state = state or store.get_or_create(
        f"chat:{claim.chat_id}",
        client_id=claim.client_id,
        chat_id=claim.chat_id,
    )
    config = reading_executor.proportional_reveal_config_from_settings()
    # Real delivery has started: the presence watchdog's job is done and it must not be left
    # holding the indicator on behind the reveal's own on/off.
    _stop_typing_presence(claim.chat_session_id)
    try:
        for position in range(claim.delivery_position, len(bubbles)):
            if position > claim.delivery_position:
                await _sleep_or_wake(
                    claim.chat_session_id, config.between_bubbles_ms / 1000.0
                )
            if not _claim_valid(claim, "DELIVERING"):
                return False
            await reading_executor.broadcast_typing(
                claim.chat_id, True, claim.psychic_id
            )
            typing_seconds = (
                reading_executor.compute_proportional_typing_ms(
                    bubbles[position], config
                )
                / 1000.0
            )
            await _sleep_or_wake(claim.chat_session_id, typing_seconds)
            message, finished = await _deliver_bubble(
                claim, bubbles[position], position, len(bubbles)
            )
            if message is None:
                return False
            if position == 0:
                # The number that matters: her message to the first words on her
                # screen, including the burst wait, both model calls and the
                # typing simulation.
                logger.info(
                    "reading_burst_first_bubble_timed",
                    chat_id=claim.chat_id,
                    chat_session_id=claim.chat_session_id,
                    time_to_first_bubble_ms=_elapsed_ms_since_arrival(
                        claim.chat_session_id, clear=True
                    ),
                    bubbles=len(bubbles),
                )
            record_sent_message(state, bubbles[position])
            record_commitments(state, bubbles[position])
            # The reserve was already banked, in full, before this delivery started. There is
            # nothing to decide here any more: the old guard existed to tell a drained reserve
            # apart from a glue reply that echoed nothing, could not, and so re-delivered the
            # tail of a reserve forever. Nothing is consumed by sending, so nothing is written
            # back on the way out.
            store.put(state)
            await reading_executor.broadcast_typing(
                claim.chat_id, False, claim.psychic_id
            )
        logger.info(
            "reading_burst_auto_completed",
            chat_id=claim.chat_id,
            messages=len(claim.contents),
            bubbles=len(bubbles),
            words=sum(len(b.split()) for b in bubbles),
        )
        # BETWEEN turns, with delivery finished and the client now reading: fold the capsule
        # if it has grown past its size trigger. Fired, never awaited, and deliberately here
        # rather than anywhere upstream — it must never run during generation.
        from app.services.ai import reading_capsule

        reading_capsule.schedule_fold(claim.chat_id)
        return True
    finally:
        try:
            await reading_executor.broadcast_typing(
                claim.chat_id, False, claim.psychic_id
            )
        except Exception:  # noqa: BLE001
            pass


async def _generate_auto(claim: _Claim) -> None:
    from app.services.ai import reading_duo

    store, state, turn, trigger = _working_state(claim)
    waited_seconds = (_elapsed_ms_since_arrival(claim.chat_session_id) or 0) / 1000.0
    generation_started = time.perf_counter()
    # Several texts sent close together are ONE thing being said, so Valentina reads the whole
    # turn. Sabri answers only the last of them: she is waiting on her newest message, and
    # answering the one before it is what happened live.
    contents = [c for c in (claim.contents or []) if (c or "").strip()]
    newest = contents[-1] if contents else turn
    earlier = contents[:-1]

    def _waited_now() -> float:
        # A dict lookup and a perf_counter read. No database, no IO — nothing that could
        # stall the loop between generation starting and delivery finishing.
        return (_elapsed_ms_since_arrival(claim.chat_session_id) or 0) / 1000.0

    # THE OPENING TURN OF A PRE-SESSION READING. The reserve was written from precisely
    # this message, while she waited to be accepted, so there is nothing to decide: deliver
    # it. Left to the router it asks "does the held material answer her?" of a Haiku call
    # that has no idea the held material IS the answer to her — and live, it said no and
    # spent another sixty seconds writing a second reading she had already waited for.
    forced = None
    if (
        getattr(state, "pre_reading_status", None) == "READY"
        and getattr(state, "pre_reading_message_id", None) == claim.through_message_id
        and (state.reserve or "").strip()
    ):
        forced = "continue"
        logger.info("reading_pre_session_opening_from_reserve", chat_id=claim.chat_id,
                    reserve_chars=len((state.reserve or "").strip()))

    bubbles, reserve, route = await reading_duo._duo_generate(
        claim.chat_id,
        turn,
        trigger,
        state,
        claim.client_id,
        forced,
        psychic_id=claim.psychic_id,
        waited_seconds=waited_seconds,
        newest_message=newest,
        earlier_messages=earlier,
        waited_seconds_now=_waited_now,
        gender=claim.client_gender,
    )
    # Both model calls, Valentina then Sabri, live inside that await.
    logger.info(
        "reading_burst_generation_timed",
        chat_id=claim.chat_id,
        chat_session_id=claim.chat_session_id,
        generation_ms=int((time.perf_counter() - generation_started) * 1000),
        waiting_ms=_elapsed_ms_since_arrival(claim.chat_session_id),
        route=route,
        bubbles=len(bubbles or []),
        words=sum(len(b.split()) for b in (bubbles or [])),
    )
    # BANK FIRST, THEN CHECK WHETHER THIS TURN IS STILL WANTED.
    #
    # These two statements used to be the other way round, and that order destroyed a whole
    # Opus reading every time the client typed while it was generating: her message bumped
    # the generation version, _store_auto_plan rejected the now-stale claim, and the function
    # returned one line above the assignment that would have kept the writing. The reading was
    # finished and paid for at that point. Whether she happened to type during it has nothing
    # to do with whether Valentina's words are worth keeping — they are the same words, and
    # the next turn can send them. So the reserve is banked unconditionally, before the claim
    # is tested, and only DELIVERY depends on the claim still being valid.
    #
    # This is a write to memory plus the session store's existing write-through, in the same
    # place the store write already happened. No new database call is introduced between the
    # start of generation and the end of delivery.
    state.reserve = reserve
    store.put(state)
    if not _store_auto_plan(claim, bubbles, reserve, route):
        logger.info(
            "reading_burst_superseded_writing_kept",
            chat_id=claim.chat_id,
            reserve_chars=len((reserve or "").strip()),
        )
        return
    claim.response_bubbles = bubbles
    claim.response_reserve = reserve
    claim.response_route = route
    claim.delivery_position = 0
    await _deliver_auto_plan(claim, state=state, store=store)


async def _execute_claim(claim: _Claim) -> None:
    heartbeat = asyncio.create_task(_heartbeat_loop(claim))
    _generating.add(claim.chat_id)
    failed = False
    try:
        if claim.response_bubbles is not None:
            await _deliver_auto_plan(claim)
        elif claim.mode == "HYBRID":
            await _generate_hybrid(claim)
        elif claim.mode == "SABRI":
            await _generate_auto(claim)
    except asyncio.CancelledError:
        raise
    except Exception as error:  # noqa: BLE001 - never crash the chat loop
        failed = True
        logger.error(
            "reading_burst_failed",
            chat_id=claim.chat_id,
            error=str(error),
            exc_info=True,
        )
    finally:
        heartbeat.cancel()
        try:
            await heartbeat
        except (asyncio.CancelledError, Exception):
            pass
        _generating.discard(claim.chat_id)
        if failed:
            # The turn died. Whatever put the typing indicator on must not leave her
            # watching a reader who is never going to type anything.
            _stop_typing_presence(claim.chat_session_id)
            try:
                from app.services.ai import reading_executor

                await reading_executor.broadcast_typing(
                    claim.chat_id, False, claim.psychic_id
                )
            except Exception:  # noqa: BLE001
                pass
        _release_claim(claim, failed=failed)


async def _run_session(chat_session_id: int) -> None:
    event = _wake_events.setdefault(chat_session_id, asyncio.Event())
    try:
        while not _stopping:
            nxt = _claim_or_delay(chat_session_id)
            if nxt.claim is not None:
                await _execute_claim(nxt.claim)
                continue
            if nxt.delay is None:
                return
            event.clear()
            try:
                await asyncio.wait_for(event.wait(), timeout=nxt.delay)
            except asyncio.TimeoutError:
                pass
    except asyncio.CancelledError:
        raise
    except Exception as error:  # noqa: BLE001
        logger.error(
            "reading_burst_runner_failed",
            chat_session_id=chat_session_id,
            error=str(error),
            exc_info=True,
        )


async def start_burst_coordinator() -> None:
    """Recover waiting, expired-generation, and partial-delivery rows on startup."""
    global _stopping
    _stopping = False
    from app.database.client import SessionLocal
    from app.models.reading_message_burst import ReadingMessageBurst

    with SessionLocal() as db:
        session_ids = [
            int(row[0])
            for row in db.query(ReadingMessageBurst.chat_session_id)
            .filter(
                ReadingMessageBurst.status.in_(["WAITING", "GENERATING", "DELIVERING"])
            )
            .all()
        ]
    for session_id in session_ids:
        _wake(session_id)
    logger.info("reading_burst_coordinator_started", recoverable=len(session_ids))


async def stop_burst_coordinator() -> None:
    global _stopping
    _stopping = True
    tasks = list(_tasks.values())
    _tasks.clear()
    for task in tasks:
        if not task.done():
            task.cancel()
    if tasks:
        await asyncio.gather(*tasks, return_exceptions=True)
    _wake_events.clear()
    _generating.clear()
