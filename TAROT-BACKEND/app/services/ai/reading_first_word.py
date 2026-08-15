"""Everything the reader says outside the delivery loop.

A client writes, and today she watches an empty screen for about a minute while
Valentina reads and Sabri voices it. A real reader does not do that. She reacts
first — warmth, or sympathy, or "hold on, let me look at this properly" — and
*then* reads. This module owns that reflex, and the goodbye at the end, both in
Sabri's voice because he is the human voice of the reading.

Two rules shape every line of this file.

THE HARD RULE. Sabri's own words may never contain a card, a number, a date, a
sign, a name or a timing claim. He has not looked at anything yet, so he has
nothing to tell her. That is enforced in code (see ``_reject_reason``) by
running Valentina's own protected-vocabulary detectors over the candidate and
discarding it on any hit — not by trusting the model to behave.

THE SAFETY RULE. This runs beside a live reading on a single-worker event loop,
in a file that already cost an outage today. So: nothing here is awaited by the
caller, every database and model call goes through ``asyncio.to_thread``, the
whole attempt is deadline-bounded from the moment her message arrived, and any
failure is silence. Silence is exactly today's behaviour, so the worst case of
this module is the status quo.
"""

from __future__ import annotations

import asyncio
import re
import time
from datetime import datetime, timezone
from typing import Dict, List, Optional

from app.logging_config import get_logger

logger = get_logger(__name__)

# Her message should be answered inside this, measured from arrival, not from
# when this task happened to start. A late line is worse than none: it lands on
# top of the reading it was supposed to precede.
FIRST_WORD_DEADLINE_SECONDS = 3.0
# The goodbye is awaited inline by the session teardown, so it gets its own,
# looser budget — but it still cannot hold the end of a session open.
CLOSING_DEADLINE_SECONDS = 4.0
# A holding line is one short breath. 64 tokens bounds the worst case; output
# tokens are what wall-clock actually costs here.
MAX_OUTPUT_TOKENS = 64

# The immediate human moment. Appended to Sabri's own system prompt so the voice
# is identical — and, not incidentally, so the system block clears the 4,096-token
# minimum that makes prompt caching work at all on Haiku. Without this the block
# measures 4,065 tokens and cache_control is a silent no-op.
PASS_ONE_INSTRUCTION = """

---

RIGHT NOW: THE IMMEDIATE HUMAN MOMENT ONLY.

She has just written to you. You have not looked at anything yet — no cards, no
chart, no numbers. You know nothing except what she just said.

Send ONE short line. The reflex a real reader has before she reads: the thing
you say while you are still reaching for the cards.

Match what she actually said:
- if it is painful or frightening, the empathy lands first, before anything else
- if it is a greeting or an opening, warmth
- if it is a question, tell her you are going to look at it properly

Never a scripted opener. Never the same shape twice in one session. Never a
formula. It should sound like it was written by someone who just read her
message, because it was.

You have nothing to tell her yet, so do not imply that you do. No cards, no
numbers, no dates, no signs, no names, no timing, no hints about what is coming.
Warmth and honesty only. The reading itself comes in a moment.

Reply with the line alone. No quotes, no preamble, nothing else.
"""

CLOSING_INSTRUCTION = """

---

RIGHT NOW: THE LAST THING SHE HEARS FROM YOU.

The session is over. This is your goodbye, and it is the final message she will
read. Make it warm and human — that she was heard, that you hope she leaves
steadier, that she is welcome back.

No reading substance of any kind: no cards, no numbers, no dates, no signs, no
names, no timing, no summary of what was said, no new claims. Nothing that
sounds like a formula or a sign-off template. Never repeat a line you have
already used with her.

Reply with the goodbye alone. No quotes, no preamble, nothing else.
"""

# Regexes miss what reads as substance without matching a card or a digit.
_SUBSTANCE_PHRASES = (
    "card", "cards", "spread", "chart", "reading says", "your reading",
    "it says", "i'm seeing", "im seeing", "i am seeing", "i see that",
    "by then", "coming up", "the cards", "pulled",
)

# What has already been said, per reading session, so a line is never reused.
# Process-local on purpose: production runs one worker, so this is sufficient
# within a session, and it keeps this feature free of a schema change. A restart
# mid-session forgets the history, which costs at worst one repeated line.
_SAID: Dict[int, List[str]] = {}
_SAID_LIMIT = 256


def _normalise(text: str) -> str:
    return re.sub(r"[^a-z0-9 ]+", "", (text or "").casefold()).strip()


def _too_similar(candidate: str, previous: List[str]) -> bool:
    """Same line, or a paraphrase close enough that she would notice."""
    now = _normalise(candidate)
    if not now:
        return True
    now_words = set(now.split())
    for earlier in previous:
        was = _normalise(earlier)
        if not was:
            continue
        if now == was:
            return True
        was_words = set(was.split())
        union = now_words | was_words
        if union and len(now_words & was_words) / len(union) >= 0.6:
            return True
    return False


def remember(chat_session_id: Optional[int], line: str) -> None:
    if chat_session_id is None:
        return
    if len(_SAID) >= _SAID_LIMIT:
        _SAID.clear()
    _SAID.setdefault(chat_session_id, []).append(line)


def already_said(chat_session_id: Optional[int]) -> List[str]:
    return list(_SAID.get(chat_session_id, ())) if chat_session_id is not None else []


def forget(chat_session_id: Optional[int]) -> None:
    if chat_session_id is not None:
        _SAID.pop(chat_session_id, None)


def _reject_reason(candidate: str, previous: List[str]) -> Optional[str]:
    """Why this line must not be sent, or None if it may be.

    The substance checks reuse Valentina's own protected vocabulary, so this
    stays in step with her terms for free. The capitalised-word proper-name
    guard inside ``_protected_spans`` is deliberately NOT used: it flags any
    capitalised word of three or more letters, which would reject ordinary
    sentence-initial prose.
    """
    from app.services.ai.reading_sabri import (
        _KNOWN_TERMS,
        _PROTECTED_PATTERNS,
        sanitize_delivery_text,
    )

    text = sanitize_delivery_text(candidate or "")
    if not text or not text.strip():
        return "empty"
    if len(text.split()) > 40:
        return "too long"

    lowered = text.casefold()
    for term in _KNOWN_TERMS:
        if re.search(r"\b" + re.escape(term) + r"\b", lowered, re.IGNORECASE):
            return f"names a protected term ({term})"
    for pattern in _PROTECTED_PATTERNS:
        found = pattern.search(text)
        if found:
            return f"contains reading substance ({found.group(0)[:32]!r})"
    for phrase in _SUBSTANCE_PHRASES:
        if phrase in lowered:
            return f"implies the reading ({phrase})"

    try:
        from app.services.ai.reading_pipeline import is_return_acknowledgment

        if is_return_acknowledgment(text):
            return "return acknowledgement"
    except Exception:  # noqa: BLE001 - an optional guard must never block a send
        pass

    if _too_similar(text, previous):
        return "repeats an earlier line"
    return None


def _build_user_turn(
    *,
    client_message: str,
    transcript: List[dict],
    previous: List[str],
    is_first_message: bool,
) -> str:
    """Everything that varies goes here, after the cached system block."""
    parts: List[str] = []
    recent = [entry for entry in (transcript or []) if entry.get("content")][-4:]
    if recent:
        parts.append(
            "CONVERSATION SO FAR:\n"
            + "\n".join(
                f"{'client' if entry.get('role') == 'client' else 'you'}: {entry.get('content', '')}"
                for entry in recent
            )
        )
    parts.append(f"WHAT SHE JUST WROTE:\n{client_message}")
    parts.append(
        "This is her first message of the session."
        if is_first_message
        else "The session is already under way."
    )
    if previous:
        parts.append(
            "YOU HAVE ALREADY OPENED WITH THESE IN THIS SESSION — do not reuse or "
            "paraphrase any of them:\n" + "\n".join(f"- {line}" for line in previous)
        )
    return "\n\n".join(parts)


def _generate(system_block: str, user_turn: str, model: str) -> tuple[str, Optional[str]]:
    """One direct SDK call. Blocking — always call through asyncio.to_thread.

    Deliberately does not use ``ai_client.run_chat``: that helper passes ``system``
    as a bare string, and cache_control can only be attached to a system block,
    so routing through it would forfeit prompt caching and hide ``stop_reason``.
    """
    import os

    from anthropic import Anthropic

    key = os.environ.get("ANTHROPIC_API_KEY")
    if not key:
        raise RuntimeError("ANTHROPIC_API_KEY is not configured")
    client = Anthropic(api_key=key, timeout=8.0, max_retries=0)
    message = client.messages.create(
        model=model,
        max_tokens=MAX_OUTPUT_TOKENS,
        system=[{
            "type": "text",
            "text": system_block,
            "cache_control": {"type": "ephemeral"},
        }],
        messages=[{"role": "user", "content": user_turn}],
    )
    text = "".join(
        getattr(block, "text", "") for block in message.content
        if getattr(block, "type", "") == "text"
    )
    return text.strip(), getattr(message, "stop_reason", None)


def _resolve_prompt(instruction: str) -> tuple[str, str]:
    """Sabri's live prompt plus the moment-specific instruction, and the fast model."""
    from app.config import get_app_settings
    from app.services.ai.reading_sabri import SABRI_SYSTEM_PROMPT
    from app.services.ai.runtime_prompts import resolve_runtime_prompt_and_model

    settings = get_app_settings()
    prompt, _model = resolve_runtime_prompt_and_model(
        "reading.sabri", SABRI_SYSTEM_PROMPT, settings.SABRI_DELIVERY_MODEL
    )
    # The voice comes from the prompt, not the model: this pass runs on the fast
    # model so the line actually arrives while she is still looking at the screen.
    return prompt + instruction, settings.CONTENT_MODEL


def _load_context(chat_id: int, chat_session_id: Optional[int]) -> Optional[dict]:
    """One database round trip. Blocking — always call through asyncio.to_thread."""
    from app.database.client import SessionLocal
    from app.enums.chat_status import ChatStatus
    from app.enums.response_mode import ResponseMode
    from app.models.chat import Chat
    from app.services.ai.reading_session import get_session_store

    with SessionLocal() as db:
        chat = db.get(Chat, chat_id)
        if chat is None or chat.status != ChatStatus.ACTIVE:
            return None
        # Only the automatic reading leaves her waiting on a model. In Hybrid the
        # owner is writing, and in Manual a human is; neither wants a bot
        # answering first.
        if getattr(chat, "response_mode", None) != ResponseMode.SABRI:
            return None
        state = get_session_store().get(f"chat:{chat_id}")
        transcript = list(getattr(state, "chat_transcript", []) or []) if state else []
        client_message = ""
        for entry in reversed(transcript):
            if entry.get("role") == "client" and entry.get("content"):
                client_message = str(entry["content"])
                break
        return {
            "client_message": client_message,
            "transcript": transcript,
            "is_first_message": len([e for e in transcript if e.get("role") == "client"]) <= 1,
        }


def _send(chat_id: int, chat_session_id: Optional[int], line: str) -> Optional[dict]:
    """Persist, record and build the wire payload. Blocking — call in a thread.

    The payload is assembled here, inside the session, because the ORM object is
    detached the moment this returns and touching it on the loop would become a
    blocking query.
    """
    from app.database.client import SessionLocal
    from app.enums.message_status import MessageStatus
    from app.models.chat import Chat
    from app.services.ai.reading_session import get_session_store
    from app.services.chats import prepare_ai_message

    with SessionLocal() as db:
        chat = db.get(Chat, chat_id)
        if chat is None:
            return None
        message = prepare_ai_message(db, chat, line, chat_session_id=chat_session_id)
        db.commit()
        db.refresh(message)
        payload = {
            "id": message.id,
            "content": message.content,
            "sender_id": chat.psychic_id,
            "user_id": chat.psychic_id,
            "type": "message",
            "chat_id": chat.id,
            "timestamp": datetime.now().isoformat(),
            "created_at": message.created_at.isoformat()
            if message.created_at
            else datetime.now().isoformat(),
            "status": message.status.value,
            "author_type": message.author_type.value,
        }
        needs_push = message.status == MessageStatus.SENT

    # Sabri's delivery pass reads the transcript and is already told not to
    # repeat what she has seen, so writing the line there is the whole of
    # "pass two must not repeat pass one" — no prompt change required.
    try:
        store = get_session_store()
        state = store.get(f"chat:{chat_id}")
        if state is not None:
            state.chat_transcript.append({
                "role": "logan",
                "content": line,
                "timestamp": datetime.now(timezone.utc).isoformat(),
            })
            store.put(state)
    except Exception as error:  # noqa: BLE001 - the client already has the line
        logger.warning("reading_first_word_transcript_failed", chat_id=chat_id,
                       error_type=type(error).__name__)
    return {"payload": payload, "needs_push": needs_push}


async def _speak(
    *,
    chat_id: int,
    chat_session_id: Optional[int],
    instruction: str,
    deadline_seconds: float,
    started: float,
    event: str,
) -> bool:
    context = await asyncio.to_thread(_load_context, chat_id, chat_session_id)
    if not context or not context["client_message"]:
        return False

    previous = already_said(chat_session_id)
    system_block, model = await asyncio.to_thread(_resolve_prompt, instruction)
    user_turn = _build_user_turn(
        client_message=context["client_message"],
        transcript=context["transcript"],
        previous=previous,
        is_first_message=context["is_first_message"],
    )

    candidate, stop_reason = await asyncio.to_thread(_generate, system_block, user_turn, model)
    if stop_reason == "max_tokens":
        logger.info("reading_first_word_rejected", chat_id=chat_id, reason="truncated")
        return False

    reason = _reject_reason(candidate, previous)
    if reason:
        logger.info("reading_first_word_rejected", chat_id=chat_id, reason=reason,
                    candidate=(candidate or "")[:160])
        return False

    from app.services.ai.reading_sabri import sanitize_delivery_text

    line = sanitize_delivery_text(candidate).strip()
    elapsed = time.perf_counter() - started
    if elapsed > deadline_seconds:
        # A line that arrives after the reading has started is worse than none.
        logger.info("reading_first_word_rejected", chat_id=chat_id, reason="deadline",
                    elapsed_ms=int(elapsed * 1000))
        return False

    sent = await asyncio.to_thread(_send, chat_id, chat_session_id, line)
    if not sent:
        return False

    from app.manager import manager

    await manager.send_to_chat(message=sent["payload"], chat_id=str(chat_id))
    remember(chat_session_id, line)
    logger.info(
        event,
        chat_id=chat_id,
        chat_session_id=chat_session_id,
        elapsed_ms=int((time.perf_counter() - started) * 1000),
        words=len(line.split()),
    )
    return True


async def speak_now(chat_id: int, chat_session_id: Optional[int], arrived_at: float) -> None:
    """The immediate human response. Never awaited by the caller, never raises."""
    try:
        await asyncio.wait_for(
            _speak(
                chat_id=chat_id,
                chat_session_id=chat_session_id,
                instruction=PASS_ONE_INSTRUCTION,
                deadline_seconds=FIRST_WORD_DEADLINE_SECONDS,
                started=arrived_at,
                event="reading_first_word_sent",
            ),
            timeout=FIRST_WORD_DEADLINE_SECONDS + 2.0,
        )
    except asyncio.TimeoutError:
        logger.info("reading_first_word_rejected", chat_id=chat_id, reason="timeout")
    except Exception as error:  # noqa: BLE001 - she simply waits, exactly as before
        logger.warning("reading_first_word_failed", chat_id=chat_id,
                       error_type=type(error).__name__)


async def say_goodbye(chat_id: int, chat_session_id: Optional[int]) -> None:
    """The last thing she hears. Awaited by session teardown, never raises."""
    started = time.perf_counter()
    try:
        await asyncio.wait_for(
            _speak(
                chat_id=chat_id,
                chat_session_id=chat_session_id,
                instruction=CLOSING_INSTRUCTION,
                deadline_seconds=CLOSING_DEADLINE_SECONDS,
                started=started,
                event="reading_last_word_sent",
            ),
            timeout=CLOSING_DEADLINE_SECONDS + 1.0,
        )
    except asyncio.TimeoutError:
        logger.info("reading_last_word_rejected", chat_id=chat_id, reason="timeout")
    except Exception as error:  # noqa: BLE001 - the session must still end cleanly
        logger.warning("reading_last_word_failed", chat_id=chat_id,
                       error_type=type(error).__name__)
    finally:
        forget(chat_session_id)
