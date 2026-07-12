"""Valentina — the AI reading-reply drafter.

Given a live chat and an incoming client message, pull the client's full dossier
(stats + every note) plus the recent transcript, build a context-rich prompt, and
ask a Sonnet-tier model to draft the reader's next reply in Valentina's voice.

The persona/system prompt below is an intentionally-empty PLACEHOLDER — Logan
writes the real Valentina persona there. Everything else (context assembly, the
model call, redraft feedback) is code and lives around it.
"""

from typing import Optional

from sqlalchemy import asc
from sqlalchemy.orm import Session

from app.config import get_app_settings
from app.logging_config import get_logger
from app.models.chat import Chat
from app.models.message import Message
from app.services.ai import client as ai_client

logger = get_logger(__name__)


# ─────────────────────────────────────────────────────────────────────────────
# VALENTINA PERSONA — EDIT THIS.
#
# This is the ONLY place Valentina's voice lives. It is deliberately left as a
# placeholder: write the real persona/system prompt here (tone, boundaries,
# how she addresses the client, compliance style, length, etc.). Do not scatter
# persona text elsewhere — the rest of this file just assembles context and
# calls the model.
# ─────────────────────────────────────────────────────────────────────────────
VALENTINA_SYSTEM_PROMPT = """<<< VALENTINA PERSONA GOES HERE — REPLACE THIS PLACEHOLDER >>>

(Logan: write Valentina's full persona / system prompt in this constant. This
placeholder text is intentionally not a real persona. Until you replace it the
pipeline still runs end to end, but the replies will only be as good as this
placeholder — so this is the first thing to fill in.)
"""

# How many recent messages to include as conversation context.
_TRANSCRIPT_LIMIT = 20


def _recent_transcript(db: Session, chat: Chat, limit: int = _TRANSCRIPT_LIMIT) -> str:
    """The last `limit` messages, oldest-first, labelled Client / Reader / System."""
    rows = (
        db.query(Message)
        .filter(Message.chat_id == chat.id)
        .order_by(asc(Message.id))
        .all()
    )
    rows = rows[-limit:]
    lines = []
    for m in rows:
        if m.is_system:
            who = "System"
        elif m.sender_id == chat.user_id:
            who = "Client"
        else:
            who = "Reader"
        lines.append(f"{who}: {m.content}")
    return "\n".join(lines) if lines else "(no prior messages)"


def _dossier_context(db: Session, client_id: int) -> str:
    """Compact, human-readable dossier: astrology, returning status, spend and
    every note written about this client — the memory Valentina should use."""
    # Imported here to avoid a circular import (client_dossier imports nothing
    # from this module, but keep the dependency one-directional at import time).
    from app.services.client_dossier import get_client_dossier

    dossier = get_client_dossier(db, client_id)
    if not dossier:
        return "(no dossier on file — treat as a brand-new client)"

    client = dossier.get("client", {})
    stats = dossier.get("stats", {})
    notes = dossier.get("notes", [])

    parts = [
        f"Name: {client.get('username')}",
        f"Zodiac: {client.get('zodiac')}  Life path: {client.get('life_path')}",
        f"Returning client: {'yes' if stats.get('is_returning') else 'no (first time)'}",
        f"Past readings: {stats.get('session_count', 0)}  "
        f"Lifetime spend: £{stats.get('lifetime_spend', 0)}",
    ]
    if notes:
        parts.append("Notes from past readings (most recent first):")
        for n in notes[:15]:
            tag = "[AI]" if n.get("source") == "AI_ATLAS" else ""
            parts.append(f"  - {tag}{n.get('title') or ''}: {n.get('note')}")
    else:
        parts.append("Notes: (none yet)")
    return "\n".join(parts)


def build_draft_prompt(
    db: Session,
    chat: Chat,
    client_message: str,
    feedback: Optional[dict] = None,
) -> str:
    """Assemble the user-turn content for Valentina (dossier + transcript +
    the message to answer, plus Sabri's feedback on a redraft)."""
    dossier = _dossier_context(db, chat.user_id)
    transcript = _recent_transcript(db, chat)

    sections = [
        "CLIENT DOSSIER (their history — use it, don't make them repeat themselves):",
        dossier,
        "",
        "RECENT CONVERSATION:",
        transcript,
        "",
        "THE CLIENT JUST SAID:",
        client_message,
        "",
        "Write the reader's next reply to the client. Reply with the message text "
        "only — no preamble, no labels, no quotation marks.",
    ]

    if feedback:
        flags = feedback.get("flags") or []
        prev = feedback.get("previous_draft") or ""
        sections = [
            "Your previous draft was REJECTED by the compliance/quality check.",
            "Previous draft:",
            prev,
            "",
            "Problems to fix:",
            "\n".join(f"  - {f}" for f in flags) or "  - (see reason)",
            "",
            "Rewrite the reply so it fixes every problem above while staying in "
            "Valentina's voice.",
            "",
        ] + sections

    return "\n".join(sections)


def generate_draft(
    db: Session,
    chat: Chat,
    client_message: str,
    feedback: Optional[dict] = None,
) -> str:
    """Draft the reader's reply. Blocking (calls the model) — run in a thread.
    Returns the draft text. Raises if the AI client is not configured / errors."""
    settings = get_app_settings()
    system = VALENTINA_SYSTEM_PROMPT
    user_content = build_draft_prompt(db, chat, client_message, feedback)
    result = ai_client.run_chat(
        system=system,
        user_content=user_content,
        model=settings.READING_DRAFT_MODEL,
        max_tokens=settings.READING_DRAFT_MAX_TOKENS,
    )
    draft = (result.get("text") or "").strip()
    logger.info(
        "valentina_drafted",
        chat_id=chat.id,
        chars=len(draft),
        redraft=bool(feedback),
        cost_usd=result.get("cost_usd"),
    )
    return draft
