"""Delivery execution engine — plays a produced DeliveryPlan out in the live chat
in real time.

Consumes what the backend core produces (state.delivery_queue + state.queue_position);
it does NOT change the orchestrator or contracts. For each queue item it shows a
typing indicator, waits a human duration, sends the message through the existing
connect-as-psychic path (tagged author_type=ai_drafted), then applies the item's
pacing gap before the next one. ``wait_for_response`` stops the queue until the
client's next message (which flows back through process_client_message normally).

The core loop (``execute_delivery``) takes injected send/typing/sleep callables so
it is tested with a fake clock and a recording send — never real timing.
"""

import asyncio
import random
from dataclasses import dataclass
from typing import Awaitable, Callable, Dict, Optional

from app.logging_config import get_logger

logger = get_logger(__name__)


# ── pacing configuration (env-driven; injectable in tests) ───────────────────
@dataclass
class PacingConfig:
    typing_ms_per_char: int = 35
    typing_min_ms: int = 1500
    typing_max_ms: int = 12000
    send_now_gap_ms: int = 400
    pause_short_min_ms: int = 2000
    pause_short_max_ms: int = 5000
    pause_long_min_ms: int = 6000
    pause_long_max_ms: int = 15000


def pacing_config_from_settings() -> PacingConfig:
    from app.config import get_app_settings

    s = get_app_settings()
    return PacingConfig(
        typing_ms_per_char=s.READING_TYPING_MS_PER_CHAR,
        typing_min_ms=s.READING_TYPING_MIN_MS,
        typing_max_ms=s.READING_TYPING_MAX_MS,
        send_now_gap_ms=s.READING_SEND_NOW_GAP_MS,
        pause_short_min_ms=s.READING_PAUSE_SHORT_MIN_MS,
        pause_short_max_ms=s.READING_PAUSE_SHORT_MAX_MS,
        pause_long_min_ms=s.READING_PAUSE_LONG_MIN_MS,
        pause_long_max_ms=s.READING_PAUSE_LONG_MAX_MS,
    )


def _clamp(v: float, lo: int, hi: int) -> int:
    return int(max(lo, min(hi, v)))


def compute_typing_duration(
    message: str,
    explicit_ms: Optional[int] = None,
    *,
    rng: Callable[[float, float], float] = random.uniform,
    config: Optional[PacingConfig] = None,
) -> int:
    """How long to show the typing indicator before a message. Uses Sabri's
    explicit value if given, else ~ms/char with ±20-30% variance. Always clamped
    to [typing_min, typing_max] so a long line never produces an absurd wait."""
    config = config or PacingConfig()
    if explicit_ms is not None:
        return _clamp(explicit_ms, config.typing_min_ms, config.typing_max_ms)
    base = len(message or "") * config.typing_ms_per_char
    duration = base + rng(-0.2, 0.3) * base
    return _clamp(duration, config.typing_min_ms, config.typing_max_ms)


def gap_after(
    pacing: str,
    *,
    rng: Callable[[float, float], float] = random.uniform,
    config: Optional[PacingConfig] = None,
) -> int:
    """Gap (ms) to wait after sending an item, by its pacing flag.
    wait_for_response is handled by the caller (it stops the queue)."""
    config = config or PacingConfig()
    if pacing == "pause_short":
        return int(rng(config.pause_short_min_ms, config.pause_short_max_ms))
    if pacing == "pause_long":
        return int(rng(config.pause_long_min_ms, config.pause_long_max_ms))
    # send_now (and any unexpected flag) → a single minimal gap.
    return config.send_now_gap_ms


# ── the core loop (pure; injected deps) ──────────────────────────────────────
COMPLETED = "completed"
WAITING = "waiting_for_response"


async def execute_delivery(
    state,
    *,
    send_fn: Callable[[object], Awaitable[None]],
    typing_fn: Callable[[bool], Awaitable[None]],
    sleep_fn: Callable[[float], Awaitable[None]],
    rng: Callable[[float, float], float] = random.uniform,
    config: Optional[PacingConfig] = None,
) -> str:
    """Play state.delivery_queue from state.queue_position. Returns COMPLETED or
    WAITING. Advances state.queue_position AFTER each successful send, so a
    cancel/disconnect leaves the position at the next un-sent item — safe to
    re-enter (resume) from the same state.

    send_fn(item)  -> deliver the message (persist + broadcast) and record it.
    typing_fn(bool)-> emit typing_start (True) / typing_stop (False).
    sleep_fn(secs) -> await a real or fake delay.
    """
    config = config or pacing_config_from_settings()
    queue = state.delivery_queue

    while state.queue_position < len(queue):
        item = queue[state.queue_position]
        duration_ms = compute_typing_duration(
            item.message, item.typing_duration_ms, rng=rng, config=config
        )
        await typing_fn(True)
        try:
            await sleep_fn(duration_ms / 1000)
            await send_fn(item)
        finally:
            await typing_fn(False)
        # Sent successfully → advance so resume continues past this item.
        state.queue_position += 1

        if item.pacing == "wait_for_response":
            # Park at the barrier: only a new client message may cross it, not a
            # bare reconnect (resume_delivery checks this flag).
            state.waiting_for_response = True
            return WAITING

        gap_ms = gap_after(item.pacing, rng=rng, config=config)
        if gap_ms > 0:
            await sleep_fn(gap_ms / 1000)

    return COMPLETED


# ── live task lifecycle (per chat) ───────────────────────────────────────────
_delivery_tasks: Dict[int, asyncio.Task] = {}


class _DeliveryAborted(Exception):
    """Raised to stop delivery cleanly (not an error) when the chat is no longer
    deliverable — e.g. it ended while the plan was in flight."""


def _chat_is_deliverable(chat) -> bool:
    """A reading line may only be sent while the chat is actually ACTIVE. Never
    deliver into an ended/archived/blocked chat (post-end-cancellation safety)."""
    from app.enums.chat_status import ChatStatus

    return chat is not None and chat.status == ChatStatus.ACTIVE


async def broadcast_typing(chat_id: int, is_typing: bool, sender_id) -> None:
    """Emit a server→client typing_start/typing_stop over the chat room. Used by
    the executor between messages AND by the pipeline the instant a client message
    arrives (so the reader is 'typing' before Sabri/Valentina are even called)."""
    from app.manager import manager

    try:
        await manager.send_to_chat(
            {
                "event": "typing_start" if is_typing else "typing_stop",
                "chat_id": chat_id,
                "sender_id": sender_id,
            },
            str(chat_id),
        )
    except Exception:  # noqa: BLE001 — a typing-indicator hiccup never breaks anything
        pass


async def _run_delivery(chat_id: int, state, config: Optional[PacingConfig]) -> None:
    """Build live deps and play the plan; clean up the task registry when done."""
    from app.database.client import SessionLocal
    from app.models.chat import Chat as _Chat
    from app.services.ai.reading_session import record_sent_message
    from app.services.chats import broadcast_ai_message

    with SessionLocal() as _db:
        chat0 = _db.query(_Chat).filter(_Chat.id == chat_id).first()
        psychic_id = chat0.psychic_id if chat0 else None

    async def typing_fn(is_typing: bool) -> None:
        await broadcast_typing(chat_id, is_typing, psychic_id)

    async def send_fn(item) -> None:
        with SessionLocal() as db:
            chat = db.query(_Chat).filter(_Chat.id == chat_id).first()
            if not _chat_is_deliverable(chat):
                # The chat ended (or paused) while this delivery was in flight.
                # Abort WITHOUT advancing position so the item isn't lost — a
                # resume can replay it if the chat becomes active again. An ended
                # chat simply never resumes. This is the hard guarantee that a
                # reading line is never delivered into an already-ended chat.
                status = getattr(chat, "status", None)
                raise _DeliveryAborted(f"chat {chat_id} not deliverable (status={status})")
            await broadcast_ai_message(db, chat, item.message)
        record_sent_message(state, item.message)

    # Pre-flight: don't even start a delivery into a chat that already ended.
    with SessionLocal() as _db2:
        _chat2 = _db2.query(_Chat).filter(_Chat.id == chat_id).first()
        if not _chat_is_deliverable(_chat2):
            logger.info(
                "delivery_skipped_chat_not_active",
                chat_id=chat_id,
                status=getattr(_chat2, "status", None),
            )
            if _delivery_tasks.get(chat_id) is asyncio.current_task():
                _delivery_tasks.pop(chat_id, None)
            return

    try:
        result = await execute_delivery(
            state,
            send_fn=send_fn,
            typing_fn=typing_fn,
            sleep_fn=asyncio.sleep,
            config=config,
        )
        logger.info(
            "delivery_finished", chat_id=chat_id, result=result, position=state.queue_position
        )
    except asyncio.CancelledError:
        logger.info("delivery_cancelled", chat_id=chat_id, position=state.queue_position)
        raise
    except _DeliveryAborted as e:
        # Clean stop (chat no longer deliverable) — not an error.
        logger.info("delivery_aborted", chat_id=chat_id, reason=str(e))
    except Exception as e:  # noqa: BLE001
        logger.error("delivery_error", chat_id=chat_id, error=str(e), exc_info=True)
    finally:
        if _delivery_tasks.get(chat_id) is asyncio.current_task():
            _delivery_tasks.pop(chat_id, None)


def start_delivery(chat_id: int, state, *, config: Optional[PacingConfig] = None) -> Optional[asyncio.Task]:
    """Launch delivery of the session's current queue as a background task.
    Caller must cancel_delivery() first if re-planning; if a task is already live
    this is a no-op (returns the existing task)."""
    existing = _delivery_tasks.get(chat_id)
    if existing and not existing.done():
        logger.warning("delivery_already_running", chat_id=chat_id)
        return existing
    try:
        task = asyncio.create_task(_run_delivery(chat_id, state, config))
    except RuntimeError:
        logger.warning("delivery_no_event_loop", chat_id=chat_id)
        return None
    _delivery_tasks[chat_id] = task
    return task


async def cancel_delivery(chat_id: int) -> None:
    """Stop any in-flight delivery for this chat and wait for it to unwind. The
    session state (queue_position, buffer) is left intact for resume."""
    task = _delivery_tasks.pop(chat_id, None)
    if task and not task.done():
        task.cancel()
        try:
            await task
        except (asyncio.CancelledError, Exception):  # noqa: BLE001
            pass


async def resume_delivery(
    chat_id: int, *, config: Optional[PacingConfig] = None
) -> Optional[asyncio.Task]:
    """Resume an unfinished delivery after a reconnect — replays the remaining
    queue from the saved position. No-op if disabled, no session, nothing left,
    parked at a wait_for_response barrier, or a delivery is already running.

    Acquires the same per-chat lock the pipeline uses, so a reconnect can never
    launch a delivery in the middle of a re-plan."""
    from app.config import get_app_settings

    if not get_app_settings().AI_DRAFTING_ENABLED:
        return None
    from app.services.ai.reading_pipeline import _session_lock
    from app.services.ai.reading_session import get_session_store

    async with _session_lock(f"chat:{chat_id}"):
        state = get_session_store().get(f"chat:{chat_id}")
        if state is None or state.queue_position >= len(state.delivery_queue):
            return None
        if state.waiting_for_response:
            return None  # only a new client message crosses the barrier, not a reconnect
        existing = _delivery_tasks.get(chat_id)
        if existing and not existing.done():
            return existing
        logger.info("delivery_resume", chat_id=chat_id, position=state.queue_position)
        return start_delivery(chat_id, state, config=config)


# ═════════════════════════════════════════════════════════════════════════════
# Single-agent Reader streaming delivery (Phase 4). Used when READING_ENGINE=
# single_agent. Bubbles are sent AS THE MODEL WRITES THEM — the real gap between
# them is the generation time, with only a light READER_MIN_TYPING_MS floor. No
# artificial pause_short/pause_long. Reuses the send-guard + _delivery_tasks
# lifecycle so cancellation / disconnect / post-end handling covers it too. The
# two-agent pacing (compute_typing_duration/gap_after/execute_delivery) stays until
# cutover, since the A/B needs both engines.
# ═════════════════════════════════════════════════════════════════════════════
async def execute_reader_stream(event_aiter, *, send_bubble, typing_fn, sleep_fn,
                                min_typing_sec, clock):
    """Play one Reader turn from an async iterator of ("bubble", text) / ("hold",
    (trigger, line)) events. Typing indicator on throughout; each bubble is sent at
    least ``min_typing_sec`` after the previous (the light floor). Pure over its
    injected deps — unit-tested with fakes. Returns (sent_bubbles, holds)."""
    sent, holds = [], []
    await typing_fn(True)
    try:
        last = None
        async for kind, payload in event_aiter:
            if kind == "hold":
                holds.append(payload)
                continue
            if last is not None:
                gap = min_typing_sec - (clock() - last)
                if gap > 0:
                    await sleep_fn(gap)
            await send_bubble(payload)
            sent.append(payload)
            last = clock()
    finally:
        await typing_fn(False)
    return sent, holds


async def _reader_events_async(gen_factory):
    """Bridge a BLOCKING event generator (stream_reader_bubbles over the live SDK
    stream) into an async iterator: run it in a worker thread, push events onto an
    asyncio.Queue so the async delivery loop can send between them."""
    loop = asyncio.get_running_loop()
    q: asyncio.Queue = asyncio.Queue()
    _DONE = object()

    def producer():
        try:
            for ev in gen_factory():
                loop.call_soon_threadsafe(q.put_nowait, ("ev", ev))
        except Exception as e:  # noqa: BLE001 — surfaced to the consumer below
            loop.call_soon_threadsafe(q.put_nowait, ("err", e))
        finally:
            loop.call_soon_threadsafe(q.put_nowait, ("done", _DONE))

    task = asyncio.create_task(asyncio.to_thread(producer))
    try:
        while True:
            tag, val = await q.get()
            if tag == "done":
                break
            if tag == "err":
                raise val
            yield val
    finally:
        await task


def _merge_reader_holds(state, sent_bubbles, new_holds, *, cap: int = 10) -> None:
    """Update the held-back buffer after a Reader turn: keep prior holds NOT deployed
    this turn (their text isn't in a sent bubble), add the turn's new @@HOLD@@ holds,
    dedupe by text, cap. The buffer is handed back to the Reader next turn."""
    from app.services.ai.reading_contracts import HeldItem

    delivered = "\n".join(sent_bubbles).lower()
    merged, seen = [], set()
    for h in state.held_back_buffer:
        key = (h.text or "").strip().lower()
        if key and key not in seen and key not in delivered:  # drop deployed / dupes
            merged.append(h)
            seen.add(key)
    for trigger, line in new_holds:
        key = (line or "").strip().lower()
        if key and key not in seen:
            merged.append(HeldItem(text=line, hold_trigger=trigger))
            seen.add(key)
    state.held_back_buffer = merged[-cap:]


async def _run_reader_delivery(chat_id: int, state, reader_input: str) -> None:
    """Live single-agent delivery: stream the Reader, send bubbles with the floor,
    fall back (never silent) if nothing survives, and store the turn's holds."""
    import time as _time

    from app.config import get_app_settings
    from app.database.client import SessionLocal
    from app.models.chat import Chat as _Chat
    from app.services.ai.reading_llm import FALLBACK_MESSAGE
    from app.services.ai.reading_reader import stream_reader, stream_reader_bubbles
    from app.services.ai.reading_session import record_sent_message
    from app.services.chats import broadcast_ai_message

    s = get_app_settings()
    with SessionLocal() as _db:
        chat0 = _db.query(_Chat).filter(_Chat.id == chat_id).first()
        psychic_id = chat0.psychic_id if chat0 else None

    async def typing_fn(on: bool) -> None:
        await broadcast_typing(chat_id, on, psychic_id)

    async def send_bubble(text: str) -> None:
        with SessionLocal() as db:
            chat = db.query(_Chat).filter(_Chat.id == chat_id).first()
            if not _chat_is_deliverable(chat):
                raise _DeliveryAborted(f"chat {chat_id} not deliverable (status={getattr(chat,'status',None)})")
            await broadcast_ai_message(db, chat, text)
        record_sent_message(state, text)

    with SessionLocal() as _db2:
        if not _chat_is_deliverable(_db2.query(_Chat).filter(_Chat.id == chat_id).first()):
            logger.info("reader_delivery_skipped_chat_not_active", chat_id=chat_id)
            if _delivery_tasks.get(chat_id) is asyncio.current_task():
                _delivery_tasks.pop(chat_id, None)
            return

    def gen_factory():
        return stream_reader_bubbles(stream_reader(reader_input))

    try:
        sent, holds = await execute_reader_stream(
            _reader_events_async(gen_factory),
            send_bubble=send_bubble,
            typing_fn=typing_fn,
            sleep_fn=asyncio.sleep,
            min_typing_sec=s.READER_MIN_TYPING_MS / 1000.0,
            clock=_time.monotonic,
        )
        if not sent:  # every bubble filtered/empty → never leave silence
            logger.warning("reader_delivery_empty_fallback", chat_id=chat_id)
            try:
                await send_bubble(FALLBACK_MESSAGE)
            except _DeliveryAborted:
                pass
        else:
            logger.info("reader_delivery_finished", chat_id=chat_id, bubbles=len(sent), holds=len(holds))
        _merge_reader_holds(state, sent, holds)
    except asyncio.CancelledError:
        logger.info("reader_delivery_cancelled", chat_id=chat_id)
        raise
    except _DeliveryAborted as e:
        logger.info("reader_delivery_aborted", chat_id=chat_id, reason=str(e))
    except Exception as e:  # noqa: BLE001 — a delivery error must never crash the chat
        logger.error("reader_delivery_error", chat_id=chat_id, error=str(e), exc_info=True)
    finally:
        if _delivery_tasks.get(chat_id) is asyncio.current_task():
            _delivery_tasks.pop(chat_id, None)


def start_reader_delivery(chat_id: int, state, reader_input: str) -> Optional[asyncio.Task]:
    """Launch the streaming Reader delivery as a background task (mirrors start_delivery;
    shares _delivery_tasks so cancel_delivery / disconnect / post-end cancellation apply)."""
    existing = _delivery_tasks.get(chat_id)
    if existing and not existing.done():
        logger.warning("reader_delivery_already_running", chat_id=chat_id)
        return existing
    try:
        task = asyncio.create_task(_run_reader_delivery(chat_id, state, reader_input))
    except RuntimeError:
        logger.warning("reader_delivery_no_event_loop", chat_id=chat_id)
        return None
    _delivery_tasks[chat_id] = task
    return task
