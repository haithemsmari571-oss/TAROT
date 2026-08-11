"""Two-role coordinator (READING_ENGINE=two_role): Valentina writes / Sabri delivers.

Per client message:
  * ROUTE (cheap): NEW (a real question / new direction / opening) vs CONTINUE (a reaction /
    small follow-up). Reuses the single-agent continue-vs-redirect classifier (heuristic first,
    a Haiku tie-break only for the genuinely ambiguous) — redirect→NEW, continuer→CONTINUE. It
    NEVER reviews or corrects Valentina; it only picks whether fresh content is needed.
  * GENERATE (invisible): NEW → Valentina writes ONE complete reading (Opus 4.6 + gated thinking)
    → Sabri delivers it (curate + hold + voice-preserving-facts + chunk). CONTINUE → Sabri works
    from the held reserve (or gives a short glue reply). So a NEW turn is TWO real model calls
    (Valentina + Sabri); a CONTINUE turn is ONE (Sabri). Nothing reaches the client here.
  * REVEAL: Sabri's chunked messages play out at proportional typing speed (no cap). The typing
    indicator is ON from the instant the message arrives, held through generation, seamlessly
    into the reveal — never dead silence.
  * RESERVE: Sabri's held content persists in state.reserve — replaced on a NEW turn, shrunk as
    he releases from it on CONTINUE turns.

A message that arrives mid-reveal is classified the same way as the single-agent engine: a
CONTINUER is ignored (the current reveal finishes), a REDIRECT is queued to run as the next turn
(no interleaving). Guardrails carried over: deterministic numerology injection (Valentina),
return-ack strip + deterministic fact-preservation check (Sabri's output), emoji ban (Sabri
voice), plain-text I/O (no JSON), and NO correction/redo loop between the two roles.
"""

import asyncio
from datetime import datetime
from typing import Dict, Tuple

from app.logging_config import get_logger
from app.services.ai.reading_reveal import (  # continue/redirect classifier + Atlas cache (reused)
    _atlas_memory_for_session,
    resolve_classification,
)

logger = get_logger(__name__)

# ── per-chat coordination state (mirrors reading_reveal) ──────────────────────
_locks: Dict[int, asyncio.Lock] = {}
_active: Dict[int, bool] = {}
_pending: Dict[int, Tuple[str, dict]] = {}
_turn_tasks: Dict[int, asyncio.Task] = {}


def _lock(chat_id: int) -> asyncio.Lock:
    lock = _locks.get(chat_id)
    if lock is None:
        lock = asyncio.Lock()
        _locks[chat_id] = lock
    return lock


# ═════════════════════════════════════════════════════════════════════════════
# Route + generate (invisible) — injectable seams for tests.
# ═════════════════════════════════════════════════════════════════════════════
async def _resolve_route(message: str) -> str:
    """"new" (fresh Valentina content needed) or "continue" (work from reserve / short reply).
    redirect→new, continuer→continue, via the reused heuristic+Haiku classifier."""
    kind = await resolve_classification(message)
    return "new" if kind == "redirect" else "continue"


def _transcript_excluding(state, trigger_entry):
    return [e for e in state.chat_transcript if e is not trigger_entry]


async def _write_valentina_turn(chat_id, message, trigger_entry, state, user_id) -> str:
    """NEW turn, step 1: load dossier + DOB, build Valentina's input (with injected numerology),
    run her (Opus 4.6 + gated thinking) to a COMPLETE prose reading. Returns her raw text."""
    from app.database.client import SessionLocal
    from app.services.ai import reading_assistant, reading_valentina
    from app.services.ai.reading_session import compute_metadata
    from app.services.client_dossier import get_client_dob

    def _load_file_and_dob():
        with SessionLocal() as db:
            # Steering notes are retrieved through reading_steering, which
            # re-checks the chat's LIVE response mode and returns [] for
            # anything but HYBRID — Automatic turns get zero note influence
            # even when notes exist from earlier in the session.
            from app.services.ai import reading_steering

            return (
                reading_assistant.build_client_file(db, user_id),
                get_client_dob(db, user_id),
                reading_steering.get_active_notes(db, chat_id),
            )

    client_file, dob, steering_notes = await asyncio.to_thread(_load_file_and_dob)
    state.client_file = client_file
    atlas_memory_text = await _atlas_memory_for_session(state, user_id)
    now = datetime.now()
    valentina_input = reading_valentina.build_valentina_input(
        client_message=message,
        chat_transcript=_transcript_excluding(state, trigger_entry),
        client_file=client_file,
        session_metadata=compute_metadata(state, now),
        date_of_birth=dob,
        current_year=now.year,
        steering_notes=steering_notes,
        commitment_ledger=state.commitment_ledger,
    )
    if atlas_memory_text:
        valentina_input = (
            "ATLAS CLIENT MEMORY (load silently, never cite):\n"
            + atlas_memory_text
            + "\n\n"
            + valentina_input
        )
    text = await asyncio.to_thread(
        reading_valentina.write_valentina, valentina_input, client_message=message
    )
    logger.info("duo_valentina_written", chat_id=chat_id, chars=len(text))
    try:
        from app.services.ai.reading_draft_log import get_draft_log

        get_draft_log().log(
            chat_id=chat_id, turn_number=state.messages_sent_count, engine="two_role",
            stage="valentina_draft", raw_content=text, is_delivered=False,
        )
    except Exception:  # noqa: BLE001 — audit logging must never affect a turn
        pass
    return text


async def _sabri_turn(chat_id, message, trigger_entry, state, source_content, is_new):
    """Sabri delivers: build his input (fresh reading OR held reserve + the conversation) and run
    him → (bubbles, reserve). His output is return-ack-stripped and fact-checked in sabri_deliver."""
    from app.config import get_app_settings
    from app.services.ai import reading_sabri

    s = get_app_settings()
    sabri_input = reading_sabri.build_sabri_input(
        client_message=message,
        chat_transcript=_transcript_excluding(state, trigger_entry),
        source_content=source_content,
        is_new=is_new,
        turn_target=s.SABRI_TURN_TARGET_MESSAGES,
    )
    bubbles, reserve = await asyncio.to_thread(
        reading_sabri.sabri_deliver, sabri_input, source_content=source_content,
        chat_id=chat_id, turn_number=state.messages_sent_count,
    )
    logger.info("duo_sabri_delivered", chat_id=chat_id, bubbles=len(bubbles),
                reserve_chars=len(reserve), is_new=is_new)
    return bubbles, reserve


async def _duo_generate(chat_id, message, trigger_entry, state, user_id, forced_route=None):
    """Route → (Valentina if NEW) → Sabri. Returns (bubbles, reserve, route). Nothing reaches the
    client here. bubbles is the paced-reveal payload (ALWAYS non-empty — Sabri guarantees a
    fallback line, and a failed Valentina write yields one too, so the client never sees dead
    silence); reserve is what Sabri is still holding. ``forced_route`` overrides the classifier
    for a dequeued redirect (already classified NEW when queued — never re-classify and risk a
    non-deterministic flip to CONTINUE that would answer a new topic from stale reserve)."""
    from app.services.ai.reading_llm import FALLBACK_MESSAGE

    route = forced_route or await _resolve_route(message)
    if route == "new":
        valentina_text = await _write_valentina_turn(chat_id, message, trigger_entry, state, user_id)
        if not valentina_text.strip():
            # Valentina failed — deliver a fallback line and KEEP any prior reserve (don't wipe).
            logger.warning("duo_valentina_empty_fallback", chat_id=chat_id)
            return [FALLBACK_MESSAGE], state.reserve or "", route
        bubbles, reserve = await _sabri_turn(
            chat_id, message, trigger_entry, state, valentina_text, is_new=True
        )
    else:  # continue — no fresh Valentina; Sabri works from the held reserve (may be empty)
        bubbles, reserve = await _sabri_turn(
            chat_id, message, trigger_entry, state, state.reserve or "", is_new=False
        )
    logger.info("duo_generated", chat_id=chat_id, route=route, bubbles=len(bubbles))
    return bubbles, reserve, route


async def _reveal_turn_duo(chat_id, bubbles, psychic_id, state):
    """Play the proportional paced reveal of Sabri's chunked messages; record each on the
    transcript. Returns the sent messages."""
    from app.database.client import SessionLocal
    from app.models.chat import Chat as _Chat
    from app.services.ai import reading_executor
    from app.services.ai.reading_session import record_sent_message
    from app.services.chats import broadcast_ai_message

    async def typing_fn(on: bool) -> None:
        await reading_executor.broadcast_typing(chat_id, on, psychic_id)

    from app.services.ai.reading_ledger import record_commitments

    async def send_bubble(text: str) -> None:
        with SessionLocal() as db:
            chat = db.query(_Chat).filter(_Chat.id == chat_id).first()
            if not reading_executor._chat_is_deliverable(chat):
                raise reading_executor._DeliveryAborted(
                    f"chat {chat_id} not deliverable (status={getattr(chat, 'status', None)})"
                )
            await broadcast_ai_message(db, chat, text)
        record_sent_message(state, text)
        # Ledger advances ONLY on delivery, per bubble (not after the full
        # reveal): a reveal cancelled mid-way has still DELIVERED its earlier
        # bubbles, and their cards/timing must be remembered.
        record_commitments(state, text)

    sent = await reading_executor.play_reveal_proportional(
        bubbles, send_bubble=send_bubble, typing_fn=typing_fn, sleep_fn=asyncio.sleep,
        config=reading_executor.proportional_reveal_config_from_settings(),
    )
    logger.info("duo_reveal_finished", chat_id=chat_id, bubbles=len(sent))
    return sent


async def _chat_active(chat_id) -> bool:
    from app.database.client import SessionLocal
    from app.models.chat import Chat as _Chat
    from app.services.ai import reading_executor

    def _check():
        with SessionLocal() as db:
            return reading_executor._chat_is_deliverable(
                db.query(_Chat).filter(_Chat.id == chat_id).first()
            )

    return await asyncio.to_thread(_check)


# ═════════════════════════════════════════════════════════════════════════════
# Coordinator: entry + turn loop + cancellation (mirrors reading_reveal).
# ═════════════════════════════════════════════════════════════════════════════
def _reading_pause_s() -> float:
    """Seconds to hold the typing indicator HIDDEN when a message first arrives — a brief
    'reading the message' beat before the dots turn on. Reads DUO_READING_PAUSE_MS; monkeypatched
    to 0 in tests so the turn loop never really sleeps."""
    from app.config import get_app_settings

    return get_app_settings().DUO_READING_PAUSE_MS / 1000.0


def _clear_task(chat_id, task) -> None:
    if _turn_tasks.get(chat_id) is task:
        _turn_tasks.pop(chat_id, None)


def _start_turn_locked(chat_id, message, entry, psychic_id, user_id) -> None:
    """Launch the turn loop for `message`. MUST hold _lock(chat_id)."""
    _active[chat_id] = True
    _pending.pop(chat_id, None)
    task = asyncio.create_task(_turn_loop(chat_id, message, entry, psychic_id, user_id))
    _turn_tasks[chat_id] = task
    task.add_done_callback(lambda t, cid=chat_id: _clear_task(cid, t))
    logger.info("duo_turn_started", chat_id=chat_id)


async def handle_client_message(chat_id, client_message, *, psychic_id=None, user_id=None) -> None:
    """Two-role entry for one client message. Idle chat → start a turn (route → generate →
    reveal). Turn already running → classify: a continuer is ignored; a redirect is queued to
    run after the current reveal. Returns fast — the turn plays out in a background task."""
    from app.services.ai.reading_session import (
        create_session_state, get_session_store, record_client_message,
    )

    store = get_session_store()
    session_id = f"chat:{chat_id}"
    lock = _lock(chat_id)

    async with lock:
        state = store.get(session_id)
        if state is None:
            state = create_session_state(
                session_id, client_id=user_id, chat_id=chat_id, is_first_session=True,
            )
            store.put(state)
        record_client_message(state, client_message)
        entry = state.chat_transcript[-1]
        state.waiting_for_response = False
        store.put(state)

        if not _active.get(chat_id):
            _start_turn_locked(chat_id, client_message, entry, psychic_id, user_id)
            return

    # A reveal (or its generation) is in progress — classify without blocking it.
    kind = await resolve_classification(client_message)
    async with lock:
        if kind == "redirect":
            if _active.get(chat_id):
                _pending[chat_id] = (client_message, entry)   # latest redirect wins
                logger.info("duo_redirect_queued", chat_id=chat_id)
            else:
                _start_turn_locked(chat_id, client_message, entry, psychic_id, user_id)
        else:
            logger.info("duo_continuer_ignored", chat_id=chat_id)


async def _turn_loop(chat_id, message, trigger_entry, psychic_id, user_id) -> None:
    """Drive one or more turns: typing ON → generate INVISIBLY (dots held the whole time) →
    proportional reveal (dots stay on into message 1) → persist reserve → run a queued redirect
    if any, else go idle. One reveal plays fully before the next, so messages never interleave."""
    from app.services.ai import reading_executor
    from app.services.ai.reading_executor import _DeliveryAborted
    from app.services.ai.reading_session import get_session_store

    store = get_session_store()
    state = store.get(f"chat:{chat_id}")
    forced_route = None                        # first (idle-start) message: classify fresh
    try:
        while message is not None:
            # A brief "reading the message" beat FIRST: the typing indicator is HIDDEN for a short
            # pause, the way a real person reads a message before they start typing. THEN the dots
            # turn on and stay on continuously through the (invisible) generation and into the
            # reveal — no dead silence during the actual thinking/typing, just this one reading gap.
            await reading_executor.broadcast_typing(chat_id, False, psychic_id)
            await asyncio.sleep(_reading_pause_s())
            await reading_executor.broadcast_typing(chat_id, True, psychic_id)
            if not await _chat_active(chat_id):
                logger.info("duo_skipped_chat_not_active", chat_id=chat_id)
                break
            bubbles, reserve, route = await _duo_generate(
                chat_id, message, trigger_entry, state, user_id, forced_route
            )
            await _reveal_turn_duo(chat_id, bubbles, psychic_id, state)  # dots stay on into msg 1
            # Reserve persistence: on NEW, replace (fresh content — even empty is a legit full
            # delivery). On CONTINUE, shrink to what Sabri re-held; but if he released nothing
            # (a glue reply / fallback with no @@RESERVE@@), KEEP the prior reserve rather than
            # letting an un-echoed turn silently wipe all the banked content.
            # TODO(phase-3 follow-up, deliberately NOT fixed here): the NEW-route replace
            # also DISCARDS any prior undelivered reserve — Valentina content the client
            # never saw vanishes silently. Known issue, separate task; do not widen this
            # round's blast radius.
            if route == "new" or reserve.strip():
                state.reserve = reserve
            store.put(state)
            async with _lock(chat_id):
                nxt = _pending.pop(chat_id, None)
                if nxt is None:
                    _active[chat_id] = False
                    message, trigger_entry = None, None
                else:
                    message, trigger_entry = nxt
                    forced_route = "new"       # queued messages are always redirects → NEW
                    logger.info("duo_redirect_dequeued", chat_id=chat_id)
    except asyncio.CancelledError:
        logger.info("duo_turn_cancelled", chat_id=chat_id)
        raise
    except _DeliveryAborted as e:
        logger.info("duo_turn_aborted", chat_id=chat_id, reason=str(e))
    except Exception as e:  # noqa: BLE001 — a delivery error must never crash the chat
        logger.error("duo_turn_error", chat_id=chat_id, error=str(e), exc_info=True)
    finally:
        _active[chat_id] = False
        _pending.pop(chat_id, None)
        try:
            await reading_executor.broadcast_typing(chat_id, False, psychic_id)
        except Exception:  # noqa: BLE001
            pass


async def cancel_reveal(chat_id) -> None:
    """Cancel an in-flight two-role turn (session end / disconnect) and clear per-chat state.
    Safe when nothing is running."""
    task = _turn_tasks.pop(chat_id, None)
    _active[chat_id] = False
    _pending.pop(chat_id, None)
    if task and not task.done():
        task.cancel()
        try:
            await task
        except (asyncio.CancelledError, Exception):  # noqa: BLE001
            pass
