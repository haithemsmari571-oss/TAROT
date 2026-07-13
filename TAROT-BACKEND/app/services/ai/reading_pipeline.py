"""Reading pipeline orchestrator — runs the Sabri↔Valentina loop and produces a
delivery plan.

``process_client_message`` is pure and synchronous with injectable sabri/valentina
call functions, so it is unit-tested with stubbed models. The async entry wires
the real agents, session state and client-file load around it.

Scope note: this phase PRODUCES and stores the delivery plan (queue + held-back
buffer). Delivering it to the client with typing simulation and human pacing is
the next (real-time execution) phase.
"""

import asyncio
from datetime import datetime
from typing import Callable, Dict, Optional

from app.config import get_app_settings
from app.enums.chat_status import ChatStatus
from app.enums.response_mode import ResponseMode
from app.logging_config import get_logger
from app.models.chat import Chat
from app.services.ai import reading_session
from app.services.ai.reading_contracts import (
    DeliveryItem,
    DeliveryPlan,
    ValentinaRequest,
)
from app.services.ai.reading_llm import (
    FALLBACK_MESSAGE,
    LLMCallError,
    OPENING_HOLD_MESSAGE,
)
from app.services.ai.reading_session import compute_metadata, record_client_message

logger = get_logger(__name__)

# Serialize pipeline runs per session so overlapping client messages for the same
# chat mutate the shared session state one at a time (in arrival order).
_session_locks: Dict[str, asyncio.Lock] = {}

# The in-flight pipeline task per chat (Sabri/Valentina generation). Tracked so a
# session end can cancel it before it produces a plan / starts a delivery.
_pipeline_tasks: Dict[int, asyncio.Task] = {}


def _session_lock(session_id: str) -> asyncio.Lock:
    lock = _session_locks.get(session_id)
    if lock is None:
        lock = asyncio.Lock()
        _session_locks[session_id] = lock
    return lock


async def cancel_pipeline(chat_id: int) -> None:
    """Cancel an in-flight reading pipeline (Sabri/Valentina generation) for a
    chat — e.g. the moment the session ends — so it never finishes generating or
    starts a delivery into an already-ended chat. Safe to call when nothing runs."""
    task = _pipeline_tasks.pop(chat_id, None)
    if task and not task.done():
        task.cancel()
        try:
            await task
        except (asyncio.CancelledError, Exception):  # noqa: BLE001
            pass


# ── fallbacks (always yield a deliverable plan, never raw model output) ───────
def _fallback_plan(message: str = FALLBACK_MESSAGE) -> DeliveryPlan:
    return DeliveryPlan(
        queue=[DeliveryItem(message=message, pacing="send_now", tier="grounding")]
    )


def _fallback_from_valentina(valentina_output: Optional[str]) -> DeliveryPlan:
    """Last resort when Sabri won't deliver even after the correction cap: build a
    plain, paced delivery from Valentina's raw output (first few non-empty lines)."""
    text = (valentina_output or "").strip()
    if not text:
        return _fallback_plan()
    lines = [ln.strip() for ln in text.splitlines() if ln.strip()]
    items = [DeliveryItem(message=ln, pacing="pause_short", tier="depth") for ln in lines[:8]]
    return DeliveryPlan(queue=items) if items else _fallback_plan()


# ── held-back buffer management ──────────────────────────────────────────────
def _merge_buffer(existing: list, plan: DeliveryPlan) -> list:
    """New buffer = existing items NOT just delivered, plus the plan's new
    hold_back items (deduped by text). Deploying a buffered line (it appears in
    the queue) removes it from the buffer, per spec."""
    delivered = {i.message.strip() for i in plan.queue}
    kept = [h for h in existing if h.text.strip() and h.text.strip() not in delivered]
    seen = {h.text.strip() for h in kept}
    for h in plan.hold_back:
        key = h.text.strip()
        if key and key not in seen:
            kept.append(h)
            seen.add(key)
    return kept


def _apply_delivery_to_state(state, plan: DeliveryPlan) -> None:
    state.held_back_buffer = _merge_buffer(state.held_back_buffer, plan)
    state.delivery_queue = list(plan.queue)
    state.queue_position = 0


# ── the orchestration loop (pure, testable) ──────────────────────────────────
def process_client_message(
    state,
    client_message: str,
    *,
    sabri_call: Callable[[dict], object],
    valentina_call: Callable[[ValentinaRequest], str],
    max_corrections: int = 3,
    micro_max_corrections: int = 2,
    now: Optional[datetime] = None,
    build_sabri_input: Optional[Callable] = None,
) -> DeliveryPlan:
    """Run the Sabri↔Valentina loop and return a delivery plan; update the
    session (records the client message, refreshes buffer + queue).

    sabri_call(input_dict) -> DeliveryPlan | ValentinaRequest
    valentina_call(ValentinaRequest) -> raw reading text

    A full reading regenerates Valentina at most ``max_corrections`` times. A
    micro-read (Sabri's request ``type == "micro_read"`` — a greeting/short reply)
    is capped tighter at ``micro_max_corrections`` generations (default 2 = 1
    original + 1 correction): Sabri's quality gate reliably spins on a two-word
    greeting where there is nothing to correct, and no prompt wording fixes it, so
    this cap is enforced deterministically in code. When a cap is reached, Sabri is
    asked to deliver from the best available output; if it still refuses, an
    app-side fallback guarantees a deliverable plan."""
    from app.services.ai.sabri_check import build_sabri_input as _default_build_input

    build_input = build_sabri_input or _default_build_input
    now = now or datetime.now()
    record_client_message(state, client_message, now)

    corrections = 0
    valentina_output: Optional[str] = None
    decision = None
    is_micro = False  # set once Sabri asks for a micro_read; caps the loop tighter
    try:
        while True:
            # Micro-reads cap at micro_max_corrections, full readings at
            # max_corrections. is_micro becomes known after Sabri's first request.
            cap = micro_max_corrections if is_micro else max_corrections
            sabri_input = build_input(
                client_message=client_message,
                chat_transcript=state.chat_transcript,
                held_back_buffer=state.held_back_buffer,
                client_file=state.client_file,
                valentina_output=valentina_output,
                session_metadata=compute_metadata(state, now),
                force_deliver=(corrections >= cap),
            )
            decision = sabri_call(sabri_input)

            if isinstance(decision, DeliveryPlan):
                break

            # decision is a ValentinaRequest. A micro_read request tightens the cap
            # for the rest of the loop (deterministic — not left to Sabri's gate).
            if getattr(decision, "type", None) == "micro_read":
                is_micro = True
            cap = micro_max_corrections if is_micro else max_corrections
            if corrections >= cap:
                # Cap reached and Sabri still refuses to deliver even when forced →
                # force-deliver the best draft via app fallback.
                decision = _fallback_from_valentina(valentina_output)
                break

            valentina_output = valentina_call(decision)
            corrections += 1
    except LLMCallError as e:
        logger.error("reading_pipeline_llm_failed", error=str(e))
        decision = _fallback_plan()

    # A delivered plan with nothing to send now (e.g. Sabri held everything back)
    # still needs a line for the client — add a fallback while keeping the buffer.
    if isinstance(decision, DeliveryPlan) and not decision.queue:
        fb = _fallback_from_valentina(valentina_output)
        decision = DeliveryPlan(
            queue=fb.queue,
            hold_back=decision.hold_back,
            session_notes=decision.session_notes,
        )

    state.sabri_correction_count += corrections
    _apply_delivery_to_state(state, decision)
    logger.info(
        "delivery_plan_ready",
        session_id=state.session_id,
        queue=len(decision.queue),
        held_back=len(state.held_back_buffer),
        corrections=corrections,
    )
    return decision


# ── live entry (async) ───────────────────────────────────────────────────────
def _reading_format_directive(reading_type: str) -> str:
    """Translate Sabri's request type into an explicit length/format directive for
    Valentina. Sabri's actual vocabulary varies (micro_read / full_read /
    opening_read / correction / …), so normalise loosely rather than by exact enum.
    Without this the type was silently dropped and Valentina always went full."""
    t = (reading_type or "").lower()
    if "micro" in t:
        return (
            "FORMAT: MICRO-READ. Reply with 3-8 short, standalone lines only. "
            "Do NOT produce a full 4-part reading."
        )
    if "correction" in t or "rejection" in t:
        return "This is a CORRECTION pass: regenerate the flagged sections from the new angle."
    return "FORMAT: FULL READING. Use the complete 4-part structure (15-20 insights)."


def _sabri_instructions(req: ValentinaRequest) -> str:
    parts = [_reading_format_directive(req.type), req.instructions, req.correction_notes]
    if req.flags:
        parts.append("Flags: " + ", ".join(req.flags))
    return "\n".join(p for p in parts if p)


async def _send_hold_message_after(chat_id: int, sender_id, delay_sec: float) -> None:
    """After `delay_sec`, if this task hasn't been cancelled (the plan isn't ready
    yet), send a short holding line so the client isn't left in silence while the
    reading generates, then re-show the typing indicator."""
    await asyncio.sleep(delay_sec)  # CancelledError propagates if the plan arrived first
    try:
        from app.database.client import SessionLocal
        from app.services.ai import reading_executor
        from app.services.chats import broadcast_ai_message

        with SessionLocal() as db:
            chat = db.query(Chat).filter(Chat.id == chat_id).first()
            if chat and chat.status == ChatStatus.ACTIVE:
                await broadcast_ai_message(db, chat, OPENING_HOLD_MESSAGE)
                logger.info("hold_message_sent", chat_id=chat_id)
        # The reading is still generating — re-show typing after the holding line.
        await reading_executor.broadcast_typing(chat_id, True, sender_id)
    except Exception as e:  # noqa: BLE001
        logger.warning("hold_message_failed", chat_id=chat_id, error=str(e))


async def run_reading_pipeline(
    chat_id: int, client_message_id: Optional[int], client_message: str
) -> Optional[DeliveryPlan]:
    """Load the chat + client file + session, run the loop off the event loop, and
    store the produced delivery plan on the session. (Timed delivery to the client
    is the next real-time phase.)"""
    settings = get_app_settings()
    if not settings.AI_DRAFTING_ENABLED:
        return None

    from app.services.ai import client as ai_client

    if not ai_client.is_configured():
        logger.info("reading_pipeline_skipped_ai_not_configured", chat_id=chat_id)
        return None

    from app.database.client import SessionLocal
    from app.services.ai import reading_assistant, reading_executor, sabri_check

    db = SessionLocal()
    try:
        chat = db.query(Chat).filter(Chat.id == chat_id).first()
        if not chat or chat.status != ChatStatus.ACTIVE:
            return None
        if chat.response_mode == ResponseMode.HUMAN:
            return None

        session_id = f"chat:{chat_id}"
        # Cancel any in-flight delivery, re-plan, and relaunch atomically under the
        # per-chat lock, so no delivery ever runs against a queue being reset (and
        # overlapping client messages process in arrival order).
        async with _session_lock(session_id):
            await reading_executor.cancel_delivery(chat_id)
            # Immediate feedback: show the reader "typing" the moment we begin (before
            # Sabri/Valentina are called), and fire a holding line if generation runs
            # long. After cancel_delivery so the prior run's typing_stop can't clear it.
            await reading_executor.broadcast_typing(chat_id, True, chat.psychic_id)
            hold_task = asyncio.create_task(
                _send_hold_message_after(
                    chat_id, chat.psychic_id, settings.READING_HOLD_MESSAGE_DELAY_SEC
                )
            )
            try:
                store = reading_session.get_session_store()
                client_file = reading_assistant.build_client_file(db, chat.user_id)
                state = store.get(session_id)
                if state is None:
                    state = reading_session.create_session_state(
                        session_id,
                        client_id=chat.user_id,
                        chat_id=chat_id,
                        client_file=client_file,
                        is_first_session=(client_file is None),
                    )
                    store.put(state)
                else:
                    state.client_file = client_file

                def sabri_call(inp: dict):
                    return sabri_check.call_sabri(inp)

                def valentina_call(req: ValentinaRequest) -> str:
                    return reading_assistant.call_valentina(
                        client_message=client_message,
                        client_file=state.client_file,
                        sabri_instructions=_sabri_instructions(req),
                        chat_transcript=state.chat_transcript,
                    )

                plan = await asyncio.to_thread(
                    process_client_message,
                    state,
                    client_message,
                    sabri_call=sabri_call,
                    valentina_call=valentina_call,
                    max_corrections=settings.SABRI_MAX_ATTEMPTS,
                    micro_max_corrections=settings.SABRI_MICRO_MAX_ATTEMPTS,
                )
            finally:
                hold_task.cancel()  # plan ready (or failed) → stop any pending hold
            # A new plan means the client responded — leave any wait barrier.
            state.waiting_for_response = False
            store.put(state)
            # Generation can take a while; if the session ended in the meantime,
            # don't start a delivery into it — just clear the typing indicator.
            # (The executor also re-checks per message, but this avoids spinning up
            # a delivery task and leaving the typing dots hanging on an ended chat.)
            db.expire_all()
            current_status = db.query(Chat.status).filter(Chat.id == chat_id).scalar()
            if current_status != ChatStatus.ACTIVE:
                logger.info(
                    "reading_pipeline_chat_not_active_skipping_delivery",
                    chat_id=chat_id,
                    status=current_status,
                )
                await reading_executor.broadcast_typing(chat_id, False, None)
                return plan
            # Play the new plan out in real time (the executor takes over the typing
            # indicator from here — typing_start/stop per message).
            reading_executor.start_delivery(chat_id, state)
            logger.info(
                "reading_pipeline_plan_stored", chat_id=chat_id, queue=len(plan.queue)
            )
            return plan
    except Exception as e:  # noqa: BLE001 — a pipeline error must never crash the chat
        logger.error("reading_pipeline_error", chat_id=chat_id, error=str(e), exc_info=True)
        # Clear the typing indicator if we errored before the executor took over.
        try:
            await reading_executor.broadcast_typing(chat_id, False, None)
        except Exception:  # noqa: BLE001
            pass
        return None
    finally:
        db.close()


def maybe_launch_pipeline(
    chat_id: int, client_message_id: Optional[int], client_message: str
) -> None:
    """Fire-and-forget launch from the message handler. Respects the master
    switch and never blocks the client's message flow."""
    if not get_app_settings().AI_DRAFTING_ENABLED:
        return
    try:
        task = asyncio.create_task(
            run_reading_pipeline(chat_id, client_message_id, client_message)
        )
    except RuntimeError:
        logger.warning("reading_pipeline_no_event_loop", chat_id=chat_id)
        return
    # Track it so a session end can cancel in-flight generation. Only clear the
    # slot if it still points at this task (a newer message may have replaced it).
    _pipeline_tasks[chat_id] = task

    def _clear(t: asyncio.Task, cid: int = chat_id) -> None:
        if _pipeline_tasks.get(cid) is t:
            _pipeline_tasks.pop(cid, None)

    task.add_done_callback(_clear)
