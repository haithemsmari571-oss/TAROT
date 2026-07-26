"""Deterministic per-client situation memory (Atlas Track A, phase A1).

ZERO-API design: everything here is regex/keyword matching over text that
already exists in the turn — the same shape as reading_ledger.record_commitments,
which is the hook this rides on (reading_ledger is called per delivered bubble
by both the two_role coordinator and the chat message handler, so attaching
inside it covers the live paths WITHOUT touching any production-locked file).

Safety contract, in order of importance:
1. OFF by default. SITUATION_MEMORY_ENABLED must be exactly "true" in the
   process environment or `record_situation` is a no-op.
2. Never raises into a reading turn. Every entry point swallows everything.
3. Side-effect-only. This module WRITES client_situation_records and reads
   chats/users to key the write. Nothing in the reply pipeline reads the
   table back — feeding memory into replies is the separately-gated A-LIVE
   milestone, deliberately not built here.
4. Never blocks the turn. The DB write happens on a small daemon thread with
   its own session (the schedule_atlas_summary pattern).

The theme lexicon mirrors the owner's vault themes-index.md headings so the
CRM-side graph and this extractor speak the same theme vocabulary.
"""

from __future__ import annotations

import os
import re
import threading
from datetime import datetime, timezone
from typing import Iterable, Optional

from app.services.ai.reading_ledger import extract_commitments

SITUATION_MEMORY_ENABLED_ENV = "SITUATION_MEMORY_ENABLED"

# Caps keep the document compact — RAM-sized, per the LLM-OS framing.
MAX_THEMES = 12
MAX_OPEN_PREDICTIONS = 20
MAX_SENSITIVE_FLAGS = 8
MAX_KEY_PEOPLE = 12

# ---------------------------------------------------------------------------
# Deterministic lexicons (derived from the vault's themes-index.md headings).
# Keyword matching is case-insensitive on word boundaries.
# ---------------------------------------------------------------------------

THEME_LEXICON: dict[str, tuple[str, ...]] = {
    "avoidant-partner": (
        "pull away", "pulls away", "pulling away", "distant", "hot and cold",
        "won't commit", "wont commit", "commit", "refuses to commit", "avoid",
        "avoidant", "mixed signals", "on and off", "non-committal",
        "never commits", "closed off",
    ),
    "waiting-on-timeline": (
        "when will", "how long", "still waiting", "waiting for him",
        "waiting for her", "hasn't happened", "hasnt happened", "timeline",
        "you said by", "predicted",
    ),
    "infidelity-betrayal": (
        "cheat", "cheated", "cheating", "affair", "another woman", "another man",
        "betray", "betrayed", "unfaithful", "lied to me", "lying to me",
    ),
    "abandonment-wound": (
        "abandon", "abandoned", "left me", "walked out", "father left",
        "mother left", "everyone leaves",
    ),
    "family-violence": (
        "abusive", "abuse", "hit me", "violent", "violence", "afraid of him",
        "scared of him", "restraining order",
    ),
    "grief-bereavement": (
        "passed away", "passed on", "died", "death", "funeral", "grieving",
        "grief", "lost my", "no longer with us", "late husband", "late wife",
    ),
    "fertility-children": (
        "pregnant", "pregnancy", "conceive", "fertility", "ivf", "baby",
        "children", "my kids", "my son", "my daughter", "custody",
    ),
    "career-business": (
        "job", "career", "promotion", "business", "interview", "boss",
        "workplace", "work", "fired", "redundancy", "new role",
    ),
    "financial-strain": (
        "money", "debt", "bills", "afford", "financial", "finances", "broke",
        "loan", "rent", "savings",
    ),
    "family-drain": (
        "my mother keeps", "my sister keeps", "toxic family", "drains me",
        "draining", "narcissist",
    ),
    "loved-one-illness": (
        "diagnosis", "cancer", "hospital", "surgery", "illness", "sick",
        "chemo", "dementia", "stroke",
    ),
    "closure-seeking": (
        "closure", "move on", "let go", "letting go", "final answer",
        "done with him", "done with her",
    ),
    "self-rebuilding": (
        "new chapter", "rebuild", "rebuilding", "starting over", "self-love",
        "healing", "transformation", "my own path",
    ),
    "uses-other-psychics": (
        "another psychic", "other readers", "someone else read", "other reading",
        "different psychic", "another reader",
    ),
    "reconciliation-hope": (
        "come back", "coming back", "return to me", "reunite", "reconcile",
        "reconciliation", "second chance", "get back together",
    ),
}

SENSITIVE_FLAG_LEXICON: dict[str, tuple[str, ...]] = {
    "self-harm-risk": (
        "kill myself", "end my life", "suicide", "self harm", "self-harm",
        "don't want to live", "dont want to live", "no reason to live",
    ),
    "domestic-danger": (
        "he will hurt me", "she will hurt me", "not safe at home", "he hits",
        "she hits", "afraid to go home", "restraining order",
    ),
    "medical-decision": (
        "stop treatment", "stop taking", "instead of chemo", "instead of the doctor",
        "skip the surgery", "cure",
    ),
    "legal-matter": (
        "court", "lawyer", "lawsuit", "custody battle", "divorce papers",
        "police", "charges",
    ),
    "minor-involved": (
        "underage", "he is 17", "she is 17", "my teenage",
    ),
}

# Relationship words → key_people entries ("husband", "ex", …). Names are NOT
# guessed — the vault's people-index proved same-name entity resolution needs
# human judgment, so this stays at the relationship-role level.
KEY_PEOPLE_LEXICON: tuple[str, ...] = (
    "husband", "wife", "ex-husband", "ex-wife", "ex", "boyfriend", "girlfriend",
    "fiancé", "fiance", "partner", "mother", "father", "mom", "dad", "sister",
    "brother", "son", "daughter", "best friend", "coworker", "boss",
    "mother-in-law", "father-in-law",
)

_WORDISH = r"[A-Za-z][A-Za-z'-]*"


def situation_memory_enabled(env: Optional[dict] = None) -> bool:
    source = env if env is not None else os.environ
    return str(source.get(SITUATION_MEMORY_ENABLED_ENV, "")).strip().lower() == "true"


def _match_lexicon(text: str, lexicon: dict[str, tuple[str, ...]]) -> list[str]:
    lowered = text.lower()
    hits: list[str] = []
    for label, keywords in lexicon.items():
        for keyword in keywords:
            # Word-boundary match; multi-word keywords match as phrases.
            pattern = r"\b" + re.escape(keyword.lower()) + r"\b"
            if re.search(pattern, lowered):
                hits.append(label)
                break
    return hits


def _match_key_people(text: str) -> list[str]:
    lowered = text.lower()
    found: list[str] = []
    for role in KEY_PEOPLE_LEXICON:
        pattern = r"\b(?:my|your|her|his|their)\s+" + re.escape(role) + r"\b"
        if re.search(pattern, lowered) and role not in found:
            found.append(role)
    return found


def extract_situation_delta(
    client_text: Optional[str],
    delivered_text: Optional[str],
) -> dict:
    """Pure, deterministic extraction — no I/O, no API, no randomness.

    Themes/flags/key-people are read from BOTH sides of the exchange when
    available; open predictions (cards + timing windows) only ever come from
    DELIVERED text, reusing the commitment-ledger extractor verbatim so the
    situation record and the in-session ledger can never disagree.
    """

    combined = " \n ".join(part for part in (client_text, delivered_text) if part)
    if not combined.strip():
        return {"themes": [], "open_predictions": [], "sensitive_flags": [], "key_people": []}
    return {
        "themes": _match_lexicon(combined, THEME_LEXICON),
        "open_predictions": extract_commitments(delivered_text or ""),
        "sensitive_flags": _match_lexicon(combined, SENSITIVE_FLAG_LEXICON),
        "key_people": _match_key_people(combined),
    }


def _merge_capped(existing: Iterable[str], new: Iterable[str], cap: int) -> list[str]:
    merged: list[str] = []
    for value in list(existing) + list(new):
        if value not in merged:
            merged.append(value)
    return merged[:cap]


def merge_situation(
    prior: Optional[dict],
    delta: dict,
    *,
    reader_name: Optional[str] = None,
    turn_stamp: Optional[str] = None,
) -> dict:
    """Merge a delta into the rolling document. Dedupes, caps, never shrinks
    facts it didn't observe (an empty delta leaves the prior untouched)."""

    prior = prior or {}
    stamp = turn_stamp or datetime.now(timezone.utc).isoformat()

    existing_predictions = list(prior.get("open_predictions") or [])
    known = {
        (p.get("kind"), str(p.get("value", "")).casefold())
        for p in existing_predictions
    }
    for entry in delta.get("open_predictions") or []:
        key = (entry.get("kind"), str(entry.get("value", "")).casefold())
        if key in known or len(existing_predictions) >= MAX_OPEN_PREDICTIONS:
            continue
        existing_predictions.append(
            {"kind": entry.get("kind"), "value": entry.get("value"), "first_seen": stamp}
        )
        known.add(key)

    merged = {
        "themes": _merge_capped(prior.get("themes") or [], delta.get("themes") or [], MAX_THEMES),
        "open_predictions": existing_predictions,
        "sensitive_flags": _merge_capped(
            prior.get("sensitive_flags") or [], delta.get("sensitive_flags") or [], MAX_SENSITIVE_FLAGS
        ),
        "key_people": _merge_capped(
            prior.get("key_people") or [], delta.get("key_people") or [], MAX_KEY_PEOPLE
        ),
        "last_reader": reader_name or prior.get("last_reader"),
        "last_activity": stamp,
    }
    return merged


def apply_situation_update(db, chat_id: int, client_text: Optional[str], delivered_text: Optional[str]) -> bool:
    """Synchronous core: derive the delta and upsert THIS READER'S record for
    this client.

    Scoped to the (client, psychic) pair. There is deliberately no client-wide
    document: merging readers would mean briefing one psychic with another
    psychic's conversations. A chat with no psychic attached is skipped rather
    than written to some shared row.

    Returns True when a row was written. Raises nothing to callers in the
    reading path — record_situation wraps this; direct callers (tests) may
    let exceptions surface.
    """

    from app.enums.situation_source import SituationSource
    from app.models.chat import Chat
    from app.models.client_situation_record import ClientSituationRecord
    from app.models.user import User

    delta = extract_situation_delta(client_text, delivered_text)
    if not any(delta.values()):
        return False

    chat = db.query(Chat).filter(Chat.id == chat_id).first()
    if chat is None or chat.user_id is None or chat.psychic_id is None:
        return False
    reader = db.query(User).filter(User.id == chat.psychic_id).first()
    reader_name = reader.username if reader is not None else None

    record = (
        db.query(ClientSituationRecord)
        .filter(
            ClientSituationRecord.client_id == chat.user_id,
            ClientSituationRecord.psychic_id == chat.psychic_id,
        )
        .first()
    )
    if record is None:
        record = ClientSituationRecord(
            client_id=chat.user_id,
            psychic_id=chat.psychic_id,
            chat_id=chat_id,
            situation={},
            source=SituationSource.DETERMINISTIC,
        )
        db.add(record)

    record.situation = merge_situation(record.situation, delta, reader_name=reader_name)
    record.chat_id = chat_id
    record.source = SituationSource.DETERMINISTIC
    db.commit()
    return True


def record_situation(chat_id: Optional[int], client_text: Optional[str], delivered_text: Optional[str]) -> None:
    """The hook entry point — called from reading_ledger.record_commitments.

    OFF unless SITUATION_MEMORY_ENABLED=true. When on: fire-and-forget daemon
    thread with its own session (never blocks or raises into the turn), and
    the ONLY table it writes is client_situation_records.
    """

    try:
        if not situation_memory_enabled() or not chat_id:
            return

        def _run() -> None:
            try:
                from app.database.client import SessionLocal

                session = SessionLocal()
                try:
                    apply_situation_update(session, int(chat_id), client_text, delivered_text)
                finally:
                    session.close()
            except Exception:  # noqa: BLE001 — memory must never hurt a reading
                pass

        threading.Thread(target=_run, name="situation-memory", daemon=True).start()
    except Exception:  # noqa: BLE001
        pass
