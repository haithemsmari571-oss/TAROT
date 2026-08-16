"""The living session capsule — what the reader remembers while a reading is running.

Both roles used to see the last twenty transcript entries and nothing else. At roughly
eight messages a turn that is about two turns of memory, so by minute forty of a
three-hour reading Valentina was writing to a client she could no longer remember, and
the repeats and contradictions that produced were not a prompt problem. They were an
amnesia problem.

The capsule replaces that window. It has two parts and they are governed by different
rules, because they fail in different ways.

THE FACTS BLOCK never passes through a summariser. Not once, not ever. It is every card
named to the client, every number, life path, personal year, zodiac sign, name, date of
birth, prediction and timing window she has been given, plus everything she has said about
her own life in her own words. A summariser that rounds "life path 5" to "a five energy",
or quietly drops the ex-husband's name, has destroyed the only thing in a psychic reading
that cannot be reconstructed. So this half is assembled deterministically from the
commitment ledger and from her own messages, verbatim, and it stays that way all session.

THE NARRATIVE does compress, and compression here is ADDITIVE ONLY. Each pass is shown the
existing summary purely as context and writes a NEW paragraph covering only the turns that
have not been folded yet; the code appends it. The previous text is never rewritten,
re-summarised or shortened, because a summary of a summary is how a session quietly forgets
what happened in its first hour. The most recent turns are always present word for word.

Compression triggers on SIZE, never on elapsed time, and runs BETWEEN turns while the client
is reading what was just sent — never during generation, and never on the delivery path.
"""

from __future__ import annotations

import asyncio

from app.logging_config import get_logger

logger = get_logger(__name__)

# Fold when the verbatim tail passes this, and leave this much of it verbatim afterwards.
# Characters, not turns: a turn is whatever length Sabri decided it was.
CAPSULE_FOLD_ABOVE_CHARS = 6000
CAPSULE_KEEP_VERBATIM_CHARS = 3000
# Her own words are never summarised, but they are not unbounded either. Nothing is dropped
# silently — passing this logs, loudly, with the count.
CAPSULE_CLIENT_FACTS_MAX = 120

_NARRATIVE_SYSTEM = (
    "You keep the running notes for a psychic reader during a long live reading. You are "
    "given the notes so far, and then the part of the conversation that happened AFTER "
    "those notes were written.\n\n"
    "Write ONE short paragraph covering ONLY the new part. Cover: what was talked about, "
    "what she was worried about, how her mood moved, and what was left open or unanswered.\n\n"
    "Never rewrite, restate, correct or summarise the earlier notes — they are shown to you "
    "only so your paragraph continues from them instead of repeating them. Do not repeat a "
    "point they already make.\n\n"
    "Do not include card names, numbers, dates, life path or personal year values, zodiac "
    "signs or timing predictions. Those are recorded separately and exactly; repeating them "
    "here from memory risks changing them. Write about what happened between two people.\n\n"
    "Reply with the paragraph alone. No heading, no preamble, no bullet points."
)


def _entry_text(entry) -> str:
    role = "client" if entry.get("role") == "client" else "you"
    return f"{role}: {entry.get('content', '')}"


def _client_facts(state) -> list:
    """Everything she has told the reader about her life, in her own words, in order."""
    said = [
        str(entry.get("content", "")).strip()
        for entry in (getattr(state, "chat_transcript", None) or [])
        if entry.get("role") == "client" and str(entry.get("content", "")).strip()
    ]
    if len(said) > CAPSULE_CLIENT_FACTS_MAX:
        logger.warning(
            "reading_capsule_client_facts_capped",
            total=len(said),
            kept=CAPSULE_CLIENT_FACTS_MAX,
            dropped=len(said) - CAPSULE_CLIENT_FACTS_MAX,
        )
        # Keep the OLDEST, because the newest are still verbatim in the recent tail below.
        said = said[:CAPSULE_CLIENT_FACTS_MAX]
    return said


def format_capsule(state) -> str:
    """Render the whole capsule for a prompt. Pure — never calls a model or a database.

    Order matters: facts first (they are load-bearing and must not be skimmed past), then
    what has happened so far, then the recent conversation word for word."""
    from app.services.ai.reading_ledger import format_ledger_block

    transcript = getattr(state, "chat_transcript", None) or []
    folded = max(0, min(int(getattr(state, "capsule_folded_upto", 0) or 0), len(transcript)))
    parts = []

    said = _client_facts(state)
    established = format_ledger_block(getattr(state, "commitment_ledger", None))
    if said or established:
        block = [
            "SESSION FACTS (exact, never summarised — established with this client in this "
            "reading. Do not contradict any of it, and do not re-deliver it as if it were new):"
        ]
        if said:
            block.append("What she has told you, in her own words:")
            block.extend(f"  - {line}" for line in said)
        if established:
            block.append(established)
        parts.append("\n".join(block))

    narrative = (getattr(state, "capsule_narrative", "") or "").strip()
    if narrative:
        parts.append(
            "EARLIER IN THIS READING (running notes, oldest first — this is a summary of the "
            "part of the conversation that has scrolled out of view):\n" + narrative
        )

    recent = transcript[folded:]
    if recent:
        parts.append(
            "THE CONVERSATION RIGHT NOW (word for word, most recent last):\n"
            + "\n".join(_entry_text(entry) for entry in recent)
        )
    return "\n\n".join(parts)


def _verbatim_chars(state) -> int:
    transcript = getattr(state, "chat_transcript", None) or []
    folded = max(0, min(int(getattr(state, "capsule_folded_upto", 0) or 0), len(transcript)))
    return sum(len(_entry_text(entry)) for entry in transcript[folded:])


def needs_fold(state) -> bool:
    """Size, not time. A slow hour of short messages must not trigger a fold; a fast ten
    minutes of long ones must."""
    return _verbatim_chars(state) > CAPSULE_FOLD_ABOVE_CHARS


def _fold_boundary(transcript, folded: int) -> int:
    """The index up to which entries should be folded, leaving the verbatim tail intact."""
    kept = 0
    boundary = len(transcript)
    for index in range(len(transcript) - 1, folded - 1, -1):
        kept += len(_entry_text(transcript[index]))
        if kept > CAPSULE_KEEP_VERBATIM_CHARS:
            boundary = index + 1
            break
        boundary = index
    return max(folded, min(boundary, len(transcript)))


def _extend_narrative(previous: str, new_entries: list) -> str:
    """One cheap model call → the NEW paragraph only. Blocking; call in a thread."""
    from app.config import get_app_settings
    from app.services.ai import client as ai_client

    settings = get_app_settings()
    user_content = (
        "NOTES SO FAR (context only — do not rewrite or repeat these):\n"
        + (previous.strip() or "(nothing yet — this is the first stretch of the reading)")
        + "\n\nTHE NEW PART OF THE CONVERSATION:\n"
        + "\n".join(_entry_text(entry) for entry in new_entries)
    )
    result = ai_client.run_chat(
        system=_NARRATIVE_SYSTEM,
        user_content=user_content,
        model=settings.CONTENT_MODEL,
        max_tokens=400,
    )
    return (result.get("text") or "").strip()


def fold_now(state) -> bool:
    """Fold one batch of older turns into the narrative. Blocking; call in a thread.

    Returns True when the narrative actually grew. Mutates ``state`` in place; the caller
    owns persistence. Never raises — a failed fold leaves the capsule exactly as it was and
    the next turn simply tries again with a slightly longer tail."""
    transcript = list(getattr(state, "chat_transcript", None) or [])
    folded = max(0, min(int(getattr(state, "capsule_folded_upto", 0) or 0), len(transcript)))
    boundary = _fold_boundary(transcript, folded)
    new_entries = transcript[folded:boundary]
    if not new_entries:
        return False
    previous = (getattr(state, "capsule_narrative", "") or "").strip()
    try:
        paragraph = _extend_narrative(previous, new_entries)
    except Exception as error:  # noqa: BLE001 — memory upkeep must never break a reading
        logger.warning(
            "reading_capsule_fold_failed",
            chat_id=getattr(state, "chat_id", None),
            error_type=type(error).__name__,
        )
        return False
    if not paragraph:
        return False
    # ADDITIVE: the previous text is carried through untouched and the new paragraph is
    # appended after it. Nothing that was already written is ever sent back to a model to be
    # rewritten, which is the whole reason this is safe to run repeatedly for three hours.
    state.capsule_narrative = f"{previous}\n\n{paragraph}".strip() if previous else paragraph
    state.capsule_folded_upto = boundary
    logger.info(
        "reading_capsule_folded",
        chat_id=getattr(state, "chat_id", None),
        entries_folded=len(new_entries),
        folded_upto=boundary,
        narrative_chars=len(state.capsule_narrative),
    )
    return True


async def maybe_fold(chat_id: int) -> None:
    """Fold between turns if the capsule has grown past its size trigger.

    Called AFTER delivery has finished, never during generation, and fired without being
    awaited so it cannot add a millisecond to any turn. It re-reads the live state and
    mutates only the two capsule fields, so a turn that starts underneath it keeps its own
    transcript writes."""
    from app.services.ai.reading_session import get_session_store

    try:
        store = get_session_store()
        state = store.get(f"chat:{chat_id}")
        if state is None or not needs_fold(state):
            return
        if await asyncio.to_thread(fold_now, state):
            await asyncio.to_thread(store.put, state)
    except Exception as error:  # noqa: BLE001 — never surface into the reading
        logger.warning(
            "reading_capsule_maybe_fold_failed",
            chat_id=chat_id,
            error_type=type(error).__name__,
        )


def schedule_fold(chat_id: int) -> None:
    """Fire-and-forget the between-turns fold. Safe with no running loop."""
    try:
        task = asyncio.create_task(maybe_fold(chat_id))
    except RuntimeError:
        return
    task.add_done_callback(lambda done: done.cancelled() or done.exception())
