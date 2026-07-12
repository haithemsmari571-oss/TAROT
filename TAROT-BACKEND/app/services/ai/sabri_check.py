"""Sabri — the fast compliance-and-quality checker.

Takes Valentina's draft and judges it against a rubric with a cheap Haiku-tier
model: does it contradict what the dossier says was already covered, does it make
overreaching claims (medical/legal/certainty-of-death type statements), does it
match the intended reader tone. Returns a pass/fail verdict plus short flags the
pipeline feeds back to Valentina for a redraft.

Sabri's rubric IS defined here (it is a checker, not the reader persona), and it
mirrors the platform's existing compliance rules (see the content-engine
defaults). A verdict that can't be parsed is treated as a FAIL — the safe default
is to route to a human, never to auto-send an unchecked reply.
"""

from sqlalchemy.orm import Session

from app.config import get_app_settings
from app.logging_config import get_logger
from app.models.chat import Chat
from app.services.ai import client as ai_client

logger = get_logger(__name__)


SABRI_SYSTEM_PROMPT = """You are Sabri, a strict compliance-and-quality checker for a tarot / psychic love-reading service. You are given a DRAFT reply written in the reader's voice, plus the client's dossier and the message it answers. Judge the draft ONLY against the rubric below and return ONLY JSON.

REJECT the draft (passed = false) if ANY of these are true:
1. CONTRADICTION — it repeats, re-asks, or contradicts something the dossier notes say was already covered or known about this client (makes them repeat themselves, or states the opposite of a known fact).
2. OVERREACHING CLAIMS — it makes guaranteed predictions about external events or other people's actions ("he will text you", "money is coming", "they will come back"), gives medical advice or health claims, gives legal advice, gives financial advice, or makes any certainty-of-death / mortality statement.
3. TONE — it does not match a warm, emotionally-precise, reflective reader voice: it is cold, robotic, generic horoscope filler, breaks character, or is otherwise off-tone.

PASS the draft (passed = true) only if it is clean on all three.

Return ONLY a JSON object — no markdown fences, no commentary — exactly:
{"passed": true, "flags": [], "reason": "one short line"}
or
{"passed": false, "flags": ["short reason", "short reason"], "reason": "one short line"}
The "flags" are short, actionable notes the drafter will use to fix the reply."""


def build_check_prompt(db: Session, chat: Chat, draft: str, client_message: str) -> str:
    from app.services.ai.reading_assistant import _dossier_context

    dossier = _dossier_context(db, chat.user_id)
    return "\n".join(
        [
            "CLIENT DOSSIER:",
            dossier,
            "",
            "THE CLIENT SAID:",
            client_message,
            "",
            "DRAFT REPLY TO CHECK:",
            draft,
            "",
            "Judge the draft against the rubric and return the JSON verdict.",
        ]
    )


def check_draft(db: Session, chat: Chat, draft: str, client_message: str) -> dict:
    """Check a draft. Blocking (calls the model) — run in a thread.
    Returns {"passed": bool, "flags": [str], "reason": str}. On any error or
    unparseable output, returns a FAIL (routes to a human)."""
    settings = get_app_settings()
    user_content = build_check_prompt(db, chat, draft, client_message)
    try:
        result = ai_client.run_chat(
            system=SABRI_SYSTEM_PROMPT,
            user_content=user_content,
            model=settings.SABRI_CHECK_MODEL,
            max_tokens=settings.SABRI_CHECK_MAX_TOKENS,
        )
        verdict = ai_client.parse_json_object(result.get("text") or "")
    except Exception as e:  # noqa: BLE001 — never let a checker error auto-send
        logger.warning("sabri_check_failed_defaulting_to_fail", chat_id=chat.id, error=str(e))
        return {
            "passed": False,
            "flags": ["Sabri could not verify this draft (check error) — needs a human."],
            "reason": "check_error",
        }

    passed = bool(verdict.get("passed"))
    flags = verdict.get("flags") or []
    if not isinstance(flags, list):
        flags = [str(flags)]
    reason = str(verdict.get("reason") or "")
    logger.info("sabri_checked", chat_id=chat.id, passed=passed, flag_count=len(flags))
    return {"passed": passed, "flags": [str(f) for f in flags], "reason": reason}
