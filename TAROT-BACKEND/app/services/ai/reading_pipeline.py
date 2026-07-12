"""The AI reading pipeline — wires Valentina (draft) + Sabri (check) + delivery.

Called (fire-and-forget) when a client message arrives on an ACTIVE chat. The
per-conversation `response_mode` decides what happens:

- HUMAN  → nothing automated.
- HYBRID → Valentina drafts, Sabri checks, but the result ALWAYS goes to the
           admin panel for review/edit/send (never auto-sent), pass or fail.
- SABRI  → the full loop: Valentina drafts, Sabri checks; on a clean pass the
           reply is auto-sent as the reader. If Sabri still fails after
           SABRI_MAX_ATTEMPTS, the draft falls back to the admin panel.

The core loop (`run_pipeline_core`) is pure and synchronous so it can be unit
tested with fake draft/check functions; the async wrapper adds the model calls,
DB session and WebSocket delivery around it.
"""

import asyncio
import json
from typing import Callable, Optional

from sqlalchemy.orm import Session

from app.config import get_app_settings
from app.enums.ai_draft_status import AiDraftStatus
from app.enums.chat_status import ChatStatus
from app.enums.response_mode import ResponseMode
from app.logging_config import get_logger
from app.models.ai_draft import AiDraft
from app.models.chat import Chat

logger = get_logger(__name__)


def _create_ai_draft(
    db: Session,
    chat: Chat,
    client_message_id: Optional[int],
    draft: str,
    flags: list,
    passed: bool,
    attempts: int,
    mode: ResponseMode,
) -> AiDraft:
    row = AiDraft(
        chat_id=chat.id,
        client_message_id=client_message_id,
        mode=mode,
        draft_text=draft,
        sabri_flags=json.dumps(flags or []),
        sabri_passed=passed,
        attempts=attempts,
        status=AiDraftStatus.PENDING,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def run_pipeline_core(
    db: Session,
    chat: Chat,
    client_message_id: Optional[int],
    client_message: str,
    *,
    mode: ResponseMode,
    draft_fn: Callable[[Optional[dict]], str],
    check_fn: Callable[[str], dict],
    max_attempts: int,
) -> dict:
    """Run the draft→check→redraft loop and decide the outcome.

    draft_fn(feedback) -> draft text (feedback is None on the first attempt, else
    {"previous_draft", "flags", "reason"}).
    check_fn(draft) -> {"passed": bool, "flags": [str], "reason": str}.

    Returns one of:
      {"outcome": "skipped"}                      (HUMAN mode)
      {"outcome": "auto_send", "content", ...}    (SABRI clean pass — caller sends)
      {"outcome": "pending_review", "draft_id", "content", ...}
    """
    if mode == ResponseMode.HUMAN:
        return {"outcome": "skipped", "attempts": 0}

    attempts = 0
    feedback: Optional[dict] = None
    last_draft = ""
    last_flags: list = []
    passed = False

    while attempts < max_attempts:
        attempts += 1
        last_draft = draft_fn(feedback)
        verdict = check_fn(last_draft)
        last_flags = verdict.get("flags") or []
        if verdict.get("passed"):
            passed = True
            break
        feedback = {
            "previous_draft": last_draft,
            "flags": last_flags,
            "reason": verdict.get("reason", ""),
        }

    # HYBRID: always to the admin panel (never auto-send), pass or fail.
    if mode == ResponseMode.HYBRID:
        row = _create_ai_draft(
            db, chat, client_message_id, last_draft, last_flags, passed, attempts, mode
        )
        return {
            "outcome": "pending_review",
            "draft_id": row.id,
            "content": last_draft,
            "attempts": attempts,
            "passed": passed,
            "flags": last_flags,
        }

    # SABRI: auto-send on a clean pass.
    if passed:
        return {
            "outcome": "auto_send",
            "content": last_draft,
            "attempts": attempts,
            "passed": True,
            "flags": [],
        }

    # SABRI but still failing after the cap → fall back to manual review.
    row = _create_ai_draft(
        db, chat, client_message_id, last_draft, last_flags, passed, attempts, mode
    )
    return {
        "outcome": "pending_review",
        "draft_id": row.id,
        "content": last_draft,
        "attempts": attempts,
        "passed": False,
        "flags": last_flags,
    }


async def run_reading_pipeline(
    chat_id: int, client_message_id: Optional[int], client_message: str
) -> Optional[dict]:
    """Async entry point (background task). Loads the chat, runs the core loop
    (model calls off the event loop), and auto-sends on a clean SABRI pass."""
    settings = get_app_settings()
    if not settings.AI_DRAFTING_ENABLED:
        return None

    from app.services.ai import client as ai_client

    if not ai_client.is_configured():
        logger.info("reading_pipeline_skipped_ai_not_configured", chat_id=chat_id)
        return None

    from app.database.client import SessionLocal
    from app.services.ai import reading_assistant, sabri_check

    db = SessionLocal()
    try:
        chat = db.query(Chat).filter(Chat.id == chat_id).first()
        if not chat:
            return None
        if chat.status != ChatStatus.ACTIVE:
            logger.info(
                "reading_pipeline_skipped_not_active", chat_id=chat_id, status=chat.status.value
            )
            return None
        mode = chat.response_mode
        if mode == ResponseMode.HUMAN:
            return None

        def draft_fn(feedback: Optional[dict]) -> str:
            return reading_assistant.generate_draft(db, chat, client_message, feedback)

        def check_fn(draft: str) -> dict:
            return sabri_check.check_draft(db, chat, draft, client_message)

        result = await asyncio.to_thread(
            run_pipeline_core,
            db,
            chat,
            client_message_id,
            client_message,
            mode=mode,
            draft_fn=draft_fn,
            check_fn=check_fn,
            max_attempts=settings.SABRI_MAX_ATTEMPTS,
        )

        logger.info(
            "reading_pipeline_result",
            chat_id=chat_id,
            mode=mode.value,
            outcome=result.get("outcome"),
            attempts=result.get("attempts"),
            passed=result.get("passed"),
        )

        if result.get("outcome") == "auto_send":
            from app.services.chats import broadcast_ai_message

            await broadcast_ai_message(db, chat, result["content"])
        return result
    except Exception as e:  # noqa: BLE001 — a pipeline error must never crash the chat
        logger.error("reading_pipeline_error", chat_id=chat_id, error=str(e), exc_info=True)
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
        asyncio.create_task(
            run_reading_pipeline(chat_id, client_message_id, client_message)
        )
    except RuntimeError:
        # No running loop (shouldn't happen inside the WS handler). Skip rather
        # than block; the reply just stays manual for this message.
        logger.warning("reading_pipeline_no_event_loop", chat_id=chat_id)
