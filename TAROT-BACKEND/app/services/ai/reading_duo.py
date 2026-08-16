"""Two-role coordinator (READING_ENGINE=two_role): Valentina writes / Sabri delivers.

Per client message:
  * ROUTE (cheap): NEW (Valentina must write) vs CONTINUE (answer from the held reserve).
    The decision is made against the reserve itself, not against the wording of her message:
    nothing held → NEW; a bare reaction → CONTINUE; anything else → a Haiku call that reads
    the held material and says whether it answers her, defaulting to NEW when it does not
    clearly do so. It NEVER reviews or corrects Valentina; it only picks the source.
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
# Why the last route was chosen, for the log line in _duo_generate. Single-worker
# process, and routing is sequential per turn, so one slot is enough; it exists
# because "route: new" alone could not distinguish a reaction from a router
# verdict from a missing hold, and each has a completely different fix.
_LAST_ROUTE_REASON = {"why": "unknown"}

_RESERVE_ROUTER_SYSTEM = (
    "A psychic has written a reading for this client. Part of it has been said to her "
    "already; the rest is HELD BACK, and you are shown it below. The client has just "
    "replied. Decide where her answer should come from.\n\n"
    "Reply with exactly one word:\n"
    "HELD — the held material already answers her. She is asking for more of what is "
    "there: an explanation, an elaboration, a repeat, or simply the next part of it.\n"
    "FRESH — she has raised a different subject, a new person, a new question, or told "
    "the psychic something new that the held material does not speak to.\n\n"
    "If the held material does not clearly speak to her reply, answer FRESH. "
    "Never comment on the writing. One word."
)


def _ask_reserve_router(message: str, held: str) -> str:
    """Can the held reading answer her? Sync — call in a thread."""
    from app.config import get_app_settings
    from app.services.ai import client as ai_client

    s = get_app_settings()
    result = ai_client.run_chat(
        system=_RESERVE_ROUTER_SYSTEM,
        user_content=f"HELD MATERIAL:\n{held}\n\nHER REPLY:\n{message or ''}",
        model=s.READER_CLASSIFIER_MODEL,
        max_tokens=4,
    )
    out = (result.get("text") or "").strip().lower()
    return "continue" if out.startswith("held") else "new"


async def _resolve_route(message: str, reserve: str = "") -> str:
    """"new" (fresh Valentina content needed) or "continue" (work from the held reserve).

    The old rule asked only "is this a question?", and a question mark alone forced a
    fresh 40-60 second Valentina call. That threw away between 1,500 and 4,600
    characters of reading Sabri was already holding, and made "say more" cost exactly
    as much as a new question — measured live, CONTINUE never routed once.

    The question that actually matters is whether the held material answers her, so
    that is the question now asked. Cheap outs first, in this order: a bare reaction
    never needed Valentina whether or not anything is held (routing "okay" to a fresh
    reading would be far worse than the bug being fixed), and a real question with
    nothing banked can only be answered by writing one. Only a real question with
    material banked is worth a Haiku call to compare the two, and anything short of a
    clear match falls back to a fresh reading.
    """
    kind = await resolve_classification(message)
    if kind == "continuer":
        _LAST_ROUTE_REASON["why"] = "reaction"
        return "continue"                  # a reaction: glue reply, exactly as before
    held = (reserve or "").strip()
    if not held:
        _LAST_ROUTE_REASON["why"] = "nothing held"
        return "new"                       # a real question, nothing banked to answer it
    try:
        verdict = await asyncio.to_thread(_ask_reserve_router, message, held)
        _LAST_ROUTE_REASON["why"] = f"router said {verdict}"
        return verdict
    except Exception as e:  # noqa: BLE001 - never answer from stale reserve by accident
        _LAST_ROUTE_REASON["why"] = "router failed"
        logger.warning("duo_reserve_router_failed", chat_error=str(e))
        return "new"


def _transcript_excluding(state, trigger_entry):
    return [e for e in state.chat_transcript if e is not trigger_entry]


def _session_memory(state, trigger_entry) -> str:
    """The capsule, rendered without the message currently being answered.

    The trigger is passed separately as CLIENT MESSAGE, and having it appear twice made both
    roles treat it as something said twice."""
    import copy

    from app.services.ai import reading_capsule

    view = copy.copy(state)
    view.chat_transcript = _transcript_excluding(state, trigger_entry)
    return reading_capsule.format_capsule(view)


def accumulate_reserve(previous: str, new_writing: str) -> str:
    """Add this turn's writing to everything Valentina has written and not yet had delivered.

    It used to be an assignment, not an addition, so every fresh reading threw away whatever
    was still unsaid from the last one — around ninety percent of every reading, generated,
    paid for and deleted. Oldest first so Sabri reads the session in the order she wrote it.
    Nothing is ever removed by sending: he does not repeat himself because the capsule shows
    him exactly what the client has already read."""
    return "\n\n".join(
        part for part in ((previous or "").strip(), (new_writing or "").strip()) if part
    )


async def _write_valentina_turn(
    chat_id, message, trigger_entry, state, user_id, psychic_id=None
) -> str:
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
    atlas_memory_text = (
        await _atlas_memory_for_session(state, user_id, psychic_id)
        if psychic_id is not None
        else await _atlas_memory_for_session(state, user_id)
    )
    now = datetime.now()
    valentina_input = reading_valentina.build_valentina_input(
        client_message=message,
        session_memory=_session_memory(state, trigger_entry),
        client_file=client_file,
        session_metadata=compute_metadata(state, now),
        date_of_birth=dob,
        current_year=now.year,
        steering_notes=steering_notes,
        unsent_writing=state.reserve or "",
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


async def _sabri_turn(chat_id, message, trigger_entry, state, source_content, waited_seconds=None):
    """Sabri delivers: build his input (everything unsent + the capsule) and run him → bubbles.

    He is handed ALL of Valentina's undelivered writing and chooses from it. He no longer
    reports what he held: nothing is consumed by sending, so there is nothing to report."""
    from app.services.ai import reading_sabri

    already_seen = _session_memory(state, trigger_entry)
    sabri_input = reading_sabri.build_sabri_input(
        client_message=message,
        session_memory=already_seen,
        source_content=source_content,
        waited_seconds=waited_seconds,
    )
    bubbles = await asyncio.to_thread(
        reading_sabri.sabri_deliver, sabri_input, source_content=source_content,
        already_seen=already_seen, chat_id=chat_id, turn_number=state.messages_sent_count,
    )
    logger.info("duo_sabri_delivered", chat_id=chat_id, bubbles=len(bubbles),
                words=sum(len(b.split()) for b in bubbles),
                unsent_chars=len((source_content or "").strip()),
                waited_seconds=waited_seconds)
    return bubbles


async def _duo_generate(
    chat_id, message, trigger_entry, state, user_id, forced_route=None, *, psychic_id=None,
    waited_seconds=None,
):
    """Route → (Valentina if NEW) → Sabri. Returns (bubbles, reserve, route). Nothing reaches the
    client here. bubbles is the paced-reveal payload (ALWAYS non-empty — Sabri guarantees a
    fallback line, and a failed Valentina write yields one too, so the client never sees dead
    silence).

    ``reserve`` is now everything Valentina has written this session that has not been
    delivered, ACCUMULATED — this turn's writing added to what was already unsaid, rather than
    replacing it. It is returned so the caller can bank it; it is never reduced here, because
    sending something does not consume it.

    ``forced_route`` overrides the routing entirely and is now only used by tests."""
    from app.services.ai.reading_llm import FALLBACK_MESSAGE

    held = (state.reserve or "") if state is not None else ""
    route = forced_route or await _resolve_route(message, held)
    logger.info("duo_routed", chat_id=chat_id, route=route,
                reserve_chars=len(held.strip()), forced=forced_route is not None,
                why=("forced" if forced_route is not None
                     else _LAST_ROUTE_REASON.get("why", "unknown")),
                held_head=held.strip()[:120])
    reserve = held
    if route == "new":
        valentina_text = (
            await _write_valentina_turn(
                chat_id, message, trigger_entry, state, user_id, psychic_id
            )
            if psychic_id is not None
            else await _write_valentina_turn(
                chat_id, message, trigger_entry, state, user_id
            )
        )
        if not valentina_text.strip():
            # Valentina failed — deliver a fallback line and KEEP everything already unsaid.
            logger.warning("duo_valentina_empty_fallback", chat_id=chat_id)
            return [FALLBACK_MESSAGE], held, route
        reserve = accumulate_reserve(held, valentina_text)
    bubbles = await _sabri_turn(
        chat_id, message, trigger_entry, state, reserve, waited_seconds=waited_seconds
    )
    logger.info("duo_generated", chat_id=chat_id, route=route, bubbles=len(bubbles),
                reserve_chars=len(reserve.strip()))
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
    'reading the message' beat before the dots turn on.

    This coordinator is not on the live path any more (the burst coordinator calls
    _duo_generate directly and this turn loop never runs), so this is the base read pause
    only. The real, length-aware read pause lives in reading_burst.read_pause_ms."""
    from app.config import get_app_settings

    return get_app_settings().READ_PAUSE_BASE_MS / 1000.0


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
                chat_id, message, trigger_entry, state, user_id, forced_route,
                psychic_id=psychic_id,
            )
            await _reveal_turn_duo(chat_id, bubbles, psychic_id, state)  # dots stay on into msg 1
            # Reserve persistence, with the old TODO resolved: _duo_generate now returns
            # everything Valentina has written and not had delivered, ACCUMULATED. The reserve
            # is only ever added to, so there is no longer any case where writing the result
            # can lose content the client never saw, and no guard is needed to guess whether an
            # empty result meant "drained" or "he just said mm yeah".
            state.reserve = reserve
            store.put(state)
            async with _lock(chat_id):
                nxt = _pending.pop(chat_id, None)
                if nxt is None:
                    _active[chat_id] = False
                    message, trigger_entry = None, None
                else:
                    message, trigger_entry = nxt
                    # Deliberately NOT forced to NEW any more. Assuming a queued
                    # message must be a new topic is what made "say more", typed
                    # while bubbles were still landing, cost a whole fresh reading.
                    # The reserve router reads the held material before deciding,
                    # so it can tell those two cases apart on the evidence.
                    forced_route = None
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
