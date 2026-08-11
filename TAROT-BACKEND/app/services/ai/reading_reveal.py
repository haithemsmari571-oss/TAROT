"""Reveal coordinator for the single-agent Reader (READING_ENGINE=single_agent).

The Reader writes good, correctly-paced-in-content replies; this layer controls HOW
they reach the client so it reads like a real person texting:

  * Generation is INVISIBLE — the full reply (bubbles + @@HOLD@@ holds) is generated
    and parsed before anything is revealed. No live token streaming.
  * The parsed bubbles are then revealed one at a time at landingpage2's rhythm
    (reading-her-message beat, per-bubble typing, gaps) — see reading_executor.play_reveal.
  * The client is NEVER locked out. A message that arrives mid-reveal is classified:
      - CONTINUER (a short reaction/ack needing no new answer) → ignored; the current
        reveal keeps playing. No new Reader call.
      - REDIRECT (a real question / new topic / new info) → queued; the current reveal
        finishes uninterrupted, THEN a fresh Reader turn addresses it and reveals.
    Classification is a cheap heuristic first, a Haiku tie-break only for the genuinely
    ambiguous. It NEVER reviews or corrects the Reader's writing — only continue-vs-redirect.

Because mid-reveal messages are classified and queued/handled in arrival order rather
than racing the in-progress reveal, bubbles from different turns can never interleave
(the message-ordering bug is designed out).

Content generation is unchanged: Opus 4.6, gated adaptive thinking, deterministic
numerology injection, the return-ack filter, the emoji ban, the voice prompt, and the
hold-back buffer all live in reading_reader and are used verbatim.
"""

import asyncio
from datetime import datetime
from typing import Dict, Tuple
from urllib.parse import quote

import httpx

from app.config import get_app_settings
from app.logging_config import get_logger

logger = get_logger(__name__)

# ── per-chat coordination state ───────────────────────────────────────────────
_locks: Dict[int, asyncio.Lock] = {}
_active: Dict[int, bool] = {}                     # a turn loop is running for this chat
_pending: Dict[int, Tuple[str, dict]] = {}        # queued redirect: (message, transcript entry)
_turn_tasks: Dict[int, asyncio.Task] = {}

_ATLAS_DOSSIER_TIMEOUT_SECONDS = 2.0
_ATLAS_DOSSIER_PATH = "/internal/atlas/dossier"


def _lock(chat_id: int) -> asyncio.Lock:
    lock = _locks.get(chat_id)
    if lock is None:
        lock = asyncio.Lock()
        _locks[chat_id] = lock
    return lock


async def _fetch_atlas_memory_text(user_id) -> str:
    """Fetch Atlas's prompt-ready dossier text once, always failing closed to empty."""
    settings = get_app_settings()
    base_url = str(getattr(settings, "ATLAS_DOSSIER_BASE_URL", "") or "").strip()
    internal_key = str(getattr(settings, "ATLAS_INTERNAL_KEY", "") or "").strip()
    source_user_id = str(user_id or "").strip()
    if not base_url or not internal_key:
        logger.warning("atlas_dossier_fetch_skipped", reason="configuration_missing")
        return ""
    if not source_user_id:
        logger.warning("atlas_dossier_fetch_skipped", reason="source_user_id_missing")
        return ""

    url = f"{base_url.rstrip('/')}{_ATLAS_DOSSIER_PATH}/{quote(source_user_id, safe='')}"

    async def _request():
        async with httpx.AsyncClient(timeout=_ATLAS_DOSSIER_TIMEOUT_SECONDS) as client:
            return await client.get(
                url,
                headers={"X-Atlas-Internal-Key": internal_key},
            )

    try:
        response = await asyncio.wait_for(
            _request(), timeout=_ATLAS_DOSSIER_TIMEOUT_SECONDS
        )
    except (asyncio.TimeoutError, httpx.TimeoutException):
        logger.warning("atlas_dossier_fetch_failed", reason="timeout")
        return ""
    except Exception as error:  # noqa: BLE001 — memory must never break a reading
        logger.warning(
            "atlas_dossier_fetch_failed",
            reason="connection",
            error_type=type(error).__name__,
        )
        return ""

    if response.status_code != 200:
        logger.warning(
            "atlas_dossier_fetch_failed",
            reason="status",
            status_code=response.status_code,
        )
        return ""

    try:
        payload = response.json()
        text = payload.get("text") if isinstance(payload, dict) else None
    except Exception as error:  # noqa: BLE001 — malformed JSON is no-memory
        logger.warning(
            "atlas_dossier_fetch_failed",
            reason="invalid_response",
            error_type=type(error).__name__,
        )
        return ""
    if not isinstance(text, str):
        logger.warning("atlas_dossier_fetch_failed", reason="invalid_response")
        return ""
    return text


async def _atlas_memory_for_session(state, user_id) -> str:
    """Return the session's cached Atlas text, including cached empty failures."""
    if state.atlas_memory_text is None:
        state.atlas_memory_text = await _fetch_atlas_memory_text(user_id)
    return state.atlas_memory_text


# ═════════════════════════════════════════════════════════════════════════════
# CONTINUE vs REDIRECT classifier — heuristic first, cheap model only if ambiguous.
# ═════════════════════════════════════════════════════════════════════════════
# Short reactions / acknowledgments that need no new answer (whole-message matches).
_CONTINUER_WORDS = {
    "ok", "okay", "k", "kk", "kay", "yes", "yeah", "yea", "yep", "yup", "ya", "sure",
    "mhm", "mm", "mmm", "hmm", "hm", "wow", "omg", "oh", "ah", "aw", "aww", "right",
    "true", "exactly", "same", "real", "fr", "facts", "lol", "lmao", "haha", "hahaha",
    "damn", "agreed", "noted", "word", "yess", "yesss", "preach", "amen", "wild",
    "crazy", "insane", "interesting", "huh", "ohh", "ohhh", "okok", "ty", "thanks",
    "yesyes", "deadass", "ikr",
}
_CONTINUER_PHRASES = (
    "im listening", "i'm listening", "i am listening", "go on", "keep going",
    "tell me more", "i see", "so true", "thats true", "that's true", "makes sense",
    "that makes sense", "got it", "ok got it", "okay got it", "youre good", "you're good",
    "ur good", "wow youre good", "wow you're good", "so accurate", "thats me", "that's me",
    "i felt that", "yes i felt that", "yes i felt that way", "i feel that", "felt that",
    "no way", "for real", "oh my god", "oh wow", "thats crazy", "that's crazy",
    "thats wild", "that's wild", "yes exactly", "omg yes", "oh okay", "ok yes", "yes yes",
    "thank you", "okay wow", "wow ok", "mm hmm", "i know right", "so real", "makes so much sense",
)
# A statement this long with no question mark is treated as substantive new content.
_SUBSTANTIVE_WORDS = 8
# A short reaction turn can stack a few reaction tokens ("omg yes", "ok wow lol").
_MAX_REACTION_WORDS = 4


def classify_reply(message) -> str:
    """Heuristic continue/redirect/ambiguous label for a mid-reveal client message.
    Pure. Returns "continuer", "redirect", or "ambiguous" (→ cheap-model tie-break)."""
    t = (message or "").strip().lower()
    if not t:
        return "continuer"                       # nothing to answer
    if "?" in t:
        return "redirect"                        # a real question
    core = t.strip(" .!,…\"'`-–—\n\t")
    if core in _CONTINUER_WORDS or core in _CONTINUER_PHRASES:
        return "continuer"
    if any(core == p or core.startswith(p + " ") for p in _CONTINUER_PHRASES):
        return "continuer"
    words = core.split()
    if words and len(words) <= _MAX_REACTION_WORDS and all(
        w.strip(".!,") in _CONTINUER_WORDS for w in words
    ):
        return "continuer"                       # e.g. "omg yes", "ok wow lol"
    if len(words) >= _SUBSTANTIVE_WORDS:
        return "redirect"                        # a long statement = new content
    return "ambiguous"                           # short, no '?', not a known reaction


_CLASSIFIER_SYSTEM = (
    "You label ONE chat reply a client sent to their psychic, mid-reading. Output "
    "exactly one word:\n"
    "CONTINUER — a short reaction or acknowledgment that needs no new answer "
    "(e.g. 'okay', 'im listening', 'omg youre good', 'yes i felt that').\n"
    "REDIRECT — a real question, a new topic, or new information that changes what the "
    "psychic should say next.\n"
    "Judge ONLY this reply. Never comment on or correct the psychic's writing. One word."
)


def _classify_with_model(message: str) -> str:
    """Cheap Haiku tie-break for a genuinely ambiguous message. Sync (call in a thread)."""
    from app.services.ai import client as ai_client

    s = get_app_settings()
    result = ai_client.run_chat(
        system=_CLASSIFIER_SYSTEM, user_content=message or "",
        model=s.READER_CLASSIFIER_MODEL, max_tokens=4,
    )
    out = (result.get("text") or "").strip().lower()
    return "continuer" if out.startswith("cont") else "redirect"


async def resolve_classification(message: str) -> str:
    """Final continue/redirect decision: heuristic, then a cheap model only if ambiguous.
    On any model error, default to REDIRECT — never silently drop a possible question."""
    kind = classify_reply(message)
    if kind != "ambiguous":
        return kind
    try:
        return await asyncio.to_thread(_classify_with_model, message)
    except Exception as e:  # noqa: BLE001
        logger.warning("reveal_classifier_model_failed", error=str(e))
        return "redirect"


# ═════════════════════════════════════════════════════════════════════════════
# Invisible generation + paced reveal (per turn).
# ═════════════════════════════════════════════════════════════════════════════
def _reader_input_for(
    message, trigger_entry, state, client_file, dob, now, atlas_memory_text=""
):
    """Assemble the Reader input for a turn: the client message + the transcript WITHOUT
    the triggering entry (so it isn't duplicated into RECENT CONVERSATION on top of the
    CLIENT MESSAGE section) + numerology + fresh session metadata. Pure."""
    from app.services.ai import reading_reader
    from app.services.ai.reading_session import compute_metadata

    transcript = [e for e in state.chat_transcript if e is not trigger_entry]
    reader_input = reading_reader.build_reader_input(
        client_message=message,
        chat_transcript=transcript,
        client_file=client_file,
        session_metadata=compute_metadata(state, now),
        held_back_buffer=state.held_back_buffer,
        date_of_birth=dob,
        current_year=now.year,
    )
    if atlas_memory_text:
        return (
            "ATLAS CLIENT MEMORY (load silently, never cite):\n"
            + atlas_memory_text
            + "\n\n"
            + reader_input
        )
    return reader_input


async def _generate_turn(chat_id, message, trigger_entry, state, user_id):
    """Generate the FULL reply INVISIBLY: load the dossier + DOB, build the input, run the
    Reader (Opus + gated thinking) to completion, parse bubbles + holds. Nothing reaches
    the client here. Returns (bubbles, holds); bubbles is always non-empty (run_reader_turn
    guarantees a fallback line)."""
    from app.database.client import SessionLocal
    from app.services.ai import reading_assistant, reading_reader
    from app.services.client_dossier import get_client_dob

    def _load_file_and_dob():
        with SessionLocal() as db:
            return reading_assistant.build_client_file(db, user_id), get_client_dob(db, user_id)

    client_file, dob = await asyncio.to_thread(_load_file_and_dob)
    state.client_file = client_file
    atlas_memory_text = await _atlas_memory_for_session(state, user_id)
    reader_input = _reader_input_for(
        message,
        trigger_entry,
        state,
        client_file,
        dob,
        datetime.now(),
        atlas_memory_text,
    )
    bubbles, holds = await asyncio.to_thread(
        reading_reader.run_reader_turn, reader_input, client_message=message,
        chat_id=chat_id, turn_number=state.messages_sent_count,
    )
    logger.info("reveal_generated", chat_id=chat_id, bubbles=len(bubbles), holds=len(holds))
    return bubbles, holds


async def _reveal_turn(chat_id, bubbles, psychic_id, state):
    """Play the paced reveal of already-generated bubbles; record each sent bubble on the
    transcript. Returns the sent bubbles."""
    from app.database.client import SessionLocal
    from app.models.chat import Chat as _Chat
    from app.services.ai import reading_executor
    from app.services.ai.reading_session import record_sent_message
    from app.services.chats import broadcast_ai_message

    async def typing_fn(on: bool) -> None:
        await reading_executor.broadcast_typing(chat_id, on, psychic_id)

    async def send_bubble(text: str) -> None:
        with SessionLocal() as db:
            chat = db.query(_Chat).filter(_Chat.id == chat_id).first()
            if not reading_executor._chat_is_deliverable(chat):
                raise reading_executor._DeliveryAborted(
                    f"chat {chat_id} not deliverable (status={getattr(chat, 'status', None)})"
                )
            await broadcast_ai_message(db, chat, text)
        record_sent_message(state, text)

    sent = await reading_executor.play_reveal(
        bubbles, send_bubble=send_bubble, typing_fn=typing_fn,
        sleep_fn=asyncio.sleep, config=reading_executor.reveal_config_from_settings(),
    )
    logger.info("reveal_finished", chat_id=chat_id, bubbles=len(sent))
    return sent


async def _chat_active(chat_id) -> bool:
    """True if the chat is still deliverable (ACTIVE) — checked before a turn so we never
    generate/reveal into an ended chat."""
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
# Coordinator: entry + turn loop + cancellation.
# ═════════════════════════════════════════════════════════════════════════════
def _clear_task(chat_id, task) -> None:
    if _turn_tasks.get(chat_id) is task:
        _turn_tasks.pop(chat_id, None)


def _start_turn_locked(chat_id, message, entry, psychic_id, user_id) -> None:
    """Launch the turn loop for `message`. MUST be called while holding _lock(chat_id)."""
    _active[chat_id] = True
    _pending.pop(chat_id, None)
    task = asyncio.create_task(_turn_loop(chat_id, message, entry, psychic_id, user_id))
    _turn_tasks[chat_id] = task
    task.add_done_callback(lambda t, cid=chat_id: _clear_task(cid, t))
    logger.info("reveal_turn_started", chat_id=chat_id)


async def handle_client_message(chat_id, client_message, *, psychic_id=None, user_id=None) -> None:
    """Single-agent entry for one client message. If no turn is running, start one
    (generate → reveal). If a turn IS running, classify: a continuer is ignored; a
    redirect is queued to run after the current reveal finishes. Returns fast — the turn
    plays out in a background task."""
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
        entry = state.chat_transcript[-1]         # identity handle for transcript dedup
        state.waiting_for_response = False
        store.put(state)

        if not _active.get(chat_id):
            # Idle chat → this message always starts a turn (classification is only for
            # messages that arrive WHILE a reveal is playing).
            _start_turn_locked(chat_id, client_message, entry, psychic_id, user_id)
            return

    # A reveal (or its generation) is in progress — classify without blocking it.
    kind = await resolve_classification(client_message)
    async with lock:
        if kind == "redirect":
            if _active.get(chat_id):
                _pending[chat_id] = (client_message, entry)   # latest redirect wins
                logger.info("reveal_redirect_queued", chat_id=chat_id)
            else:
                # The turn finished while we classified — run the redirect now.
                _start_turn_locked(chat_id, client_message, entry, psychic_id, user_id)
        else:
            logger.info("reveal_continuer_ignored", chat_id=chat_id)


async def _turn_loop(chat_id, message, trigger_entry, psychic_id, user_id) -> None:
    """Drive one or more turns for a chat: show typing → generate INVISIBLY (dots stay
    on the whole time, never dead silence) → paced reveal (keeps the dots on into the
    first bubble) → merge holds → if a redirect was queued during the reveal, loop for
    it; else go idle. One reveal plays fully before the next begins, so bubbles never
    interleave across turns."""
    from app.services.ai import reading_executor
    from app.services.ai.reading_executor import _DeliveryAborted, _merge_reader_holds
    from app.services.ai.reading_session import get_session_store

    store = get_session_store()
    state = store.get(f"chat:{chat_id}")
    try:
        while message is not None:
            # Typing dots ON the instant we begin this turn and held through the
            # (invisible) generation — the client never sees silence while she composes.
            await reading_executor.broadcast_typing(chat_id, True, psychic_id)
            if not await _chat_active(chat_id):
                logger.info("reveal_skipped_chat_not_active", chat_id=chat_id)
                break
            bubbles, holds = await _generate_turn(chat_id, message, trigger_entry, state, user_id)
            sent = await _reveal_turn(chat_id, bubbles, psychic_id, state)  # dots stay on into bubble 1
            _merge_reader_holds(state, sent, holds)
            store.put(state)
            async with _lock(chat_id):
                nxt = _pending.pop(chat_id, None)
                if nxt is None:
                    _active[chat_id] = False
                    message, trigger_entry = None, None
                else:
                    message, trigger_entry = nxt
                    logger.info("reveal_redirect_dequeued", chat_id=chat_id)
    except asyncio.CancelledError:
        logger.info("reveal_turn_cancelled", chat_id=chat_id)
        raise
    except _DeliveryAborted as e:
        logger.info("reveal_turn_aborted", chat_id=chat_id, reason=str(e))
    except Exception as e:  # noqa: BLE001 — a delivery error must never crash the chat
        logger.error("reveal_turn_error", chat_id=chat_id, error=str(e), exc_info=True)
    finally:
        _active[chat_id] = False
        _pending.pop(chat_id, None)
        # Clear the dots if we exited before/without a reveal finishing them (generation
        # error, not-deliverable, cancel). play_reveal already clears them on success.
        try:
            await reading_executor.broadcast_typing(chat_id, False, psychic_id)
        except Exception:  # noqa: BLE001
            pass


async def cancel_reveal(chat_id) -> None:
    """Cancel an in-flight reveal/turn for a chat (session end / disconnect) and clear the
    coordinator's per-chat state. Safe to call when nothing is running."""
    task = _turn_tasks.pop(chat_id, None)
    _active[chat_id] = False
    _pending.pop(chat_id, None)
    if task and not task.done():
        task.cancel()
        try:
            await task
        except (asyncio.CancelledError, Exception):  # noqa: BLE001
            pass
