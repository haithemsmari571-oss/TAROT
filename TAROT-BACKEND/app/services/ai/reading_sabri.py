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
from app.services.ai.runtime_prompts import resolve_runtime_prompt

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

1. SELECT AND HOLD — SEND LESS THAN YOU THINK. Never dump the whole thing, and never send most of it. Valentina hands you a complete reading; on a full reading the MAJORITY of it should stay in reserve. Read the client's latest message and pick only the few sharpest, most-relevant beats that land RIGHT NOW — the hook and one or two perceptions that make her lean in — and send just those. Everything else you HOLD as live ammunition for later turns. A real psychic drops one thing that makes you gasp, then waits for your breath before the next; she does not read you her whole vision at once. When you're unsure whether a beat belongs now, hold it — held content is loaded for the next turn, not wasted. Erring toward LESS is the job.

2. VOICE. You MUST genuinely paraphrase the parts you send into real human texting voice. Do not merely split Valentina's sentences or copy whole sent sentences. Keep the exact meaning, add nothing, and invent nothing. Mostly lowercase. Abbreviations used naturally and INCONSISTENTLY — wtvr, idk, tbh, u, ur, ngl — sometimes the short form, sometimes the full word, never uniform. Fragments are good. Vary message length: some one-liners, some a couple of sentences. Use natural connective tissue sparingly. Never use canned AI scaffolding such as "here's the thing", "the truth is", "what I'm seeing is", "let me be clear", or "it's important to remember that". Write like you're feeling it with her, not delivering a verdict at her. NEVER use bullets, numbering, headers, markdown of any kind, an em dash (—), an en dash (–), or emoji. Use a comma, full stop, colon, or ordinary hyphen instead. This is a chat window between two people. Voicing changes the wording AROUND the protected facts — never the protected facts.

PROTECTED LITERALS. The input may contain tokens such as [[KEEP_0001]]. Each token stands for exact credibility-critical wording: a tarot card, proper name, date or date of birth, number, Life Path, Personal Year, zodiac sign, or explicit timing claim. Copy every [[KEEP_...]] token exactly once, byte for byte, into either a send-now message or the reserve. Never edit, split, lowercase, explain, generalise, omit, or duplicate one. These tokens are the sole exception to the no-brackets rule below; the server restores the original words before delivery.

3. TURN SIZE — KEEP IT SHORT. Your text is delivered as short messages (a long line is auto-split into short texts), so think in terms of short messages, and one turn is only about EIGHT of them — lean toward that, not past it. That is a few sharp beats, then you STOP and let her respond. The real rule underneath: send only what a real person would say before it starts to feel like talking AT her instead of WITH her — which is less than you'd guess. A heavy, emotional beat might be three or four short messages and a question back. Never keep going just because there's more in the reading — there almost always is, and that's what the next turn is for. When you've landed a few things that hit, stop. Silence and space are tools.

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
        f"GUIDELINE: send only your strongest slice now — about {turn_target} SHORT messages — and "
        "hold the majority of the reading in reserve. Lead with what lands, then stop and let her "
        "respond. Erring toward less is right; the rest is for later turns."
    )
    return "\n\n".join(parts)


def run_sabri(sabri_input: str, *, model=None, max_tokens=None) -> str:
    """One Sabri delivery call → his raw plain-text output (bubbles + optional @@RESERVE@@).
    Blocking — call from a thread on the event loop. Raises on SDK error for the caller."""
    s = get_app_settings()
    result = ai_client.run_chat(
        system=resolve_runtime_prompt("reading.sabri", SABRI_SYSTEM_PROMPT),
        user_content=sabri_input,
        model=model or s.SABRI_DELIVERY_MODEL,
        max_tokens=max_tokens or s.SABRI_DELIVERY_MAX_TOKENS,
    )
    return result.get("text") or ""


# ═════════════════════════════════════════════════════════════════════════════
# Deterministic message-length chunker (landingpage2's approach) — a CODE backstop so
# no single delivery message can run 50-100+ words, regardless of what Sabri's prompt asked
# for. Split each of Sabri's messages (a paragraph) on sentence boundaries, greedily group
# sentences up to max_words, and NEVER merge across a paragraph break. A single sentence that
# alone exceeds max_words is split on clause punctuation, then hard word-count as a last resort,
# so the cap is guaranteed. The proportional typing math (1200ms/word, no cap) is untouched —
# this bounds LENGTH, not speed.
# ═════════════════════════════════════════════════════════════════════════════
_SENTENCE_BOUNDARY = re.compile(r"(?<=[.!?…])\s+")
# Lookbehind → clause punctuation is PRESERVED on split. Dashes are deliberately NOT split points
# (a spaced dash split used to be consumed/dropped); a dash survives as its own atom in the
# last-resort split below.
_CLAUSE_BOUNDARY = re.compile(r"(?<=[,;:])\s+")
_ATOM_RE = None


def _atomize(text: str):
    """Tokenize into words, but keep a known MULTI-WORD term (e.g. 'the Knight of Cups',
    'wheel of fortune') as ONE unsplittable token — so the last-resort word grouping can never
    break a card name across two messages. Built lazily (the term vocab is defined below)."""
    global _ATOM_RE
    if _ATOM_RE is None:
        multi = sorted((t for t in _KNOWN_TERMS if " " in t), key=len, reverse=True)
        _ATOM_RE = re.compile("|".join(re.escape(t) for t in multi) + r"|\S+", re.IGNORECASE)
    return [m.group(0) for m in _ATOM_RE.finditer(text)]


def _greedy_group(units, max_words: int):
    """Pack units (sentences/clauses/atoms) into ≤max_words groups, in order, without splitting a
    unit. A unit longer than max_words is emitted alone (callers pre-split so this doesn't happen)."""
    groups, cur, cw = [], [], 0
    for u in units:
        w = len(u.split())
        if cur and cw + w > max_words:
            groups.append(" ".join(cur))
            cur, cw = [], 0
        cur.append(u)
        cw += w
    if cur:
        groups.append(" ".join(cur))
    return groups


def _split_long_sentence(sentence: str, max_words: int):
    """A single sentence longer than max_words: split on clause punctuation (,;:), then — as a last
    resort for a clause that is still too long — group ATOMS (words, with multi-word card names kept
    whole). No piece exceeds max_words and no card name is ever split across two messages."""
    clauses = [c.strip() for c in _CLAUSE_BOUNDARY.split(sentence) if c.strip()]
    out = []
    for grp in _greedy_group(clauses, max_words):
        if len(grp.split()) <= max_words:
            out.append(grp)
        else:  # a single clause still too long → atom-aware grouping (never splits a card name)
            out.extend(_greedy_group(_atomize(grp), max_words))
    return out


def chunk_message(text: str, max_words: int):
    """Split ONE message (a paragraph) into ≤max_words delivery messages on sentence boundaries.
    Internal whitespace is normalized (a message is one line). Pure."""
    text = " ".join((text or "").split())
    if not text:
        return []
    sentences = [s.strip() for s in _SENTENCE_BOUNDARY.split(text) if s.strip()]
    units = []
    for s in sentences:
        if len(s.split()) <= max_words:
            units.append(s)
        else:
            units.extend(_split_long_sentence(s, max_words))
    return _greedy_group(units, max_words)


def chunk_bubbles(bubbles, max_words: int):
    """Re-chunk each of Sabri's messages to ≤max_words, flattened, NEVER merging across a
    message/paragraph boundary. Pure."""
    out = []
    for b in bubbles:
        out.extend(chunk_message(b, max_words) or ([b] if b.strip() else []))
    return out


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
# facts. Protected literals are also shielded before the model call and restored afterward.
# Any missing token or fact rejects that attempt; bounded retries then use a source-preserving
# deterministic fallback. Person names may be supplied explicitly and are also conservatively
# detected from capitalisation in Valentina's source.
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

_MONTHS = (
    "january|february|march|april|may|june|july|august|september|october|november|december"
)
_SEASONS = "spring|summer|autumn|fall|winter"
_PROTECTED_PATTERNS = (
    re.compile(r"\b(?:life\s+path|personal\s+year)\s+\d+\b", re.IGNORECASE),
    re.compile(rf"\b(?:\d{{1,2}}(?:st|nd|rd|th)?\s+(?:of\s+)?(?:{_MONTHS})(?:\s+\d{{2,4}})?|(?:{_MONTHS})\s+\d{{1,2}}(?:st|nd|rd|th)?(?:,?\s+\d{{2,4}})?)\b", re.IGNORECASE),
    re.compile(r"\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b"),
    re.compile(rf"\b(?:before|by)\s+the\s+end\s+of\s+(?:(?:this|next)\s+)?(?:{_SEASONS}|{_MONTHS}|the\s+month|the\s+year)\b", re.IGNORECASE),
    re.compile(r"\b(?:within|in)\s+(?:the\s+next\s+)?\d+\s+(?:days?|weeks?|months?|years?)\b", re.IGNORECASE),
    re.compile(r"\b\d+(?:[.,]\d+)?(?:st|nd|rd|th)?\b", re.IGNORECASE),
)
_NON_NAME_WORDS = {
    "a", "an", "and", "as", "at", "because", "but", "he", "her", "here", "hers", "his",
    "how", "i", "if", "it", "its", "me", "my", "no", "not", "now", "of", "or", "our",
    "she", "so", "that", "the", "their", "there", "these", "they", "this", "those", "to",
    "we", "what", "when", "where", "which", "who", "why", "you", "your",
    "ace", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "page",
    "knight", "queen", "king", "life", "personal", "year",
} | set(_MONTHS.split("|")) | set(_SEASONS.split("|")) | _ZODIAC | _PLANETS
_GENERIC_OPENERS = re.compile(
    r"^\s*(?:ok\s+so\s+)?(?:here(?:'|’)?s\s+the\s+thing|the\s+truth\s+is|"
    r"what\s+i(?:'|’)m\s+seeing\s+is|let\s+me\s+be\s+clear|"
    r"it(?:'|’)s\s+important\s+to\s+remember\s+that)\s*[:,.!?\-]*\s*",
    re.IGNORECASE,
)


def _protected_spans(source: str, *, names=()):
    """Return non-overlapping credibility-critical spans, longest match first at each offset."""
    candidates = []
    for term in _KNOWN_TERMS:
        candidates.extend((m.start(), m.end()) for m in re.finditer(
            r"\b" + re.escape(term) + r"\b", source or "", re.IGNORECASE
        ))
    for pattern in _PROTECTED_PATTERNS:
        candidates.extend((m.start(), m.end()) for m in pattern.finditer(source or ""))
    for name in names or ():
        if name:
            candidates.extend((m.start(), m.end()) for m in re.finditer(
                r"\b" + re.escape(str(name)) + r"\b", source or "", re.IGNORECASE
            ))
    # Conservative automatic proper-name guard. False positives only preserve an extra capitalized
    # word; false negatives would let a person's name drift, so preservation wins.
    for match in re.finditer(r"\b[A-Z][a-z]{2,}(?:\s+[A-Z][a-z]{2,})*\b", source or ""):
        words = match.group(0).lower().split()
        if any(word not in _NON_NAME_WORDS for word in words):
            candidates.append((match.start(), match.end()))
    chosen = []
    for start, end in sorted(set(candidates), key=lambda span: (span[0], -(span[1] - span[0]))):
        if not any(start < other_end and end > other_start for other_start, other_end in chosen):
            chosen.append((start, end))
    return sorted(chosen)


def shield_protected_literals(sabri_input: str, source_content: str, *, names=()):
    """Replace protected source spans with unique opaque tokens only inside the source block."""
    source = (source_content or "").strip()
    if not source:
        return sabri_input, {}
    source_start = (sabri_input or "").rfind(source)
    if source_start < 0:
        return sabri_input, {}
    mapping = {}
    pieces, cursor = [], 0
    for index, (start, end) in enumerate(_protected_spans(source, names=names), start=1):
        token = f"[[KEEP_{index:04d}]]"
        pieces.extend((source[cursor:start], token))
        mapping[token] = source[start:end]
        cursor = end
    pieces.append(source[cursor:])
    shielded_source = "".join(pieces)
    return (
        sabri_input[:source_start] + shielded_source + sabri_input[source_start + len(source):],
        mapping,
    )


def _restore_protected_literals(text: str, mapping) -> str:
    restored = text or ""
    for token, literal in mapping.items():
        restored = restored.replace(token, literal)
    return restored


def _tokens_preserved_once(text: str, mapping) -> bool:
    return all((text or "").count(token) == 1 for token in mapping)


def sanitize_delivery_text(text: str) -> str:
    """Remove deterministic AI tells from a client-visible bubble without changing meaning."""
    cleaned = (text or "").replace("\u200b", "").replace("\u200c", "").replace("\u200d", "")
    cleaned = cleaned.replace("\ufeff", "").replace("\u00a0", " ")
    cleaned = cleaned.replace("—", ", ").replace("–", "-")
    cleaned = cleaned.replace("**", "").replace("__", "").replace("`", "")
    cleaned = re.sub(r"^\s{0,3}(?:#{1,6}\s+|[-*+]\s+|\d+[.)]\s+)", "", cleaned)
    cleaned = _GENERIC_OPENERS.sub("", cleaned)
    cleaned = re.sub(r"\s+([,.;:!?])", r"\1", cleaned)
    cleaned = re.sub(r",\s*,+", ",", cleaned)
    return " ".join(cleaned.split()).strip()


def _source_preserving_fallback(source_content: str, max_words: int):
    """Deliver one source sentence safely and retain the exact remainder when Sabri drifts."""
    source = (source_content or "").strip()
    if not source:
        return [], ""
    match = re.search(r"[.!?…](?:\s+|$)", source)
    cut = match.end() if match else len(source)
    first = sanitize_delivery_text(source[:cut].strip())
    reserve = source[cut:].strip()
    return chunk_message(first, max_words), reserve


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


def _audit_sabri_attempt(chat_id, turn_number, attempt, raw, dropped, miss, *, delivered):
    """Append one two_role sabri_delivery audit row for this attempt (the raw Sabri output +
    advisory notes: any dropped return-acks and fact-drift vs Valentina's draft). Never
    affects the turn — errors swallowed; only logs when a chat_id context was threaded in."""
    if chat_id is None:
        return
    try:
        import json

        from app.services.ai.reading_draft_log import get_draft_log

        notes = {}
        if dropped:
            notes["dropped_return_acks"] = dropped
        if miss and has_missing_facts(miss):
            notes["fact_drift"] = miss
        get_draft_log().log(
            chat_id=chat_id, turn_number=turn_number, attempt_number=attempt,
            engine="two_role", stage="sabri_delivery", raw_content=raw,
            notes=json.dumps(notes) if notes else None, is_delivered=delivered,
        )
    except Exception:  # noqa: BLE001 — audit logging must never affect a turn
        pass


def sabri_deliver(
    sabri_input: str,
    *,
    source_content: str = "",
    names=(),
    sabri_call=None,
    max_attempts: int = None,
    fallback_message: str = FALLBACK_MESSAGE,
    chat_id=None,
    turn_number: int = 0,
):
    """Run one Sabri turn end-to-end → (bubbles, reserve).

    shield protected literals → call → validate/restore literals → parse → strip return-acks →
    remove deterministic AI tells → validate facts → chunk. Missing literals, fact drift, or an
    empty turn receives a bounded retry. If all attempts fail and source exists, one exact source
    sentence is delivered and the untouched remainder is retained; otherwise the normal non-empty
    fallback line is used. ``sabri_call(input) -> raw text`` is injectable for tests."""
    from app.services.ai.reading_pipeline import is_return_acknowledgment

    s = get_app_settings()
    attempts = max_attempts or s.SABRI_DELIVERY_MAX_ATTEMPTS
    call = sabri_call or run_sabri
    shielded_input, protected = shield_protected_literals(
        sabri_input, source_content, names=names
    )

    for attempt in range(1, attempts + 1):
        try:
            raw = call(shielded_input)
        except Exception as e:  # noqa: BLE001 — a Sabri failure must never crash the chat
            logger.warning("sabri_call_failed", attempt=attempt, error=str(e))
            continue
        if protected and not _tokens_preserved_once(raw, protected):
            missing_tokens = [token for token in protected if (raw or "").count(token) != 1]
            miss = {"numbers": [], "terms": missing_tokens, "names": []}
            logger.warning("sabri_protected_literal_drift", attempt=attempt, count=len(missing_tokens))
            _audit_sabri_attempt(
                chat_id, turn_number, attempt, raw, [], miss, delivered=False
            )
            continue
        restored_raw = _restore_protected_literals(raw, protected)
        bubbles, reserve = parse_sabri_output(restored_raw)
        # Strip return-acks on the UN-chunked messages FIRST — a multi-word ack phrase ("since we
        # last spoke") must be matched whole, before the length backstop could split it across a
        # chunk boundary and slip it past the filter. THEN enforce the per-message length cap.
        dropped = [b for b in bubbles if is_return_acknowledgment(b)]
        bubbles = [b for b in bubbles if not is_return_acknowledgment(b)]
        bubbles = [cleaned for b in bubbles if (cleaned := sanitize_delivery_text(b))]
        bubbles = chunk_bubbles(bubbles, s.SABRI_MAX_MESSAGE_WORDS)
        if dropped:
            logger.warning("sabri_dropped_return_acks", count=len(dropped), dropped=dropped)
        miss = (
            missing_facts(source_content, " ".join(bubbles) + " " + reserve, names=names)
            if (bubbles and source_content) else None
        )
        if miss and has_missing_facts(miss):
            logger.warning("sabri_fact_drift", attempt=attempt, **miss)
            _audit_sabri_attempt(
                chat_id, turn_number, attempt, restored_raw, dropped, miss, delivered=False
            )
            continue
        _audit_sabri_attempt(
            chat_id, turn_number, attempt, restored_raw, dropped, miss, delivered=bool(bubbles)
        )
        if bubbles:
            logger.info("sabri_turn_ready", bubbles=len(bubbles), reserve_chars=len(reserve),
                        attempt=attempt)
            return bubbles, reserve
        logger.warning("sabri_turn_empty_retrying", attempt=attempt)

    source_bubbles, source_reserve = _source_preserving_fallback(
        source_content, s.SABRI_MAX_MESSAGE_WORDS
    )
    if source_bubbles:
        logger.warning("sabri_turn_source_preserving_fallback")
        return source_bubbles, source_reserve
    logger.warning("sabri_turn_fallback")
    return [fallback_message], ""
