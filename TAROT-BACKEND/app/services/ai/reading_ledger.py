"""Deterministic commitment ledger for one reading session.

After each turn that is actually DELIVERED to the client (an approved Hybrid
draft, a manual operator message, or an Automatic reveal), this module extracts
the concrete commitments in that text — openly-named tarot cards and timing
windows — and appends them to ``state.commitment_ledger``. The ledger is then
re-injected into Valentina's next turn as an "already established this session"
block, so an early-session card or timing window can't be contradicted after
the rolling transcript window has aged it out.

Deliberately regex-only this round (no AI extraction pass): cheap, instant,
and auditable. Drafts that are discarded or regenerated NEVER touch the ledger
— a redo is a competing candidate, not a memory turn; memory advances only on
delivery.
"""

from __future__ import annotations

import re
from typing import List, Optional

# ── Tarot card names ─────────────────────────────────────────────────────────
# Minor arcana ("Queen of Cups") is unambiguous. Major arcana needs care: words
# like Moon, Star, Strength, Death occur in normal prose, so matching is
# CASE-SENSITIVE on the capitalized card word ("the Moon came up" is a card;
# "the moon was out" is scenery). A rare capitalized false positive (e.g.
# "Death" opening a sentence) is low-harm: the ledger is advisory context.
_RANKS = "Ace|Two|Three|Four|Five|Six|Seven|Eight|Nine|Ten|Page|Knight|Queen|King"
_SUITS = "Cups|Wands|Swords|Pentacles|Coins"
_MAJORS = (
    "Fool|Magician|High Priestess|Empress|Emperor|Hierophant|Lovers|Chariot|"
    "Strength|Hermit|Wheel of Fortune|Justice|Hanged Man|Death|Temperance|"
    "Devil|Tower|Star|Moon|Sun|Judgement|Judgment|World"
)
_CARD_RE = re.compile(
    rf"\b(?:(?:[Tt]he\s+)(?P<major>{_MAJORS})|(?P<minor>(?:{_RANKS})\s+of\s+(?:{_SUITS}))"
    rf"|(?P<bare>Strength|Justice|Temperance|Judgement|Judgment))\b"
)
_REVERSED_RE = re.compile(r"\breversed\b", re.I)

# ── Timing windows ───────────────────────────────────────────────────────────
# One phrase per commitment, trimmed. Months/seasons with optional early/mid/
# late, and "within/in the next N days/weeks/months" shapes.
_MONTHS = (
    "January|February|March|April|May|June|July|August|September|October|"
    "November|December"
)
_SEASONS = "spring|summer|autumn|fall|winter"
_TIMING_RE = re.compile(
    rf"\b(?:(?:by|before|around|until|into|through)\s+)?"
    rf"(?:(?:early|mid|late)[-\s])?"
    rf"(?:(?:{_MONTHS})\b|(?:{_SEASONS})\b(?!\s+(?:in|of)\s+her)|"
    rf"(?:within|in)\s+the\s+next\s+\w+\s+(?:days?|weeks?|months?)|"
    rf"within\s+\w+\s+(?:days?|weeks?|months?))",
    re.I,
)
# Months only count as timing when the sentence is actually about time coming —
# bare month mentions inside quoted history ("they met in May") are noise. The
# heuristic: keep a month/season hit only if a future-ish cue appears near it.
_FUTURE_CUE_RE = re.compile(
    r"\b(?:by|before|around|until|window|shift|turn|opens?|closes?|comes?|"
    r"coming|arrives?|expect|watch|toward|into|through|when)\b",
    re.I,
)

MAX_LEDGER_ENTRIES = 40


def _card_value(match: re.Match, text: str) -> str:
    name = match.group("major") or match.group("minor") or match.group("bare")
    if match.group("major"):
        name = f"The {name}"
    # Polarity: "reversed" only counts when it sits in THIS card's own clause —
    # bounded by punctuation on both sides — otherwise "the Moon reversed" in a
    # comma list would mark its neighbours reversed too.
    after = re.split(r"[,.;:\n]", text[match.end() : match.end() + 16], maxsplit=1)[0]
    before = re.split(r"[,.;:\n]", text[max(0, match.start() - 12) : match.start()])[-1]
    reversed_here = _REVERSED_RE.search(after) or _REVERSED_RE.search(before)
    return f"{name} (reversed)" if reversed_here else name


def extract_commitments(text: str) -> List[dict]:
    """All card/timing commitments found in one delivered text, in order."""
    if not text:
        return []
    found: List[dict] = []
    for m in _CARD_RE.finditer(text):
        found.append({"kind": "card", "value": _card_value(m, text)})
    for m in _TIMING_RE.finditer(text):
        phrase = m.group(0).strip(" ,.;")
        # "within N weeks"-style windows are inherently forward-looking; only
        # bare month/season mentions need a nearby future cue to count.
        if not re.match(r"(?:within|in)\b", phrase, re.I):
            context = text[max(0, m.start() - 60) : m.end() + 60]
            if not _FUTURE_CUE_RE.search(context):
                continue
        found.append({"kind": "timing", "value": phrase[:60]})
    return found


def record_commitments(state, delivered_text: str) -> int:
    """Append new commitments from a DELIVERED text to the session ledger.

    Dedupes on (kind, casefolded value) so re-mentioning The Tower doesn't grow
    the ledger; capped so the injected block stays small. Returns how many new
    entries were added. Never raises — a ledger failure must not break a turn.
    """
    # Atlas situation memory (Track A) piggybacks on this exact hook — the one
    # deterministic per-delivered-bubble point both live delivery paths share.
    # No-op unless SITUATION_MEMORY_ENABLED=true; fire-and-forget; writes ONLY
    # client_situation_records; wrapped so it can never affect the ledger or
    # the turn. Nothing reads that table back into replies yet (A-LIVE).
    try:
        from app.services.ai.situation_memory import record_situation

        record_situation(getattr(state, "chat_id", None), None, delivered_text)
    except Exception:  # noqa: BLE001
        pass
    try:
        existing = {
            (e.get("kind"), str(e.get("value", "")).casefold())
            for e in (state.commitment_ledger or [])
        }
        added = 0
        for entry in extract_commitments(delivered_text):
            key = (entry["kind"], entry["value"].casefold())
            if key in existing or len(state.commitment_ledger) >= MAX_LEDGER_ENTRIES:
                continue
            entry["turn"] = state.messages_sent_count
            state.commitment_ledger.append(entry)
            existing.add(key)
            added += 1
        return added
    except Exception:  # noqa: BLE001
        return 0


def format_ledger_block(ledger: Optional[List[dict]]) -> str:
    """The "already established" prompt block, or "" when there is nothing —
    callers must omit the block entirely on ""."""
    if not ledger:
        return ""
    lines = [
        f"- {'Card' if e.get('kind') == 'card' else 'Timing'}: {e.get('value')}"
        for e in ledger
    ]
    return (
        "ALREADY ESTABLISHED THIS SESSION (cards you have named openly and timing "
        "windows you have given so far — stay consistent with these; do not "
        "contradict them, and do not re-deliver them as if new):\n" + "\n".join(lines)
    )
