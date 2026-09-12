"""The one-call reader engine for per-message billing.

One model call per client message on the ``reading.single`` prompt. There is no
writer and delivery split here: the model writes the final texting-voice
bubbles itself and they go to the client as written, after the same sanitising
every reader bubble gets. Each paid message is answered in its own call, in
message-id order, one at a time per chat.

What this module owns:

    enqueue_reply(chat_id, message_id)   queue one paid client message for a reply
    say_goodbye(chat_id)                 one unbilled closing bubble when she ends
    drain_on_end(chat_id)                refund what was queued and never started
    build_single_input(db, chat, ...)    the material the prompt is handed

What it reuses rather than copies: the session capsule (reading_capsule), the
verified facts block (reading_client_facts), the Atlas memory fetch
(reading_reveal), the client file (reading_assistant), Sabri's bubble sanitiser
(reading_sabri), the per-chat message flow lock (reading_burst), the typing
broadcast and the proportional typing clock (reading_executor), reader-message
persistence (services.chats), the draft log, the ledger and the refund
(services.transactions).

Wired into the live path in step 4c, only under BILLING_MODE=per_message: the
message handler queues each charged client message on an automatic chat, /join
queues the hall question, and the client's End drains the queue and asks for the
goodbye (app/routers/chats.py, app/services/chat/handlers/message_handler.py).
"""

from __future__ import annotations

import asyncio
import copy
import json
import re
import time
from datetime import datetime, timezone
from typing import Dict, List, Optional, Tuple

from app.config import get_app_settings
from app.logging_config import get_logger
from app.services.ai import client as ai_client
from app.services.ai.reading_capsule import format_capsule, schedule_fold
from app.services.ai.reading_client_facts import build_verified_facts_block
from app.services.ai.reading_draft_log import get_draft_log
from app.services.ai.reading_ledger import record_commitments
from app.services.ai.reading_reader import thinking_for_turn
from app.services.ai.reading_session import (
    get_session_store,
    record_client_message,
    record_sent_message,
)
from app.services.ai.reading_single_prompt import READING_SINGLE_PROMPT
from app.services.ai.runtime_prompts import resolve_runtime_prompt_and_model
from app.services.transactions import refund_message

logger = get_logger(__name__)

PROMPT_KEY = "reading.single"
ENGINE = "single"
STAGE_REPLY = "single_reply"
STAGE_GOODBYE = "single_goodbye"
MAX_ATTEMPTS = 2
UNREACHABLE_NOTICE = (
    "i couldn't reach u this time. that message is refunded, try again in a moment"
)
ENDED_NOTE = "The client has ended the reading."
MARKED_MESSAGE_HEADER = (
    "THE MESSAGE TO REPLY TO NOW (the client has just sent this, and this is the "
    "one you answer):"
)

_BLANK_LINE_RE = re.compile(r"\n[ \t]*\n")
_SENTENCE_END_RE = re.compile(r"[.!?](?=\s|$)")

# Per chat: the message ids waiting for a reply (ascending), the worker draining
# them, and the id being answered right now. One worker per chat, one message at
# a time, so replies land in the order the messages were paid for.
_queues: Dict[int, List[int]] = {}
_workers: Dict[int, asyncio.Task] = {}
_in_flight: Dict[int, int] = {}

# Test seam for the typing delays and the gap between bubbles.
_sleep = asyncio.sleep


class _EmptyReply(Exception):
    """The model answered, but nothing survived the parse."""


# ═════════════════════════════════════════════════════════════════════════════
# Public surface
# ═════════════════════════════════════════════════════════════════════════════
async def enqueue_reply(chat_id: int, message_id: int) -> None:
    """Queue ``message_id`` for a reply and start the chat's worker if it is idle.

    Idempotent for a message already queued or already being answered. Must be
    called on the event loop: the worker is a task on it."""
    queue = _queues.setdefault(chat_id, [])
    if message_id in queue or _in_flight.get(chat_id) == message_id:
        return
    queue.append(message_id)
    queue.sort()
    worker = _workers.get(chat_id)
    if worker is None or worker.done():
        task = asyncio.create_task(_worker(chat_id))
        _workers[chat_id] = task
        task.add_done_callback(lambda done, cid=chat_id: _clear_worker(cid, done))
    logger.info(
        "reading_single_enqueued", chat_id=chat_id, message_id=message_id, queued=len(queue)
    )


async def say_goodbye(chat_id: int) -> None:
    """One short warm closing bubble, unbilled: nothing charged, nothing refunded,
    one call with no retry. On any failure it logs and sends nothing."""
    from app.database.client import SessionLocal
    from app.models.chat import Chat

    settings = get_app_settings()
    turn_number = 0
    try:
        with SessionLocal() as db:
            chat = db.get(Chat, chat_id)
            if chat is None:
                logger.warning("reading_single_goodbye_no_chat", chat_id=chat_id)
                return
            state = _state_for(chat)
            await _atlas_memory(state, chat.user_id, chat.psychic_id)
            user_input = build_single_input(db, chat, ended=True)
            psychic_id = chat.psychic_id
        turn_number = state.messages_sent_count
        started = time.monotonic()
        raw, model = await asyncio.wait_for(
            asyncio.to_thread(
                _call_model, user_input, thinking_for_turn(None), settings.SINGLE_MAX_TOKENS
            ),
            timeout=settings.SINGLE_CALL_TIMEOUT_S,
        )
        model_ms = int((time.monotonic() - started) * 1000)
        bubbles, notes = _parse_reply(raw, chat_id=chat_id)
        bubbles = bubbles[:1]
        _log_attempt(
            chat_id, turn_number, 1, STAGE_GOODBYE, raw=raw, notes=notes, delivered=bool(bubbles)
        )
        if not bubbles:
            logger.warning("reading_single_goodbye_empty", chat_id=chat_id)
            return
        await _deliver(chat_id, psychic_id, bubbles, state)
        logger.info(
            "reading_single_goodbye",
            chat_id=chat_id,
            model_ms=model_ms,
            chars=len(bubbles[0]),
            model=model,
        )
    except Exception as error:  # noqa: BLE001 - a goodbye that fails sends nothing
        message = f"{type(error).__name__}: {error}"
        if isinstance(error, asyncio.TimeoutError):
            message = f"timeout after {settings.SINGLE_CALL_TIMEOUT_S}s"
        _log_attempt(chat_id, turn_number, 1, STAGE_GOODBYE, error=message)
        logger.warning("reading_single_goodbye_failed", chat_id=chat_id, error=message)


async def drain_on_end(chat_id: int) -> None:
    """Refund every message queued for this chat and not yet started, and clear
    the queue. A reply already in flight is left alone: it finishes and delivers."""
    from app.database.client import SessionLocal

    queued = list(_queues.pop(chat_id, []))
    refunded = []
    for message_id in queued:
        try:
            with SessionLocal() as db:
                reversal = refund_message(db, message_id)
            refunded.append(
                {"message_id": message_id, "reversal_id": reversal.id if reversal else None}
            )
        except Exception as error:  # noqa: BLE001 - one failed refund must not stop the rest
            logger.error(
                "reading_single_drain_refund_failed",
                chat_id=chat_id,
                message_id=message_id,
                error_type=type(error).__name__,
                error=str(error),
            )
    logger.info(
        "reading_single_drained",
        chat_id=chat_id,
        queued=queued,
        refunded=refunded,
        in_flight=_in_flight.get(chat_id),
    )


async def wait_for_idle(chat_id: int) -> None:
    """Return once the chat has no worker running. For tests and shutdown."""
    while True:
        worker = _workers.get(chat_id)
        if worker is None or worker.done():
            return
        try:
            await worker
        except Exception:  # noqa: BLE001 - the worker never raises; belt and braces
            pass


def build_single_input(db, chat, answer_message_id=None, ended=False) -> str:
    """Assemble the material the reading.single prompt is handed, in this order:

      1. READER IDENTITY, from the chat's psychic row (name, specialisms, bio)
      2. ATLAS CLIENT MEMORY, when the session has fetched any
      3. the session capsule: SESSION FACTS (her own words and the ledger),
         EARLIER IN THIS READING, THE CONVERSATION RIGHT NOW, rendered without
         the message being answered so it is not shown twice
      4. CLIENT FILE
      5. the verified facts block: KNOWN NUMEROLOGY and the gender line, exactly
         as the two-role engine gets them
      6. OPERATOR GUIDANCE, only when the operator has left steering notes,
         rendered exactly as the Valentina input renders them
      7. THE MESSAGE TO REPLY TO NOW, or with ``ended`` a SYSTEM NOTE that the
         client has ended the reading and there is nothing to answer

    The transcript is the engine's own session transcript, caught up from the
    messages table: rows newer than anything recorded are appended, and the
    answered message is always present as the last entry. Every builder here is
    the existing one. The state this updates is persisted before returning."""
    from app.models.message import Message
    from app.services.ai import reading_assistant, reading_steering
    from app.services.client_dossier import get_client_dob

    store = get_session_store()
    state = _state_for(chat)

    answered = None
    if answer_message_id is not None:
        answered = db.get(Message, answer_message_id)
        if answered is None or answered.chat_id != chat.id:
            raise ValueError(f"message {answer_message_id} is not in chat {chat.id}")
    _catch_up_transcript(db, state, chat, upto=answered)
    answered_entry = _entry_for(state, answered.id) if answered is not None else None

    client_file = reading_assistant.build_client_file(db, chat.user_id)
    state.client_file = client_file
    date_of_birth = get_client_dob(db, chat.user_id)
    gender = getattr(getattr(chat, "user", None), "gender", None)
    client_text = (answered.content or "") if answered is not None else None

    view = copy.copy(state)
    view.chat_transcript = [e for e in state.chat_transcript if e is not answered_entry]

    parts: List[str] = []
    identity = _reader_identity_block(getattr(chat, "psychic", None))
    if identity:
        parts.append(identity)
    atlas = (getattr(state, "atlas_memory_text", None) or "").strip()
    if atlas:
        parts.append("ATLAS CLIENT MEMORY (load silently, never cite):\n" + atlas)
    capsule = format_capsule(view).strip()
    if capsule:
        parts.append(capsule)
    parts.append(
        "CLIENT FILE (load silently, never cite):\n" + (client_file or "(none, first session)")
    )
    parts.append(
        build_verified_facts_block(
            date_of_birth=date_of_birth,
            current_year=datetime.now().year,
            client_message=client_text,
            gender=gender,
        )
    )
    # Operator steering notes, the same retrieval and the same block as the
    # Valentina input: get_active_notes returns [] unless the chat is HYBRID
    # with a current session, and the block is omitted entirely when empty.
    guidance = reading_steering.format_guidance_block(
        reading_steering.get_active_notes(db, chat.id)
    )
    if guidance:
        parts.append(guidance)
    if ended:
        parts.append(
            "SYSTEM NOTE: " + ENDED_NOTE + " There is no message to answer. Send your one "
            "short warm closing bubble and nothing else."
        )
    elif answered is not None:
        parts.append(MARKED_MESSAGE_HEADER + "\n" + client_text)
    store.put(state)
    return "\n\n".join(parts)


# ═════════════════════════════════════════════════════════════════════════════
# The worker: one message at a time per chat, ascending message id
# ═════════════════════════════════════════════════════════════════════════════
def _clear_worker(chat_id: int, done: asyncio.Task) -> None:
    if _workers.get(chat_id) is done:
        _workers.pop(chat_id, None)
    if not done.cancelled() and done.exception() is not None:
        logger.error(
            "reading_single_worker_crashed", chat_id=chat_id, error=str(done.exception())
        )


async def _worker(chat_id: int) -> None:
    """Answer the chat's queued messages one at a time. Never raises."""
    while True:
        queue = _queues.get(chat_id) or []
        if not queue:
            return
        message_id = queue.pop(0)
        _in_flight[chat_id] = message_id
        try:
            await _reply(chat_id, message_id)
        except Exception as error:  # noqa: BLE001 - the worker outlives any one reply
            logger.error(
                "reading_single_reply_crashed",
                chat_id=chat_id,
                message_id=message_id,
                error_type=type(error).__name__,
                error=str(error),
            )
        finally:
            _in_flight.pop(chat_id, None)


async def _reply(chat_id: int, message_id: int) -> None:
    """One paid client message: build, call (retry once), parse, deliver, record.
    Both attempts failing means her money back and one honest line."""
    from app.database.client import SessionLocal
    from app.models.chat import Chat
    from app.models.message import Message

    settings = get_app_settings()
    with SessionLocal() as db:
        chat = db.get(Chat, chat_id)
        message = db.get(Message, message_id)
        if chat is None or message is None or message.chat_id != chat_id:
            logger.warning(
                "reading_single_message_missing", chat_id=chat_id, message_id=message_id
            )
            return
        state = _state_for(chat)
        await _atlas_memory(state, chat.user_id, chat.psychic_id)
        user_input = build_single_input(db, chat, answer_message_id=message_id)
        client_text = message.content or ""
        asked_at = _aware(message.created_at)
        psychic_id = chat.psychic_id

    thinking = thinking_for_turn(client_text)
    turn_number = state.messages_sent_count
    last_error: Optional[str] = None
    for attempt in range(1, MAX_ATTEMPTS + 1):
        started = time.monotonic()
        try:
            raw, model = await asyncio.wait_for(
                asyncio.to_thread(_call_model, user_input, thinking, settings.SINGLE_MAX_TOKENS),
                timeout=settings.SINGLE_CALL_TIMEOUT_S,
            )
        except asyncio.TimeoutError:
            last_error = f"timeout after {settings.SINGLE_CALL_TIMEOUT_S}s"
            _log_attempt(chat_id, turn_number, attempt, STAGE_REPLY, error=last_error)
            logger.warning(
                "reading_single_attempt_failed",
                chat_id=chat_id,
                message_id=message_id,
                attempt=attempt,
                error=last_error,
            )
            continue
        except Exception as error:  # noqa: BLE001 - any SDK error is one failed attempt
            last_error = f"{type(error).__name__}: {error}"
            _log_attempt(chat_id, turn_number, attempt, STAGE_REPLY, error=last_error)
            logger.warning(
                "reading_single_attempt_failed",
                chat_id=chat_id,
                message_id=message_id,
                attempt=attempt,
                error=last_error,
            )
            continue
        model_ms = int((time.monotonic() - started) * 1000)
        bubbles, notes = _parse_reply(raw, chat_id=chat_id, message_id=message_id)
        if not bubbles:
            last_error = "empty parsed output"
            _log_attempt(
                chat_id, turn_number, attempt, STAGE_REPLY, raw=raw, notes=notes, error=last_error
            )
            logger.warning(
                "reading_single_attempt_failed",
                chat_id=chat_id,
                message_id=message_id,
                attempt=attempt,
                error=last_error,
            )
            continue
        _log_attempt(
            chat_id, turn_number, attempt, STAGE_REPLY, raw=raw, notes=notes, delivered=True
        )
        first_bubble_at = await _deliver(chat_id, psychic_id, bubbles, state)
        logger.info(
            "reading_single_reply",
            chat_id=chat_id,
            message_id=message_id,
            attempt=attempt,
            model_ms=model_ms,
            first_bubble_ms=_ms_between(asked_at, first_bubble_at),
            bubbles=len(bubbles),
            chars=sum(len(b) for b in bubbles),
            thinking=bool(thinking.get("thinking")),
            model=model,
        )
        return

    await _refund_and_notify(chat_id, psychic_id, message_id, state, last_error)


async def _refund_and_notify(chat_id, psychic_id, message_id, state, last_error) -> None:
    """Both attempts failed: reverse the message's debit, then one bubble in the
    reader's voice saying so, persisted like any reader message."""
    from app.database.client import SessionLocal

    reversal_id = None
    try:
        with SessionLocal() as db:
            reversal = refund_message(db, message_id)
            reversal_id = reversal.id if reversal is not None else None
    except Exception as error:  # noqa: BLE001 - the notice still goes out
        logger.error(
            "reading_single_refund_failed",
            chat_id=chat_id,
            message_id=message_id,
            error_type=type(error).__name__,
            error=str(error),
        )
    try:
        await _deliver(chat_id, psychic_id, [UNREACHABLE_NOTICE], state)
    except Exception as error:  # noqa: BLE001 - never raise out of the worker
        logger.error(
            "reading_single_notice_failed",
            chat_id=chat_id,
            message_id=message_id,
            error_type=type(error).__name__,
            error=str(error),
        )
    logger.warning(
        "reading_single_failed",
        chat_id=chat_id,
        message_id=message_id,
        reversal_id=reversal_id,
        error=last_error,
    )


# ═════════════════════════════════════════════════════════════════════════════
# The call, the parse, the delivery
# ═════════════════════════════════════════════════════════════════════════════
def _call_model(user_input: str, thinking: dict, max_tokens: int) -> Tuple[str, str]:
    """Blocking: resolve the registry prompt and model, stream one reply to full
    text. The same streaming helper write_valentina uses. Call from a thread."""
    from app.services.ai import defaults as ai_defaults

    prompt, model = resolve_runtime_prompt_and_model(
        PROMPT_KEY, READING_SINGLE_PROMPT, ai_defaults.SINGLE_READER_MODEL
    )
    chunks = ai_client.run_chat_stream(
        system=prompt,
        user_content=user_input,
        model=model,
        max_tokens=max_tokens,
        thinking=thinking.get("thinking"),
        effort=thinking.get("effort"),
    )
    return "".join(chunks), model


def _parse_reply(raw: str, *, chat_id=None, message_id=None) -> Tuple[List[str], dict]:
    """Raw model text to client-ready bubbles: split on blank lines, keep the first
    SINGLE_MAX_BUBBLES, sanitise each, strip a stray reserve marker, and hold the
    whole reply under SINGLE_HARD_CHAR_CAP. Returns (bubbles, notes) where notes
    records everything that was corrected, for the draft log."""
    from app.services.ai.reading_sabri import RESERVE_SENTINEL, sanitize_delivery_text

    settings = get_app_settings()
    notes: dict = {}
    text = raw or ""
    if RESERVE_SENTINEL in text:
        notes["reserve_marker_stripped"] = text.count(RESERVE_SENTINEL)
        logger.warning(
            "reading_single_reserve_marker",
            chat_id=chat_id,
            message_id=message_id,
            count=notes["reserve_marker_stripped"],
        )
        text = text.replace(RESERVE_SENTINEL, "")

    parts = [p.strip() for p in _BLANK_LINE_RE.split(text.strip()) if p.strip()]
    if len(parts) > settings.SINGLE_MAX_BUBBLES:
        notes["bubbles_dropped"] = len(parts) - settings.SINGLE_MAX_BUBBLES
        logger.warning(
            "reading_single_bubbles_capped",
            chat_id=chat_id,
            message_id=message_id,
            count=len(parts),
            kept=settings.SINGLE_MAX_BUBBLES,
        )
        parts = parts[: settings.SINGLE_MAX_BUBBLES]

    tells = {
        "em_dash": sum(p.count("—") for p in parts),
        "en_dash": sum(p.count("–") for p in parts),
        "markdown": sum(p.count("**") + p.count("`") for p in parts),
    }
    tells = {name: count for name, count in tells.items() if count}
    if tells:
        notes["sanitized"] = tells
        logger.warning(
            "reading_single_tells_sanitized", chat_id=chat_id, message_id=message_id, **tells
        )

    bubbles = [b for b in (sanitize_delivery_text(p) for p in parts) if b]
    bubbles, trimmed = _apply_hard_cap(bubbles, settings.SINGLE_HARD_CHAR_CAP)
    if trimmed:
        notes["hard_cap"] = trimmed
        logger.warning(
            "reading_single_hard_cap_trimmed", chat_id=chat_id, message_id=message_id, **trimmed
        )
    return bubbles, notes


def _apply_hard_cap(bubbles: List[str], cap: int) -> Tuple[List[str], Optional[dict]]:
    """Trim the LAST bubble at the last sentence end that keeps the whole reply
    inside ``cap`` characters. A last bubble that would have to vanish entirely
    is dropped and the one before it is trimmed instead. With no sentence end
    before the cut, the last word boundary is used rather than mid-word."""
    total = sum(len(b) for b in bubbles)
    if not bubbles or total <= cap:
        return bubbles, None
    kept = list(bubbles)
    while kept and sum(len(b) for b in kept) > cap:
        overflow = sum(len(b) for b in kept) - cap
        last = kept[-1]
        allowed = len(last) - overflow
        if allowed <= 0:
            kept.pop()
            continue
        cut = None
        for match in _SENTENCE_END_RE.finditer(last):
            if match.end() <= allowed:
                cut = match.end()
            else:
                break
        if cut is None:
            cut = last.rfind(" ", 0, allowed)
            if cut <= 0:
                cut = allowed
        kept[-1] = last[:cut].rstrip()
        if not kept[-1]:
            kept.pop()
        break
    return kept, {
        "total_before": total,
        "cap": cap,
        "total_after": sum(len(b) for b in kept),
        "bubbles_before": len(bubbles),
        "bubbles_after": len(kept),
    }


async def _deliver(chat_id: int, psychic_id, bubbles: List[str], state) -> Optional[datetime]:
    """Send the bubbles as the psychic: typing on, a capped proportional typing
    delay, persist and broadcast under the chat's message flow lock, the usual
    gap between bubbles. Each delivered bubble goes on the transcript and into the
    ledger; the state is persisted and a capsule fold is scheduled afterwards.
    Returns when the first bubble was broadcast."""
    from app.services.ai.reading_burst import message_flow_lock
    from app.services.ai.reading_executor import (
        compute_proportional_typing_ms,
        proportional_reveal_config_from_settings,
    )

    settings = get_app_settings()
    config = proportional_reveal_config_from_settings()
    first_bubble_at: Optional[datetime] = None
    try:
        for index, bubble in enumerate(bubbles):
            if index:
                await _sleep(config.between_bubbles_ms / 1000.0)
            await _typing(chat_id, True, psychic_id)
            typing_ms = min(
                compute_proportional_typing_ms(bubble, config), settings.SINGLE_MAX_TYPING_MS
            )
            await _sleep(max(0, typing_ms) / 1000.0)
            async with message_flow_lock(chat_id):
                sent_id, sent_at = await _persist_and_broadcast(chat_id, bubble)
            if first_bubble_at is None:
                first_bubble_at = sent_at
            record_sent_message(state, bubble)
            state.chat_transcript[-1]["message_id"] = sent_id
            record_commitments(state, bubble)
            await _typing(chat_id, False, psychic_id)
    finally:
        await _typing(chat_id, False, psychic_id)
        get_session_store().put(state)
    schedule_fold(chat_id)
    return first_bubble_at


async def _persist_and_broadcast(chat_id: int, text: str) -> Tuple[int, datetime]:
    """Store one reader message and push it to the room. Returns (id, sent at)."""
    from app.database.client import SessionLocal
    from app.models.chat import Chat
    from app.services.chats import broadcast_persisted_ai_message, prepare_ai_message

    with SessionLocal() as db:
        chat = db.get(Chat, chat_id)
        message = prepare_ai_message(db, chat, text)
        db.commit()
        db.refresh(message)
        await broadcast_persisted_ai_message(db, chat, message)
        return message.id, datetime.now(timezone.utc)


async def _typing(chat_id: int, on: bool, psychic_id) -> None:
    from app.services.ai.reading_executor import broadcast_typing

    await broadcast_typing(chat_id, on, psychic_id)


async def _atlas_memory(state, user_id, psychic_id=None) -> str:
    """The session's Atlas memory through the existing once-per-session fetch,
    which caches the text on the state for build_single_input to render."""
    from app.services.ai.reading_reveal import _atlas_memory_for_session

    return await _atlas_memory_for_session(state, user_id, psychic_id)


def _log_attempt(
    chat_id, turn_number, attempt, stage, *, raw="", notes=None, error=None, delivered=False
) -> None:
    """One draft-log row per attempt: the raw output, or the error. Never raises."""
    try:
        payload = dict(notes or {})
        if error:
            payload["error"] = error
        get_draft_log().log(
            chat_id=chat_id,
            turn_number=turn_number,
            engine=ENGINE,
            stage=stage,
            raw_content=raw if raw else (f"ERROR: {error}" if error else ""),
            attempt_number=attempt,
            notes=json.dumps(payload) if payload else None,
            is_delivered=delivered,
        )
    except Exception:  # noqa: BLE001 - audit logging must never affect a reply
        pass


# ═════════════════════════════════════════════════════════════════════════════
# Session state and the transcript
# ═════════════════════════════════════════════════════════════════════════════
def _state_for(chat):
    return get_session_store().get_or_create(
        f"chat:{chat.id}", client_id=chat.user_id, chat_id=chat.id, is_first_session=True
    )


def _catch_up_transcript(db, state, chat, upto=None) -> None:
    """Bring the state's transcript up to date from the messages table.

    Entries the engine records carry the message id. Rows newer than the newest
    recorded id are appended in id order, so a fresh state (a restart with no
    durable row, or a direct build) reads the whole conversation, and a message
    typed by a human reader mid-chat is not missed. The answered message is
    appended whatever its id, because a message that arrived while the previous
    reply was being delivered has a lower id than that reply's bubbles and still
    belongs after them in the conversation."""
    from app.models.message import Message

    known = {
        e.get("message_id") for e in state.chat_transcript if e.get("message_id") is not None
    }
    newest_known = max(known) if known else 0
    query = db.query(Message).filter(Message.chat_id == chat.id)
    if upto is not None:
        query = query.filter(Message.id <= upto.id)
    for row in query.order_by(Message.id.asc()).all():
        if row.is_system or row.id in known:
            continue
        is_answered = upto is not None and row.id == upto.id
        if row.id < newest_known and not is_answered:
            continue
        _append_entry(state, chat, row)
        known.add(row.id)


def _append_entry(state, chat, row) -> dict:
    content = row.content or ""
    when = _naive(row.created_at)
    if row.sender_id == chat.user_id:
        last = state.chat_transcript[-1] if state.chat_transcript else None
        if (
            last is not None
            and last.get("role") == "client"
            and last.get("message_id") is None
            and last.get("content") == content
        ):
            # The pre-session reading recorded the hall question before it had
            # an id. Same words, same entry.
            last["message_id"] = row.id
            return last
        record_client_message(state, content, now=when)
    else:
        record_sent_message(state, content, now=when)
    entry = state.chat_transcript[-1]
    entry["message_id"] = row.id
    return entry


def _entry_for(state, message_id: int) -> Optional[dict]:
    for entry in reversed(state.chat_transcript):
        if entry.get("message_id") == message_id:
            return entry
    return None


def _reader_identity_block(psychic) -> str:
    """READER IDENTITY from the psychic row: public name, then specialisms and bio
    when the account has them. Empty when there is no psychic, so the prompt's own
    fallback (Valentina) applies."""
    if psychic is None:
        return ""
    name = (getattr(psychic, "username", None) or "").strip()
    if not name:
        return ""
    lines = ["READER IDENTITY (you are this reader):", f"Name: {name}"]
    specialisms = []
    for link in getattr(psychic, "categories", None) or []:
        title = getattr(getattr(link, "category", None), "title", None)
        if title and str(title).strip():
            specialisms.append(str(title).strip())
    if specialisms:
        lines.append("Specialisms: " + ", ".join(specialisms))
    bio = " ".join((getattr(psychic, "bio", None) or "").split())
    if bio:
        lines.append("Bio: " + bio)
    return "\n".join(lines)


# ═════════════════════════════════════════════════════════════════════════════
# Clocks
# ═════════════════════════════════════════════════════════════════════════════
def _naive(value: Optional[datetime]) -> datetime:
    """The engine's transcript clock is naive local time (see reading_session)."""
    if value is None:
        return datetime.now()
    if value.tzinfo is None:
        return value
    return value.astimezone().replace(tzinfo=None)


def _aware(value: Optional[datetime]) -> Optional[datetime]:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _ms_between(start: Optional[datetime], end: Optional[datetime]) -> Optional[int]:
    if start is None or end is None:
        return None
    return max(0, int((_aware(end) - _aware(start)).total_seconds() * 1000))
