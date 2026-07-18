"""HYBRID mode coordinator (two_role engine): Valentina drafts, a HUMAN reviews and sends.

In HYBRID, Sabri is disabled outright — not gated afterward, skipped entirely. Valentina
still writes the complete draft for the turn; it is stored in ``ai_drafts`` as PENDING for
the existing admin review panel, and ONLY the human "Send as reader" action (the existing
send_draft endpoint) delivers it to the client. Nothing in this module broadcasts, shows a
typing indicator, or auto-sends — the reviewing-and-sending job Sabri normally does is the
human's.

Non-locked orchestration layer: HYBRID chats are intercepted in the message handler BEFORE
the auto pipeline is launched, so the locked engine coordinators are never entered for the
turn. Known, deliberate gap: under READING_ENGINE=single_agent (or the legacy engine) a
HYBRID chat still behaves exactly as SABRI — single_agent has no Valentina/Sabri split to
substitute a human into; that design is deferred.

Also owns ``cancel_ai_turns_for_mode_change``: switching a chat away from full-auto
(SABRI) cancels its in-flight/queued AI turns via the engines' EXISTING session-end cancel
primitives, instead of letting a stale turn finish or a queued redirect run as a full
extra AI turn.
"""
from __future__ import annotations

import asyncio
from typing import Dict, Set

from app.logging_config import get_logger

logger = get_logger(__name__)

# In-flight HYBRID draft generations per chat (for cancellation on switch to HUMAN).
_tasks: Dict[int, Set[asyncio.Task]] = {}


def is_generating(chat_id: int) -> bool:
    """True while a HYBRID draft generation is in flight for this chat — the signal the
    cockpit's "Valentina is writing…" indicator polls. Clears when the turn finishes,
    errors (swallowed inside the turn), or the process restarts (the generation died)."""
    return any(not t.done() for t in _tasks.get(chat_id, set()))


def _hybrid_applies(chat) -> bool:
    from app.config import get_app_settings
    from app.enums.response_mode import ResponseMode

    if chat is None or chat.response_mode != ResponseMode.HYBRID:
        return False
    if get_app_settings().READING_ENGINE != "two_role":
        # Deliberate gap: single_agent / legacy HYBRID keeps its current behaviour
        # (same as SABRI) until a design for it is decided.
        return False
    return True


def _launch(chat_id: int, client_message_id, client_message: str, user_id,
            *, record_message: bool) -> bool:
    try:
        task = asyncio.create_task(
            _run_hybrid_turn(chat_id, client_message_id, client_message, user_id,
                             record_message=record_message)
        )
    except RuntimeError:
        logger.warning("hybrid_no_event_loop", chat_id=chat_id)
        return True  # a HYBRID chat must never fall through to the auto-send pipeline
    _tasks.setdefault(chat_id, set()).add(task)
    task.add_done_callback(lambda t, cid=chat_id: _tasks.get(cid, set()).discard(t))
    logger.info("hybrid_turn_launched", chat_id=chat_id)
    return True


def maybe_launch_hybrid(chat_id: int, client_message_id, client_message: str, chat) -> bool:
    """Fire-and-forget one HYBRID draft turn when this chat should bypass the auto
    pipeline. Returns True when the message is HANDLED here (the caller must NOT launch
    the auto pipeline); False otherwise — SABRI/HUMAN chats and non-two_role engines are
    untouched and flow exactly as before."""
    if not _hybrid_applies(chat):
        return False
    return _launch(chat_id, client_message_id, client_message, chat.user_id,
                   record_message=True)


def launch_hybrid_regen(chat_id: int, client_message_id, client_message: str, chat) -> bool:
    """Manual "Generate new reply": run the SAME hybrid turn the automatic per-message
    trigger uses, on demand, against the client's latest message — but WITHOUT re-recording
    that message on the session transcript (the automatic run already recorded it; a
    duplicate would distort Valentina's conversation context). Returns False when hybrid
    doesn't apply to this chat (not HYBRID / wrong engine)."""
    if not _hybrid_applies(chat):
        return False
    return _launch(chat_id, client_message_id, client_message, chat.user_id,
                   record_message=False)


async def _run_hybrid_turn(chat_id: int, client_message_id, client_message: str, user_id,
                           *, record_message: bool = True) -> None:
    """One HYBRID turn: record the client message on the (durable) session state, run
    Valentina to a complete raw draft (reusing the two_role writer — which also writes the
    Phase-2 valentina_draft audit row), and store it as a PENDING ai_drafts row. No Sabri,
    no broadcast, no typing. An empty/failed draft stores nothing (never a fallback send —
    in HYBRID nothing reaches the client without a human action).

    ``record_message=False`` is the manual-regen path: the message was already recorded by
    the automatic run, so it is only re-used as Valentina's CLIENT MESSAGE (the newest
    client transcript entry is excluded from RECENT CONVERSATION to avoid duplication)."""
    from app.config import get_app_settings

    if not get_app_settings().AI_DRAFTING_ENABLED:
        return
    from app.services.ai import client as ai_client

    if not ai_client.is_configured():
        logger.info("hybrid_skipped_ai_not_configured", chat_id=chat_id)
        return
    try:
        from app.database.client import SessionLocal
        from app.enums.chat_status import ChatStatus
        from app.enums.response_mode import ResponseMode
        from app.models.chat import Chat

        # Fresh re-check: the chat may have ended (or the mode changed) since enqueue.
        with SessionLocal() as db:
            chat = db.query(Chat).filter(Chat.id == chat_id).first()
            if (
                not chat
                or chat.status != ChatStatus.ACTIVE
                or chat.response_mode != ResponseMode.HYBRID
            ):
                logger.info("hybrid_skipped_chat_state", chat_id=chat_id)
                return

        from app.services.ai import reading_duo
        from app.services.ai.reading_session import (
            create_session_state,
            get_session_store,
            record_client_message,
        )

        store = get_session_store()
        session_id = f"chat:{chat_id}"
        state = store.get(session_id)
        if state is None:
            state = create_session_state(
                session_id, client_id=user_id, chat_id=chat_id, is_first_session=True
            )
        if record_message:
            record_client_message(state, client_message)
            trigger_entry = state.chat_transcript[-1]
            store.put(state)
        else:
            # Manual regen: don't re-record; exclude the newest client entry (the message
            # being answered, recorded by the automatic run) from RECENT CONVERSATION.
            trigger_entry = next(
                (e for e in reversed(state.chat_transcript) if e.get("role") == "client"),
                None,
            )

        # Valentina writes the full draft — the SAME writer the two_role engine uses
        # (dossier + DOB numerology + transcript), which also logs the valentina_draft
        # audit row. Sabri is deliberately NOT called.
        text = await reading_duo._write_valentina_turn(
            chat_id, client_message, trigger_entry, state, user_id
        )
        if not (text or "").strip():
            logger.warning("hybrid_valentina_empty", chat_id=chat_id)
            return

        from app.enums.ai_draft_status import AiDraftStatus
        from app.enums.response_mode import ResponseMode as _RM
        from app.models.ai_draft import AiDraft

        with SessionLocal() as db:
            db.add(
                AiDraft(
                    chat_id=chat_id,
                    client_message_id=client_message_id,
                    mode=_RM.HYBRID,
                    draft_text=text,
                    sabri_flags=None,
                    sabri_passed=False,  # Sabri never ran — the human is the reviewer
                    attempts=1,
                    status=AiDraftStatus.PENDING,
                )
            )
            db.commit()
        logger.info("hybrid_draft_pending", chat_id=chat_id, chars=len(text))
    except asyncio.CancelledError:
        logger.info("hybrid_turn_cancelled", chat_id=chat_id)
        raise
    except Exception as e:  # noqa: BLE001 — a hybrid failure must never crash the chat
        logger.error("hybrid_turn_error", chat_id=chat_id, error=str(e), exc_info=True)


async def cancel_hybrid(chat_id: int) -> None:
    """Cancel any in-flight HYBRID draft generations for a chat. Safe when none run."""
    for task in list(_tasks.pop(chat_id, set()) or ()):
        if not task.done():
            task.cancel()
            try:
                await task
            except (asyncio.CancelledError, Exception):  # noqa: BLE001
                pass


async def handover_to_auto(chat_id: int, db, chat) -> None:
    """Switching TO Automatic (SABRI) must take over the conversation NOW, not only on
    the next message. Closes the silent-draft race found in live testing: a client
    message that arrived seconds before the switch had already been claimed by an
    in-flight HYBRID generation, whose output landed as a PENDING draft in a review
    queue the operator had just mentally left — the client saw nothing, the operator
    saw nothing, and no new message meant the auto engine never fired.

    So: cancel any in-flight HYBRID generation, and if the conversation is hanging on
    an unanswered client message (the chat's last non-system message is the client's),
    launch the real auto pipeline for it. Known narrow trade-off: if the cancelled
    hybrid turn had already recorded the message on the session transcript, the auto
    turn records it again (a duplicated context line — cosmetic, never client-visible
    as a duplicate reply). Never raises — the mode change must stand regardless."""
    try:
        await cancel_hybrid(chat_id)
        from app.models.message import Message

        last = (
            db.query(Message)
            .filter(Message.chat_id == chat_id, Message.is_system.is_(False))
            .order_by(Message.id.desc())
            .first()
        )
        if last is not None and last.sender_id == chat.user_id:
            from app.services.ai.reading_pipeline import maybe_launch_pipeline

            maybe_launch_pipeline(chat_id, last.id, last.content)
            logger.info("hybrid_handover_to_auto", chat_id=chat_id, message_id=last.id)
    except Exception as e:  # noqa: BLE001
        logger.warning("hybrid_handover_failed", chat_id=chat_id, error=str(e))


async def cancel_ai_turns_for_mode_change(chat_id: int, new_mode) -> None:
    """Switching a chat away from full-auto (to HUMAN or HYBRID) cancels its in-flight and
    queued AI turns — otherwise a stale generation/reveal finishes and a queued redirect
    still runs as a full extra AI turn after the switch. Reuses the engines' existing
    session-end cancel primitives (safe when nothing is running). Switching to HUMAN also
    cancels a pending HYBRID draft generation. Never raises: the mode change itself has
    already been committed and must stand even if a cancel hiccups."""
    from app.enums.response_mode import ResponseMode

    if new_mode == ResponseMode.SABRI:
        return  # switching TO full-auto interrupts nothing
    try:
        from app.services.ai import reading_duo, reading_executor, reading_reveal
        from app.services.ai.reading_pipeline import cancel_pipeline

        await cancel_pipeline(chat_id)               # legacy in-flight generation
        await reading_duo.cancel_reveal(chat_id)     # two_role turn + queued redirect
        await reading_reveal.cancel_reveal(chat_id)  # single_agent turn + queued redirect
        await reading_executor.cancel_delivery(chat_id)  # legacy delivery replay
        if new_mode == ResponseMode.HUMAN:
            await cancel_hybrid(chat_id)
        logger.info("mode_change_cancelled_ai_turns", chat_id=chat_id, mode=new_mode.value)
    except Exception as e:  # noqa: BLE001
        logger.warning("mode_change_cancel_failed", chat_id=chat_id, error=str(e))
