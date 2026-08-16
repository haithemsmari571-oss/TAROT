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

# ── The rest of the facts block ──────────────────────────────────────────────
# The capsule's facts half is built from this same extractor rather than a second one, so
# there is exactly one definition of "a fact this session established" to keep correct.
# Cards and timing (above) were always here; the four below are what a psychic reading
# cannot afford to lose track of over three hours, and what a summariser would blur first.
_LIFE_PATH_RE = re.compile(r"\b(life\s+path|personal\s+year)\s*:?\s*(\d{1,2})\b", re.I)
_ZODIAC_RE = re.compile(
    r"\b(aries|taurus|gemini|cancer|leo|virgo|libra|scorpio|sagittarius|capricorn|"
    r"aquarius|pisces)\b",
    re.I,
)
_DATE_RE = re.compile(
    rf"\b(?:\d{{1,2}}(?:st|nd|rd|th)?\s+(?:of\s+)?(?:{_MONTHS})(?:\s+\d{{4}})?"
    rf"|(?:{_MONTHS})\s+\d{{1,2}}(?:st|nd|rd|th)?(?:,?\s+\d{{4}})?"
    rf"|\d{{1,2}}[/-]\d{{1,2}}[/-]\d{{2,4}})\b",
    re.I,
)
# A capitalised run that is not sentence-initial, i.e. behaves like somebody's name. The
# same conservative test reading_sabri uses, kept deliberately narrow: a false positive
# clutters the facts block, which is cheap, where a false negative loses a person's name.
_NAME_RE = re.compile(r"(?<![.!?]\s)(?<!^)\b[A-Z][a-z]{2,}\b", re.M)
_NOT_A_NAME = (
    {
        "The", "And", "But", "She", "Her", "His", "You", "Your", "They", "Them", "This",
        "That", "There", "When", "What", "Where", "Why", "How", "Life", "Path", "Personal",
        "Year", "Card", "Cards", "Tower", "Moon", "Star", "Sun", "World", "Death", "Justice",
        "Strength", "Temperance", "Judgement", "Judgment", "Ace", "Page", "Knight", "Queen",
        "King", "Cups", "Wands", "Swords", "Pentacles", "Coins", "Fool", "Magician", "Empress",
        "Emperor", "Hierophant", "Lovers", "Chariot", "Hermit", "Wheel", "Fortune", "Hanged",
        "Devil", "Priestess", "High",
    }
    # A month or a sign is already captured as a date, a timing window or a sign. Letting it
    # through here as well would list "Name: March" in the facts block, which is not a person
    # and reads to the model as though the client mentioned somebody called March.
    | {month.capitalize() for month in _MONTHS.split("|")}
    | {season.capitalize() for season in _SEASONS.split("|")}
    | {
        "Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo", "Libra", "Scorpio",
        "Sagittarius", "Capricorn", "Aquarius", "Pisces",
    }
)

# Raised from 40 with the extractor's scope: this is now the facts half of the session
# capsule, holding names, dates, signs and numbers as well as cards and timing, over a
# reading that can run three hours. It is still a hard cap — the block must stay small
# enough to sit in front of every prompt — but 40 would have filled inside twenty minutes.
MAX_LEDGER_ENTRIES = 160


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
    """Every fact one piece of text establishes, in order.

    Cards and timing windows are what this always caught. Life path / personal year values,
    zodiac signs, dates and people's names are the rest of what the session capsule's facts
    block must hold exactly for three hours, and they are extracted here so there is one
    extractor to keep right rather than two that drift apart."""
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
    for m in _LIFE_PATH_RE.finditer(text):
        label = "life path" if m.group(1).lower().startswith("life") else "personal year"
        found.append({"kind": "number", "value": f"{label} {m.group(2)}"})
    for m in _ZODIAC_RE.finditer(text):
        found.append({"kind": "sign", "value": m.group(1).capitalize()})
    for m in _DATE_RE.finditer(text):
        found.append({"kind": "date", "value": m.group(0).strip()[:40]})
    for word in _names_in(text):
        found.append({"kind": "name", "value": word})
    return found


def _names_in(text: str) -> List[str]:
    """People's names, using the delivery layer's own proper-name test where available.

    reading_sabri already had to solve this exact problem — telling "Daniel" from a sentence
    that happens to start with "For" — and solved it better than a capitalisation rule can:
    a capital earns the right to be treated as a name if it appears somewhere a full stop
    does not explain, or if the word is never written in lower case anywhere in the text. That
    is reused rather than reimplemented, so the two cannot drift apart. The local pattern below
    is the fallback if that import ever goes away."""
    try:
        from app.services.ai.reading_sabri import _auto_name_matches

        candidates = [match.group(0) for match in _auto_name_matches(text)]
    except Exception:  # noqa: BLE001
        candidates = [match.group(0) for match in _NAME_RE.finditer(text)]
    out, seen = [], set()
    for candidate in candidates:
        for word in candidate.split():
            if word not in _NOT_A_NAME and word.casefold() not in seen:
                seen.add(word.casefold())
                out.append(word)
    return out


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
    return record_client_facts(state, delivered_text)


def record_client_facts(state, text: str) -> int:
    """Append new facts from any text — reader-delivered OR the client's own message.

    The client naming her ex, or giving a date of birth, establishes a fact the reader must
    still have in three hours' time just as firmly as a card the reader named. Same ledger,
    same dedupe, and deliberately free of the Atlas situation-memory hook above, so it is
    safe to call on the inbound path: pure regex over a string, no database, no IO."""
    try:
        existing = {
            (e.get("kind"), str(e.get("value", "")).casefold())
            for e in (state.commitment_ledger or [])
        }
        added = 0
        for entry in extract_commitments(text):
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
    labels = {
        "card": "Card", "timing": "Timing", "number": "Number",
        "sign": "Sign", "date": "Date", "name": "Name",
    }
    lines = [
        f"- {labels.get(e.get('kind'), 'Fact')}: {e.get('value')}"
        for e in ledger
    ]
    return (
        "ALREADY ESTABLISHED THIS SESSION (cards you have named openly and timing "
        "windows you have given so far — stay consistent with these; do not "
        "contradict them, and do not re-deliver them as if new):\n" + "\n".join(lines)
    )
