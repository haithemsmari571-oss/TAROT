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

# What good looks like: her message answered inside three seconds, measured from
# arrival rather than from whenever this task happened to start. Reported on
# every send so the real distribution is visible.
FIRST_WORD_TARGET_SECONDS = 3.0
# When the line stops being worth sending. Measured live it arrives between 2.5s
# and 3.1s, so discarding at the three-second target threw away a third of the
# lines for being fifty milliseconds late — and silence is not an improvement on
# a line that is slightly slower than hoped. The real constraint is that it must
# clearly precede the reading, and the reading's first bubble lands around 63s,
# so eight seconds keeps a minute of clearance while making the send near-certain.
FIRST_WORD_DEADLINE_SECONDS = 8.0
# The goodbye is awaited inline by the session teardown, so it gets its own,
# looser budget — but it still cannot hold the end of a session open.
CLOSING_DEADLINE_SECONDS = 4.0
# Nobody is waiting on the greeting the way they wait on a reply — she has just
# arrived and is still reading the screen — so it can afford to be a little late
# rather than fall back to a fixed line.
GREETING_DEADLINE_SECONDS = 6.0
# The only bound on length now that the word cap is gone. Generous, because the line is
# warmth AND an intake question and both have to fit; a runaway is still stopped.
MAX_OUTPUT_TOKENS = 300

# The immediate human moment. Appended to Sabri's own system prompt so the voice is
# identical. (It also used to be load-bearing for prompt caching on Haiku's 4,096-token
# minimum; on Sonnet the minimum is far lower, so that is no longer why it exists.)
#
# THE REGISTRY PROMPT IS NOT TOUCHED. This is appended in code, and it is the only part of
# what Sabri reads for this pass that this file owns.
PASS_ONE_INSTRUCTION = """

---

RIGHT NOW: THE FIRST THING SHE READS. WARMTH, AND ONE QUESTION IF YOU NEED IT.

She has just written to you and the reading itself is being pulled as you write this.
This line is not filler while she waits. It is the moment she decides whether a real
person is on the other end.

Two jobs, in one short message:

1. MEET HER WHERE SHE IS. Speak to what she actually just told you, in her own words and
   about her own situation. Use the names she used. Refer to what she described. If it is
   heavy, let it land as heavy. This is the difference between "i'm here, give me a
   moment" — which says nothing and could have been sent to anyone — and something only
   this client could have received.

2. ASK FOR ONE THING, IF THE READING OBVIOUSLY NEEDS IT. If something is missing that
   would make the reading real — a date of birth, a name, how long it has been going on,
   what actually happened — ask for exactly ONE of them, and say why you want it. "tell
   me his date of birth so i can see how you two actually sit together" reads as a psychic
   working. A bare demand for data does not.

   Never ask for something she has already told you, or that is already in the
   conversation above. If she has given you everything you need, do not invent a question
   — just meet her, warmly, and let the reading come.

This is the shape:
  "hello there my dear, sit with me because i can feel how heavy you're feeling lately,
   before we start tell me what's his date of birth"

You MAY say names, dates, numbers, ages, places, and anything else she has just told you.
Repeating her own facts back is how she knows she was heard.

What you may NOT do, because the reading has not been written yet and you would be
committing her to something that does not exist: do not name a specific tarot card, do not
state a Life Path or Personal Year number, and do not give a specific timing ("within ten
days", "by the end of March"). Everything else is open to you.

One message. No quotes, no preamble, nothing else.
"""

CLOSING_INSTRUCTION = """

---

RIGHT NOW: THE LAST THING SHE HEARS FROM YOU.

This is not a delivery. There is no reading material to relay and none is
missing — nothing is owed, nothing is being held back. Do not reserve, do not
ask for material, do not emit any marker or bracketed note. Speak plainly.

The session is over. This is your goodbye, and it is the final message she will
read. Make it warm and human — that she was heard, that you hope she leaves
steadier, that she is welcome back.

No reading substance of any kind: no cards, no numbers, no dates, no signs, no
names, no timing, no summary of what was said, no new claims. Nothing that
sounds like a formula or a sign-off template. Never repeat a line you have
already used with her.

Reply with the goodbye alone. No quotes, no preamble, nothing else.
"""

GREETING_INSTRUCTION = """

---

RIGHT NOW: HELLO. SHE HAS JUST WALKED IN.

She has joined the reading and you have not spoken yet. This is the first thing
she ever hears from you, so it cannot sound like a template — it was a fixed
line for every client until now, and that is exactly what is being replaced.

Send ONE short line: warm, present, hers. Let her know you are here and that she
can take her time. If she said something when she booked, let that colour how
you greet her, without answering it yet.

You have not looked at anything. No cards, no numbers, no dates, no signs, no
names, no timing, no hint of what is coming. Do not promise what the reading
will say. Do not reserve anything or emit any marker.

Reply with the greeting alone. No quotes, no preamble, nothing else.
"""

# Appended to the user turn on the second attempt. Naming the specific failure
# is what makes the retry worth making: an identical prompt would most likely
# produce an identically rejected line.
_RETRY_NOTE = """

YOUR PREVIOUS ATTEMPT WAS DISCARDED: {reason}.

Write a different line. Keep everything else the same — still warm, still about her own
situation, still using her own words and the names and details she gave you. The only
things that were ever off limits are naming a specific tarot card, stating a Life Path or
Personal Year number, and promising a specific timing. Fix that one thing and keep the rest.
"""

# The floor. When neither attempt survives, she still hears something human
# instead of nothing, and nothing here can leak the reading because none of it
# came from a model. These are deliberately plain: they are the safety net, not
# the intended voice, and a plain true line beats a clever unsafe one.
#
# Every line is checked against the same validators at selection time, so a
# careless edit here fails closed rather than smuggling substance through.
_FALLBACK_OPENERS = (
    "i'm here. give me a moment with this.",
    "thank you for telling me that. let me take it in properly.",
    "i hear you. stay with me a second.",
    "that landed with me. let me sit with it before i say anything.",
    "i'm with you. give me a breath.",
    "okay. i want to give this the attention it deserves.",
    "i've got you. one moment.",
    "thank you for trusting me with that. let me take a proper look.",
)

_FALLBACK_CLOSERS = (
    "thank you for being here today. take care of yourself.",
    "i'm glad you came. go gently with yourself.",
    # "you're welcome back any time" belongs here by tone but reads as a
    # returning-client greeting to the return-acknowledgement guard, so it is
    # rejected on principle. Kept out of the pool rather than kept and skipped.
    "take care of yourself. it was good to talk.",
    "thank you for trusting me with your time today. be kind to yourself.",
    "go well. i'm glad we talked.",
)


_FALLBACK_GREETINGS = (
    "hi love, i'm here. take your time.",
    "hey, i'm with you. whenever you're ready.",
    "hi, i'm here now. tell me what's going on.",
    "hello love. i'm listening whenever you want to start.",
    "hi. i'm here, no rush at all.",
)

_FALLBACK_POOLS = {
    "greet": _FALLBACK_GREETINGS,
    "open": _FALLBACK_OPENERS,
    "close": _FALLBACK_CLOSERS,
}


def _fallback_line(previous: List[str], moment: str) -> str:
    """A safe line she has not heard yet, or empty if she has heard them all."""
    pool = _FALLBACK_POOLS.get(moment, _FALLBACK_OPENERS)
    for line in pool:
        if _too_similar(line, previous):
            continue
        if _reject_reason(line, previous):
            # Belt and braces: a fallback that cannot pass the filter is a bug
            # in this file, and it must not reach a client either way.
            continue
        return line
    return ""


# The model talking about its own instructions instead of to the client. A live
# goodbye came back as: I'm waiting for what she wrote. The instruction block
# says "WHAT SHE JUST WROTE:" but there is nothing there. It broke no other rule
# — no card, no number, short enough — so nothing stopped it reaching her.
_META_PHRASES = (
    "instruction", "prompt", "the block", "placeholder", "appears to be empty",
    "no message", "nothing there", "system message", "what she just wrote",
    "as an ai", "i'm waiting for what", "im waiting for what",
    # Two more shapes, both seen reaching a live screen when the context it was handed
    # did not line up with the message that arrived. The first is stage direction — the
    # model narrating the delivery decision instead of making it ("she's leaning in and
    # absorbing. this is a nod. continue from where you were cut off, same register").
    # The second is the model stepping outside the reading to argue with its own input
    # ("the conversation history you've pasted doesn't match what you're asking me to do").
    # Sabri speaks TO her and about her life. He never narrates her, and never discusses
    # the material he was given.
    "conversation history", "you've pasted", "youve pasted", "you have pasted",
    "doesn't match what", "doesnt match what", "same register", "same tempo",
    "where you were cut off", "continue from where", "this is a nod",
    "she's leaning in", "shes leaning in", "she wants more", "not a question",
    "be direct with you:", "what you're asking me to do", "what youre asking me to do",
)
# ── THE ONE CONTENT RULE ─────────────────────────────────────────────────────
# The reading has not been written yet, so this line may not commit her to it. That is the
# whole of it: a named tarot card, a Life Path or Personal Year value, or a specific timing
# claim. Everything else — her name, his name, dates of birth, ages, places, numbers she
# just gave, how heavy it feels — is not only allowed, it is the job.
#
# What used to be here rejected any bare number, any date, any capitalised name, every
# zodiac sign and planet, a phrase list containing "card", "chart" and "pulled", and
# anything over forty words. It reused Valentina's protected vocabulary wholesale, which
# meant the more a client told the reader, the more certain the reply was to be a template.
# Live proof: "i want to know about jessica dob 12/12/1999 is she with anyone now" produced
# two rejected attempts and the fixed fallback line, from two different readers, identically.
def _tarot_card_pattern():
    """Card names specific enough to be unmistakable.

    The bare majors that are also ordinary English — strength, justice, death, temperance,
    judgement — are deliberately NOT here. Blocking "i can feel the strength in you" to
    prevent a card reference is exactly the over-rejection being removed."""
    ranks = ["ace", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten",
             "page", "knight", "queen", "king"]
    suits = ["cups", "pentacles", "swords", "wands", "coins"]
    minor = [rf"{r}\s+of\s+{s}" for r in ranks for s in suits]
    major = [
        "the fool", "the magician", "the high priestess", "the empress", "the emperor",
        "the hierophant", "the lovers", "the chariot", "the hermit", "wheel of fortune",
        "the hanged man", "the devil", "the tower", "the star", "the moon", "the sun",
        "the world",
    ]
    return re.compile(r"\b(" + "|".join(minor + [re.escape(m) for m in major]) + r")\b",
                      re.IGNORECASE)


_TAROT_CARD = _tarot_card_pattern()
_NUMEROLOGY_VALUE = re.compile(
    r"\b(?:life\s*path|personal\s*year)\s*(?:number\s*)?:?\s*"
    r"(?:\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twenty[-\s]?two|"
    r"thirty[-\s]?three)\b",
    re.IGNORECASE,
)
_MONTHS_RE = (
    "january|february|march|april|may|june|july|august|september|october|november|december"
)
_TIMING_CLAIM = re.compile(
    r"\b(?:(?:with)?in\s+(?:the\s+next\s+)?\d+\s+(?:days?|weeks?|months?|years?)"
    rf"|(?:by|before)\s+the\s+end\s+of\s+(?:this|next|the)?\s*"
    rf"(?:{_MONTHS_RE}|week|month|year|spring|summer|autumn|winter)"
    rf"|(?:by|before)\s+(?:{_MONTHS_RE}))\b",
    re.IGNORECASE,
)

# What has already been said, per reading session, so a line is never reused.
# Process-local on purpose: production runs one worker, so this is sufficient
# within a session, and it keeps this feature free of a schema change. A restart
# mid-session forgets the history, which costs at worst one repeated line.
_SAID: Dict[int, List[str]] = {}
_SAID_LIMIT = 256


def _normalise(text: str) -> str:
    return re.sub(r"[^a-z0-9 ]+", "", (text or "").casefold()).strip()


# Near-identical only. At 0.6 this caught ordinary warm phrasing: two different lines that
# both say "i'm here with you" share most of their small vocabulary and were treated as the
# same line. Warmth repeats words by nature — the thing worth catching is her being sent the
# same sentence twice, not two sentences that are both kind.
_REPEAT_OVERLAP = 0.85
_REPEAT_MIN_WORDS = 4


def _too_similar(candidate: str, previous: List[str]) -> bool:
    """The same line again, near enough that she would notice it was the same line."""
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
        # Two very short lines sharing words is a coincidence, not a repeat.
        if min(len(now_words), len(was_words)) < _REPEAT_MIN_WORDS:
            continue
        union = now_words | was_words
        if union and len(now_words & was_words) / len(union) >= _REPEAT_OVERLAP:
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

    Deliberately almost nothing. Three rules survive, and each one exists because breaking
    it does real damage:

      * it may not commit her to a reading that has not been written — a named card, a Life
        Path or Personal Year value, a specific timing window;
      * it may not talk about how the system works or narrate its own decisions;
      * it may not repeat, near-verbatim, something already said this session.

    Everything else is allowed, including every name, date, age, place and number the client
    has just given. Repeating her own facts back is how she knows she was heard.
    """
    from app.services.ai.reading_sabri import sanitize_delivery_text

    text = sanitize_delivery_text(candidate or "")
    if not text or not text.strip():
        return "empty"

    found = _TAROT_CARD.search(text)
    if found:
        return f"names a tarot card before the reading exists ({found.group(0)})"
    found = _NUMEROLOGY_VALUE.search(text)
    if found:
        return f"states a numerology value before the reading exists ({found.group(0)})"
    found = _TIMING_CLAIM.search(text)
    if found:
        return f"commits to a timing before the reading exists ({found.group(0)})"

    lowered = text.casefold()
    for phrase in _META_PHRASES:
        if phrase in lowered:
            return f"talks about its own prompt or narrates itself ({phrase})"

    try:
        from app.services.ai.reading_pipeline import is_return_acknowledgment

        if is_return_acknowledgment(text):
            return "return acknowledgement"
    except Exception:  # noqa: BLE001 - an optional guard must never block a send
        pass

    if _too_similar(text, previous):
        return "repeats an earlier line"
    return None


def _take_spoken_line(text: str) -> str:
    """The words she is meant to hear, with the delivery protocol stripped off.

    Sabri's system prompt is a *delivery* prompt: when it has no fresh reading
    material to relay it is supposed to emit ``@@RESERVE@@`` and explain itself.
    At the end of a session there is nothing fresh by definition, so it does
    exactly that, and the goodbye arrives as one good line followed by protocol
    machinery. Taking the first paragraph and cutting at the first marker keeps
    the line and discards the machinery, which is what the protocol means rather
    than a fight with it.
    """
    body = (text or "").strip()
    marker = re.search(r"@@|\n\s*\[", body)
    if marker:
        body = body[: marker.start()]
    paragraph = body.strip().split("\n\n", 1)[0]
    return paragraph.strip()


_NO_MESSAGE_FOR = {
    "close": ("She has not written since. The session is over and you are seeing "
              "her out; speak to the whole of it, not to a message."),
    "greet": ("She has just arrived and has not written yet. Greet her; do not "
              "answer anything."),
    "open": ("She has not written anything for you to answer. Speak to the "
             "moment itself, not to a message."),
}


def _build_user_turn(
    *,
    client_message: str,
    transcript: List[dict],
    previous: List[str],
    is_first_message: bool,
    moment: str = "open",
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
    # Only describe an arriving message when one actually arrived. The goodbye and
    # the greeting often have none, and an empty "WHAT SHE JUST WROTE:" header
    # invited the model to narrate the gap: one live goodbye came back as a note
    # that the instruction block was empty. Say what is true for the moment instead.
    if (client_message or "").strip():
        parts.append(f"WHAT SHE JUST WROTE:\n{client_message}")
        parts.append(
            "This is her first message of the session."
            if is_first_message
            else "The session is already under way."
        )
    else:
        parts.append(_NO_MESSAGE_FOR.get(moment, _NO_MESSAGE_FOR["open"]))
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
    # Sonnet, not Haiku. This line is the first thing a paying client reads, and it now has
    # to do something Haiku is not reliably good at: hear what she actually said and ask the
    # one question the reading is missing, in her situation, in her words. The extra second
    # is worth it — and it still lands long before the reading itself.
    return prompt + instruction, settings.FIRST_WORD_MODEL


def _load_context(
    chat_id: int,
    chat_session_id: Optional[int],
    message_id: Optional[int],
    require_message: bool = True,
) -> Optional[dict]:
    """One database round trip. Blocking — always call through asyncio.to_thread.

    Her message is read from the messages table by id, not from the session
    transcript: the transcript is written by a different part of the turn and is
    not guaranteed to contain her line yet at the moment this runs. Reading the
    row we were handed removes the ordering assumption entirely.
    """
    from app.database.client import SessionLocal
    from app.enums.chat_status import ChatStatus
    from app.enums.response_mode import ResponseMode
    from app.models.chat import Chat
    from app.models.message import Message
    from app.services.ai.reading_session import get_session_store

    with SessionLocal() as db:
        chat = db.get(Chat, chat_id)
        if chat is None:
            return {"skip": "no chat"}
        if chat.status != ChatStatus.ACTIVE:
            return {"skip": f"chat is {chat.status}"}
        # Only the automatic reading leaves her waiting on a model. In Hybrid the
        # owner is writing, and in Manual a human is; neither wants a bot
        # answering first.
        if getattr(chat, "response_mode", None) != ResponseMode.SABRI:
            return {"skip": f"mode is {getattr(chat, 'response_mode', None)}"}

        client_message = ""
        if message_id is not None:
            row = db.get(Message, message_id)
            if row is not None and not row.is_system and row.sender_id == chat.user_id:
                client_message = str(row.content or "")
        state = get_session_store().get(f"chat:{chat_id}")
        transcript = list(getattr(state, "chat_transcript", []) or []) if state else []
        if not client_message.strip():
            # The goodbye has no arriving message; it speaks to the whole session.
            for entry in reversed(transcript):
                if entry.get("role") == "client" and entry.get("content"):
                    client_message = str(entry["content"])
                    break
        if require_message and not client_message.strip():
            return {"skip": "no client message"}
        # Everything she has already heard from the reader, whoever sent it. The
        # in-process record only knows this module's own lines, so on its own it
        # let the goodbye repeat the last delivery bubble word for word.
        spoken = [
            str(entry["content"])
            for entry in transcript[-8:]
            if entry.get("role") == "logan" and entry.get("content")
        ]
        return {
            "client_message": client_message,
            "transcript": transcript,
            "spoken": spoken,
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
    message_id: Optional[int],
    instruction: str,
    deadline_seconds: float,
    started: float,
    event: str,
    moment: str = "open",
) -> bool:
    require_message = moment == "open"
    context = await asyncio.to_thread(
        _load_context, chat_id, chat_session_id, message_id, require_message
    )
    if context is None or context.get("skip"):
        # Never fail silently: an unexplained no-op is indistinguishable from a
        # bug, which is exactly how the first attempt at this hid itself.
        logger.info("reading_first_word_skipped", chat_id=chat_id,
                    reason=(context or {}).get("skip", "no context"))
        return False

    previous = already_said(chat_session_id)
    for line in context.get("spoken") or ():
        if line not in previous:
            previous.append(line)
    system_block, model = await asyncio.to_thread(_resolve_prompt, instruction)
    user_turn = _build_user_turn(
        client_message=context["client_message"],
        transcript=context["transcript"],
        previous=previous,
        is_first_message=context["is_first_message"],
        moment=moment,
    )

    from app.services.ai.reading_sabri import sanitize_delivery_text

    # A rejection is a reason to try again, not a reason to leave her alone. She
    # cannot tell the difference between a filter firing and nobody being there,
    # and the empty minute is the whole problem this module exists to solve.
    line = ""
    source = "model"
    attempts: List[str] = []
    for attempt in range(2):
        if time.perf_counter() - started > deadline_seconds:
            attempts.append("deadline")
            break
        turn = user_turn if attempt == 0 else user_turn + _RETRY_NOTE.format(
            reason=attempts[-1] if attempts else "it broke the rules"
        )
        raw, stop_reason = await asyncio.to_thread(_generate, system_block, turn, model)
        candidate = _take_spoken_line(raw)
        # Truncation only matters if it landed inside the spoken line itself. If
        # the cut fell in the protocol block that follows it, her line is whole.
        if stop_reason == "max_tokens" and candidate == (raw or "").strip():
            attempts.append("truncated")
            continue
        reason = _reject_reason(candidate, previous)
        if reason:
            attempts.append(reason)
            # The EXACT text and the EXACT reason. A truncated candidate made it impossible
            # to tell an over-strict rule from a genuinely bad line, which is how a rule that
            # rejected every mention of a name survived until a client saw the same canned
            # sentence from two different readers.
            logger.warning("reading_first_word_rejected", chat_id=chat_id, reason=reason,
                           attempt=attempt + 1, candidate=candidate or "")
            continue
        line = sanitize_delivery_text(candidate).strip()
        break

    if not line:
        # Nothing the model produced was safe to send. Say something true and
        # empty of substance rather than nothing at all.
        line = _fallback_line(previous, moment)
        source = "fallback"
        if not line:
            logger.error("reading_first_word_rejected", chat_id=chat_id,
                         reason="no fallback left", attempts=attempts)
            return False
        # LOUD. With the guard stripped back to three rules this should be close to never,
        # so every occurrence is a signal that something is wrong — not routine.
        logger.error("reading_first_word_fallback_fired", chat_id=chat_id,
                     chat_session_id=chat_session_id, attempts=attempts, line=line,
                     note="a canned line reached a client; the model's own attempts were all rejected")

    sent = await asyncio.to_thread(_send, chat_id, chat_session_id, line)
    if not sent:
        return False

    from app.manager import manager

    await manager.send_to_chat(message=sent["payload"], chat_id=str(chat_id))
    remember(chat_session_id, line)
    # She has said something; from here she is visibly writing until the reading lands. The
    # client clears its own indicator whenever a message arrives, so this has to come AFTER
    # the line, not before it, or it would be switched straight back off.
    if event == "reading_first_word_sent":
        try:
            from app.services.ai import reading_executor

            await reading_executor.broadcast_typing(
                chat_id, True, sent["payload"].get("sender_id")
            )
        except Exception:  # noqa: BLE001 — a typing hiccup never breaks the line itself
            pass
    total_ms = int((time.perf_counter() - started) * 1000)
    logger.info(
        event,
        chat_id=chat_id,
        chat_session_id=chat_session_id,
        elapsed_ms=total_ms,
        over_target=total_ms > int(FIRST_WORD_TARGET_SECONDS * 1000),
        source=source,
        attempts=len(attempts) + (0 if source == "fallback" else 1),
        words=len(line.split()),
    )
    return True


async def speak_now(
    chat_id: int,
    chat_session_id: Optional[int],
    arrived_at: float,
    message_id: Optional[int] = None,
    read_pause_seconds: float = 0.0,
) -> None:
    """The immediate human response. Never awaited by the caller, never raises.

    It waits out the read pause first. Landing this line in three seconds flat is right for
    "hey" and wrong for a twenty-line letter — nobody reads all that and reacts inside three
    seconds, and arriving too fast reads as a machine just as clearly as arriving too slow.
    The deadline is measured from the end of the pause, not from her message."""
    try:
        if read_pause_seconds > 0:
            await asyncio.sleep(read_pause_seconds)
        started = arrived_at + read_pause_seconds
        await asyncio.wait_for(
            _speak(
                chat_id=chat_id,
                chat_session_id=chat_session_id,
                message_id=message_id,
                instruction=PASS_ONE_INSTRUCTION,
                deadline_seconds=FIRST_WORD_DEADLINE_SECONDS,
                started=started,
                event="reading_first_word_sent",
            ),
            timeout=FIRST_WORD_DEADLINE_SECONDS + 2.0,
        )
    except asyncio.TimeoutError:
        logger.info("reading_first_word_rejected", chat_id=chat_id, reason="timeout")
    except Exception as error:  # noqa: BLE001 - she simply waits, exactly as before
        logger.warning("reading_first_word_failed", chat_id=chat_id,
                       error_type=type(error).__name__)


def greet_now(chat_id: int, chat_session_id: Optional[int]) -> None:
    """Say hello, in the reader's own words, without holding up the join.

    Fire and forget so the join endpoint still returns immediately. If it
    produces nothing she simply arrives to a quiet room and speaks first, which
    is what happens on every other platform anyway.
    """
    started = time.perf_counter()
    try:
        task = asyncio.create_task(_greet(chat_id, chat_session_id, started))
    except RuntimeError:
        return                       # no running loop: the join is unaffected
    task.add_done_callback(lambda finished: finished.cancelled() or finished.exception())


async def _greet(chat_id: int, chat_session_id: Optional[int], started: float) -> None:
    try:
        await asyncio.wait_for(
            _speak(
                chat_id=chat_id,
                chat_session_id=chat_session_id,
                message_id=None,
                instruction=GREETING_INSTRUCTION,
                moment="greet",
                deadline_seconds=GREETING_DEADLINE_SECONDS,
                started=started,
                event="reading_greeting_sent",
            ),
            timeout=GREETING_DEADLINE_SECONDS + 1.0,
        )
    except asyncio.TimeoutError:
        logger.info("reading_greeting_rejected", chat_id=chat_id, reason="timeout")
    except Exception as error:  # noqa: BLE001 - a missing hello must never break a join
        logger.warning("reading_greeting_failed", chat_id=chat_id,
                       error_type=type(error).__name__)


async def say_goodbye(chat_id: int, chat_session_id: Optional[int]) -> None:
    """The last thing she hears. Awaited by session teardown, never raises."""
    started = time.perf_counter()
    try:
        await asyncio.wait_for(
            _speak(
                chat_id=chat_id,
                chat_session_id=chat_session_id,
                message_id=None,
                instruction=CLOSING_INSTRUCTION,
                moment="close",
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
