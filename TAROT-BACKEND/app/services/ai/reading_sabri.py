"""Sabri — the DELIVERY role of the two-role engine (READING_ENGINE=two_role).

Sabri receives Valentina's complete written reading (on a fresh-content turn) OR the
currently-held reserve (on a follow-up turn), plus the conversation and the client's latest
message. His entire job is delivery judgment:

  * SELECT + HOLD — pick the best/most-relevant parts to send now; bank the rest in reserve.
  * VOICE — rewrite the selected parts into real texting voice (lowercase, fragments, fillers,
    no markdown/em-dash/emoji) while PRESERVING every fact/number/name/card VERBATIM.
  * PACE (turn size) — send about a natural turn's worth, then stop and let the client respond.
  * FOLLOW-UPS — work from reserve, or give a short glue reply of his own.

He NEVER critiques or redoes Valentina (no quality-gate, no correction loop — that broke the
retired two_agent engine). Output is PLAIN TEXT (bubbles + optional @@RESERVE@@), never JSON.

Model: SABRI_DELIVERY_MODEL (a second real model call — measure the latency it adds). His output
runs through the return-ack strip (reused) and a deterministic fact-preservation check (below).

The system prompt was designed by a judge-panel workflow (4 diverse drafts, scored, then
synthesized here) with the two flaws every judge flagged fixed: (1) the output-delimiter
ambiguity — a send-now message never contains an internal blank line, and the FIRST @@RESERVE@@
line is the sole, opaque boundary; (2) self-authored replies are content-free glue only.
"""

import re
from collections import Counter

from app.config import get_app_settings
from app.logging_config import get_logger
from app.services.ai import client as ai_client
from app.services.ai.reading_llm import FALLBACK_MESSAGE

logger = get_logger(__name__)

_TRANSCRIPT_LIMIT = 20
RESERVE_SENTINEL = "@@RESERVE@@"
_FENCE_LINES = {"```", "```json", "```text"}


# ═════════════════════════════════════════════════════════════════════════════
# SABRI — DELIVERY DIRECTOR SYSTEM PROMPT
# ═════════════════════════════════════════════════════════════════════════════
# Keep this string free of triple-double-quotes.
SABRI_SYSTEM_PROMPT = """You are Sabri. You are the delivery voice of a live psychic chat. A client is texting with a psychic, and your entire job is delivery judgment: deciding what she sees right now, in what voice, and how much of it before you pause and let her speak again.

You do not do the reading. A separate reader named Valentina has already written the full psychic reply for this turn — a complete, rich piece of prose using tarot, astrology, numerology, and her craft, with every number, date, name, and card already correct and given to you as fact. Her writing arrives as finished CONTENT, not as chat: deep prose, not texting voice, and usually more than any real person would say in one breath. That is expected. Your job begins where hers ends. On a follow-up turn there may be no new writing from her at all — only the RESERVE you are still holding, plus the conversation and the client's latest message.

THE SPINE OF EVERYTHING YOU DO: NEVER ALTER A FACT.
You may restructure phrasing, break sentences up, change length, add casual connective tissue, and choose what to send when. You may NEVER invent, alter, drop, soften, round, or restate in your own words any fact, number, name, card, date, sign, placement, or claim Valentina wrote. If she wrote "life path 5," it reaches the client as "life path 5" — not "a 5 energy," not "life path five," not "a five." If she wrote "the Knight of Cups," it is the Knight of Cups, never "the knight card" or "a cups card." If she wrote "born march 3," it stays "born march 3." Every literal number, and the name of every person, card, sign, house, and planet, is load-bearing and untouchable. You change HOW a fact is delivered, never WHAT the fact is. When in doubt, carry the words exactly and rephrase only the tissue around them.

WHAT YOU DO EACH TURN

1. SELECT AND HOLD. Never dump the whole thing. Read the client's latest message and the conversation, pick the parts of Valentina's content that land hardest and matter most right now, and send only those. Lead with what hits. Everything you don't send, you HOLD in reserve as live ammunition for later turns. When in doubt, send less and hold more — held content is loaded for the next turn, not wasted. A reading rationed out over a conversation feels like a real reader unspooling something; a reading dumped all at once feels like a wall of text.

2. VOICE. Rewrite the parts you're sending into real human texting voice. Mostly lowercase. Abbreviations used naturally and INCONSISTENTLY — wtvr, idk, tbh, u, ur, ngl — sometimes the short form, sometimes the full word, never uniform. Fragments are good. Vary message length: some one-liners, some a couple of sentences. Use natural lead-ins and fillers SPARINGLY, not on every line: "ok real talk...", "ngl", "honestly?", "ok so here's the thing", "can i be real with u for a sec". Write like you're feeling it with her, not delivering a verdict at her. NEVER use bullets, numbering, headers, markdown of any kind, em-dashes, or emoji. Ever. This is a chat window between two people. Voicing changes the wording AROUND the facts — never the facts.

3. TURN SIZE. Decide how much is ONE natural conversational turn before you pause and let her respond. Around ten messages is a loose guideline, not a target to hit. The real rule: send however much a real person would actually say before it starts to feel like talking AT her instead of WITH her. A heavy, emotional beat might be a few short messages and a question back. An eager, wide-open one might be a fuller stretch. When you hit the natural stopping point, stop, and leave room for her to answer. Silence and space are tools.

4. FOLLOW-UPS. Sometimes the client just reacted or asked something small, and you are working only from the RESERVE you're already holding — no fresh Valentina writing. Deliver the next relevant held pieces, voiced, same fidelity rule. OR, if a short natural reply of your own fits the moment better than dropping more reading, just give that — a real "mm yeah that tracks" or "ok wait tell me more" is often the right move. But a reply of your own is ONLY conversational acknowledgment and glue: it may never introduce a claim, number, card, date, sign, or any reading substance Valentina did not write. Every factual or reading statement the client ever sees traces back to Valentina's words. When you have nothing held and nothing new, keep it to that light human reply and don't manufacture a reading.

WHAT YOU ARE NOT — HARD GUARDRAILS
You NEVER send Valentina's writing back for a redo. You NEVER critique, grade, second-guess, or quality-gate what she wrote. You have zero veto over WHAT she said — your only authority is over what is shown now versus held for later. You curate and you pace; you do not correct. Do not enter any loop of evaluating her quality. Take what she gave, choose from it, voice it, send it. (An earlier design failed by sitting in a judging loop — do not repeat it.)
You NEVER output JSON, control tokens, tier labels, brackets, tags, or any machine syntax. Human chat only, plus the one reserve marker below.
No emoji, ever.
No return-acknowledgment: never reference or imply a past session or a gap in time — no "welcome back," no "since we last spoke," no "it's been a while." Be present in this conversation as it is now.

YOUR OUTPUT FORMAT — FOLLOW IT LITERALLY
First, output the messages to send to the client RIGHT NOW, already in final texting voice. Separate each message from the next with a single BLANK LINE. Each message is ONE block with NO blank line inside it — blank lines appear ONLY between messages. Put nothing before the first message: no label, no preamble.
Then, ONLY IF you are holding content back, output a line that is EXACTLY @@RESERVE@@ on its own (no spaces, nothing else on that line), and after it the Valentina content you did NOT send this turn, copied VERBATIM — do not voice it, rewrite it, or summarize it. It stays in her exact words so it can be voiced later, on the turn you actually send it. Everything after that first @@RESERVE@@ line is held content and may run to any length or shape. If you are holding nothing back, do not write @@RESERVE@@ at all.
Output nothing else anywhere: no headers, no labels, no commentary, no explanation of your choices, no JSON, no emoji. Just the messages, then optionally the @@RESERVE@@ block.

Deliver what lands. Hold the rest. And never, ever change a fact."""


# ─────────────────────────────────────────────────────────────────────────────
# Input building + the model call
# ─────────────────────────────────────────────────────────────────────────────
def build_sabri_input(
    *,
    client_message: str,
    chat_transcript,
    source_content: str,
    is_new: bool,
    turn_target: int,
) -> str:
    """Assemble Sabri's user-content payload for one turn. ``source_content`` is Valentina's
    fresh complete reading when ``is_new`` else the currently-held reserve (verbatim). The
    transcript shows what the client has already seen (so Sabri doesn't repeat held pieces
    he already released). Pure."""
    parts = []
    tx = chat_transcript or []
    if tx:
        lines = [
            f"{'client' if m.get('role') == 'client' else 'you'}: {m.get('content', '')}"
            for m in tx[-_TRANSCRIPT_LIMIT:]
        ]
        parts.append(
            "CONVERSATION SO FAR (what the client has already seen from you — do not repeat it):\n"
            + "\n".join(lines)
        )
    parts.append(f"CLIENT'S LATEST MESSAGE:\n{client_message}")
    if is_new:
        parts.append(
            "VALENTINA'S COMPLETE NEW READING (select the parts that land now, voice them, "
            "hold the rest in @@RESERVE@@):\n" + (source_content or "").strip()
        )
    elif (source_content or "").strip():
        parts.append(
            "HELD RESERVE — Valentina's earlier words you are still holding. Deliver the next "
            "relevant pieces (voiced), or give a short natural reply of your own; keep holding "
            "whatever you don't send:\n" + source_content.strip()
        )
    else:
        parts.append(
            "(No held reserve and no new reading — the client just reacted or said something "
            "small. Give a short, natural reply of your own. Do NOT invent any reading substance.)"
        )
    parts.append(
        f"GUIDELINE: about {turn_target} messages is a natural turn, but read the moment — "
        "stop where a real person would stop and let her respond."
    )
    return "\n\n".join(parts)


def run_sabri(sabri_input: str, *, model=None, max_tokens=None) -> str:
    """One Sabri delivery call → his raw plain-text output (bubbles + optional @@RESERVE@@).
    Blocking — call from a thread on the event loop. Raises on SDK error for the caller."""
    s = get_app_settings()
    result = ai_client.run_chat(
        system=SABRI_SYSTEM_PROMPT,
        user_content=sabri_input,
        model=model or s.SABRI_DELIVERY_MODEL,
        max_tokens=max_tokens or s.SABRI_DELIVERY_MAX_TOKENS,
    )
    return result.get("text") or ""


def parse_sabri_output(text: str):
    """Split Sabri's raw output into (bubbles, reserve).

    Robust delimiter contract (the flaw every judge flagged, fixed): the FIRST occurrence of the
    @@RESERVE@@ sentinel — on its own line OR inline — is the sole boundary. Everything after it is
    OPAQUE reserve (verbatim Valentina prose that may itself contain blank lines/paragraphs and even
    further @@RESERVE@@ markers; it is never re-split into bubbles). Before the boundary, messages
    are blank-line separated, each a single block with no internal blank line. Partitioning on the
    sentinel SUBSTRING (not an exact-line match) means an off-contract inline sentinel can never leak
    the marker or held prose to the client. Any stray sentinel left in a bubble is dropped as a
    final guard. Stray code-fence lines are tolerated. Pure."""
    raw = (text or "").strip()
    raw = "\n".join(ln for ln in raw.splitlines() if ln.strip() not in _FENCE_LINES)
    body, _sep, reserve = raw.partition(RESERVE_SENTINEL)   # first sentinel anywhere = boundary
    bubbles = [b.strip() for b in re.split(r"\n[ \t]*\n", body) if b.strip()]
    # Belt-and-suspenders: never let a residual sentinel reach the client.
    bubbles = [b for b in bubbles if RESERVE_SENTINEL not in b]
    return bubbles, reserve.strip()


# ═════════════════════════════════════════════════════════════════════════════
# Deterministic fact-preservation check — Sabri may MOVE a fact to reserve but never
# DROP or ALTER one. Compares Valentina's facts against (bubbles + reserve) combined:
# a number/card/sign/planet present in the source must survive somewhere. MULTISET
# (Counter) comparison, so a fact that appears N times in the source but fewer times in
# the delivery is still flagged — e.g. "life path 5" reworded to "life path five" while a
# separate "5 years older" survives is caught (source has two 5s, delivery one). Catches
# both drops and the common word-for-digit / renamed-card alterations. The runtime
# guardrail checks NUMBERS + KNOWN TERMS (cards/signs/planets) — the reliable, load-bearing
# facts. Person-name checking (the optional `names=` arg) is advisory/opt-in only and NOT
# run in production: it is noisy for the client's OWN name (Sabri needn't repeat it back,
# which is not an alteration). Advisory throughout: it LOGS, never a redo (no correction loop).
# ═════════════════════════════════════════════════════════════════════════════
def _tarot_card_terms():
    major = [
        "the fool", "the magician", "the high priestess", "the empress", "the emperor",
        "the hierophant", "the lovers", "the chariot", "strength", "the hermit",
        "wheel of fortune", "justice", "the hanged man", "death", "temperance",
        "the devil", "the tower", "the star", "the moon", "the sun", "judgement", "the world",
    ]
    ranks = ["ace", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten",
             "page", "knight", "queen", "king"]
    suits = ["cups", "pentacles", "swords", "wands", "coins"]
    minor = [f"{r} of {s}" for r in ranks for s in suits]
    return set(major) | set(minor)


_ZODIAC = {"aries", "taurus", "gemini", "cancer", "leo", "virgo", "libra", "scorpio",
           "sagittarius", "capricorn", "aquarius", "pisces"}
_PLANETS = {"sun", "moon", "mercury", "venus", "mars", "jupiter", "saturn", "uranus",
            "neptune", "pluto"}
# Longest-first so multi-word card names are matched before their single-word substrings.
_KNOWN_TERMS = sorted(_tarot_card_terms() | _ZODIAC | _PLANETS, key=len, reverse=True)


def _number_counts(text: str) -> Counter:
    return Counter(re.findall(r"\d+", text or ""))


def _term_counts(text: str) -> Counter:
    low = (text or "").lower()
    c = Counter()
    for t in _KNOWN_TERMS:
        n = len(re.findall(r"\b" + re.escape(t) + r"\b", low))
        if n:
            c[t] = n
    return c


def missing_facts(source: str, delivered: str, *, names=()):
    """Facts in ``source`` (Valentina) absent from ``delivered`` (bubbles + reserve combined).
    Returns {"numbers": [...], "terms": [...], "names": [...]} — empty lists mean nothing was
    dropped or altered. MULTISET comparison (Counter difference): a fact present more often in
    the source than the delivery is flagged, so an altered occurrence isn't masked by an
    unrelated survivor of the same digit/term. ``names`` (optional, advisory) are person-names
    to also verify — see the module note; production passes none. Pure."""
    low_delivered = (delivered or "").lower()
    num_missing = _number_counts(source) - _number_counts(delivered)
    term_missing = _term_counts(source) - _term_counts(delivered)
    return {
        "numbers": sorted(num_missing.elements(), key=lambda x: (len(x), x)),
        "terms": sorted(term_missing.elements()),
        "names": sorted(
            n for n in names
            if re.search(r"\b" + re.escape(n.lower()) + r"\b", (source or "").lower())
            and not re.search(r"\b" + re.escape(n.lower()) + r"\b", low_delivered)
        ),
    }


def has_missing_facts(missing) -> bool:
    return bool(missing["numbers"] or missing["terms"] or missing["names"])


def sabri_deliver(
    sabri_input: str,
    *,
    source_content: str = "",
    names=(),
    sabri_call=None,
    max_attempts: int = None,
    fallback_message: str = FALLBACK_MESSAGE,
):
    """Run one Sabri turn end-to-end → (bubbles, reserve).

    call → parse → strip return-acks from the sent bubbles (reused deterministic filter) →
    log any dropped/altered facts (advisory; never a redo) → bounded retry only if the turn
    is EMPTY after filtering. GUARANTEES a non-empty ``bubbles`` (a fallback line if every
    attempt fails/empties) so the two-role path never leaves the client in dead silence — the
    same guarantee run_reader_turn gives the single-agent path. On the fallback,
    ``reserve`` is returned EMPTY so the caller preserves any prior reserve rather than
    trusting a failed turn's parse. ``sabri_call(input) -> raw text`` is injectable for tests."""
    from app.services.ai.reading_pipeline import is_return_acknowledgment

    s = get_app_settings()
    attempts = max_attempts or s.SABRI_DELIVERY_MAX_ATTEMPTS
    call = sabri_call or run_sabri

    for attempt in range(1, attempts + 1):
        try:
            raw = call(sabri_input)
        except Exception as e:  # noqa: BLE001 — a Sabri failure must never crash the chat
            logger.warning("sabri_call_failed", attempt=attempt, error=str(e))
            continue
        bubbles, reserve = parse_sabri_output(raw)
        dropped = [b for b in bubbles if is_return_acknowledgment(b)]
        bubbles = [b for b in bubbles if not is_return_acknowledgment(b)]
        if dropped:
            logger.warning("sabri_dropped_return_acks", count=len(dropped), dropped=dropped)
        if bubbles:
            if source_content:
                miss = missing_facts(source_content, "\n".join(bubbles) + "\n" + reserve, names=names)
                if has_missing_facts(miss):
                    logger.warning("sabri_fact_drift", attempt=attempt, **miss)
            logger.info("sabri_turn_ready", bubbles=len(bubbles), reserve_chars=len(reserve),
                        attempt=attempt)
            return bubbles, reserve
        logger.warning("sabri_turn_empty_retrying", attempt=attempt)

    logger.warning("sabri_turn_fallback")
    return [fallback_message], ""
