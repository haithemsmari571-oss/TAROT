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
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Dict, Optional
from uuid import uuid4

from sqlalchemy import desc
from sqlalchemy.exc import IntegrityError

from app.logging_config import get_logger

logger = get_logger(__name__)

MESSAGE_BURST_SILENCE_SECONDS = 6.0
CLIENT_TYPING_EXPIRY_SECONDS = 12.0
GENERATION_LEASE_SECONDS = 90.0
GENERATION_HEARTBEAT_SECONDS = 15.0

_tasks: Dict[int, asyncio.Task] = {}
_wake_events: Dict[int, asyncio.Event] = {}
_generating: set[int] = set()
_stopping = False


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


async def note_client_message(
    chat_id: int, chat_session_id: Optional[int], message_id: int
) -> None:
    """Open/reset a burst after the canonical Message row has committed."""
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
    logger.info(
        "reading_burst_message_noted",
        chat_id=chat_id,
        chat_session_id=chat_session_id,
        message_id=message_id,
    )
    _wake(chat_session_id)


async def note_reader_message(
    chat_id: int, chat_session_id: Optional[int], reader_message_id: int
) -> None:
    """A human reader response closes only client messages that preceded it."""
    if chat_session_id is None:
        return
    from app.database.client import SessionLocal
    from app.models.chat import Chat
    from app.models.message import Message

    with SessionLocal() as db:
        chat = db.query(Chat).filter(Chat.id == chat_id).first()
        if chat is None:
            return
        latest_client = (
            db.query(Message.id)
            .filter(
                Message.chat_session_id == chat_session_id,
                Message.sender_id == chat.user_id,
                Message.is_system.is_(False),
                Message.id < reader_message_id,
            )
            .order_by(desc(Message.id))
            .first()
        )
        row = _row_for_update(db, chat_session_id, chat_id)
        if latest_client is not None:
            boundary = int(latest_client[0])
            if (
                row.completed_client_message_id is None
                or boundary > row.completed_client_message_id
            ):
                row.completed_client_message_id = boundary
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
    from app.enums.chat_status import ChatStatus
    from app.enums.response_mode import ResponseMode
    from app.models.chat import Chat
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
    record_client_message(state, turn)
    return store, state, turn, state.chat_transcript[-1]


def _commit_hybrid(claim: _Claim, text: str) -> bool:
    from app.database.client import SessionLocal
    from app.enums.ai_draft_status import AiDraftStatus
    from app.enums.chat_status import ChatStatus
    from app.enums.response_mode import ResponseMode
    from app.models.ai_draft import AiDraft
    from app.models.chat import Chat

    with SessionLocal() as db:
        row = _locked_row(db, claim.chat_session_id)
        chat = db.query(Chat).filter(Chat.id == claim.chat_id).first()
        if not (
            row
            and chat
            and chat.status == ChatStatus.ACTIVE
            and chat.response_mode == ResponseMode.HYBRID
            and row.status == "GENERATING"
            and row.lease_owner == claim.owner
            and row.generation_version == claim.version
            and row.latest_client_message_id == claim.through_message_id
        ):
            return False
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
        row.completed_client_message_id = claim.through_message_id
        row.status = "IDLE"
        row.lease_owner = None
        row.lease_expires_at = None
        _clear_plan(row)
        db.commit()
        return True


async def _generate_hybrid(claim: _Claim) -> None:
    from app.services.ai import reading_duo

    store, state, turn, trigger = _working_state(claim)
    text = await reading_duo._write_valentina_turn(
        claim.chat_id,
        turn,
        trigger,
        state,
        claim.client_id,
        psychic_id=claim.psychic_id,
    )
    if not (text or "").strip():
        raise RuntimeError("Valentina returned an empty Hybrid draft")
    if _commit_hybrid(claim, text):
        store.put(state)
        logger.info(
            "reading_burst_hybrid_completed",
            chat_id=claim.chat_id,
            messages=len(claim.contents),
        )


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
            record_sent_message(state, bubbles[position])
            record_commitments(state, bubbles[position])
            if finished:
                if claim.response_route == "new" or claim.response_reserve.strip():
                    state.reserve = claim.response_reserve
                store.put(state)
            else:
                store.put(state)
            await reading_executor.broadcast_typing(
                claim.chat_id, False, claim.psychic_id
            )
        logger.info(
            "reading_burst_auto_completed",
            chat_id=claim.chat_id,
            messages=len(claim.contents),
            bubbles=len(bubbles),
        )
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
    bubbles, reserve, route = await reading_duo._duo_generate(
        claim.chat_id,
        turn,
        trigger,
        state,
        claim.client_id,
        psychic_id=claim.psychic_id,
    )
    if not bubbles:
        raise RuntimeError("Sabri returned no delivery bubbles")
    if not _store_auto_plan(claim, bubbles, reserve, route):
        return
    store.put(state)
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
