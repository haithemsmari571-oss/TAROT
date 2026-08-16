"""Sabri — the DELIVERY role of the two-role engine (READING_ENGINE=two_role).

Sabri receives EVERY word Valentina has written this session that the client has not seen —
this turn's fresh reading and everything still unsent from earlier — plus the session capsule
(what the client has already read) and her latest message. His entire job is delivery judgment:

  * SELECT — pick the parts that land now, from anywhere in the unsent writing.
  * VOICE — rewrite the selected parts into real texting voice (lowercase, fragments, fillers,
    no markdown/em-dash/emoji) while PRESERVING every fact/number/name/card VERBATIM.
  * PACE (turn size) — HIS judgment, every turn, from what the client is doing and how long she
    has been waiting. There is no target message count and no message-length cap: both used to
    be config constants that decided it for him, and both are gone.
  * FOLLOW-UPS — work from the unsent writing, or give a short glue reply of his own.

He does not report what he held back. Nothing is removed from the unsent pile by sending it;
he simply never repeats what the capsule shows the client has already read.

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
from app.services.ai.runtime_prompts import resolve_runtime_prompt_and_model

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
    session_memory: str,
    source_content: str,
    waited_seconds=None,
) -> str:
    """Assemble Sabri's user-content payload for one turn.

    Two blocks carry the whole design, and confusing them is the only way it fails:

      * ALREADY SEEN — ``session_memory``, the capsule (verbatim facts + running
        narrative + the recent turns word for word). Everything in it has reached the
        client's screen. He must never send any of it again.
      * WRITTEN BUT NEVER SENT — ``source_content``, every word Valentina has written
        this session that has not been delivered, oldest first, newest last. ALL of it
        is available to him and he picks freely from any part of it.

    ``waited_seconds`` is how long the client has been waiting since her message
    arrived, so he can size what he sends to the wait instead of guessing. There is no
    message-count target and no length cap: how much to send is his judgment. Pure."""
    parts = []
    if (session_memory or "").strip():
        parts.append(
            "ALREADY SEEN BY THE CLIENT — this is the conversation she is looking at. "
            "Every word here has already reached her screen. NEVER send any of it again, "
            "in any wording:\n" + session_memory.strip()
        )
    parts.append(f"CLIENT'S LATEST MESSAGE:\n{client_message}")
    if (source_content or "").strip():
        parts.append(
            "WRITTEN BUT NEVER SENT — everything Valentina has written this session that "
            "the client has NOT seen, oldest first. This is yours to choose from, all of "
            "it, any part of it. Nothing here has reached her:\n" + source_content.strip()
        )
    else:
        parts.append(
            "(Nothing unsent from Valentina — the client just reacted or said something "
            "small. Give a short, natural reply of your own. Do NOT invent any reading substance.)"
        )
    if waited_seconds is not None:
        parts.append(
            f"SHE HAS BEEN WAITING {int(waited_seconds)} SECONDS since her message arrived. "
            "Let that inform how much you send: a long wait has earned something substantial, "
            "a short one has not. How many messages you send, and how long each is, is your "
            "judgment alone."
        )
    return "\n\n".join(parts)


def run_sabri(sabri_input: str, *, model=None, max_tokens=None) -> str:
    """One Sabri delivery call → his raw plain-text output (bubbles + optional @@RESERVE@@).
    Blocking — call from a thread on the event loop. Raises on SDK error for the caller."""
    s = get_app_settings()
    runtime_prompt, runtime_model = resolve_runtime_prompt_and_model(
        "reading.sabri", SABRI_SYSTEM_PROMPT, s.SABRI_DELIVERY_MODEL
    )
    result = ai_client.run_chat(
        system=runtime_prompt,
        user_content=sabri_input,
        model=model or runtime_model,
        max_tokens=max_tokens or s.SABRI_DELIVERY_MAX_TOKENS,
    )
    return result.get("text") or ""


# ═════════════════════════════════════════════════════════════════════════════
# There is deliberately NO message-length chunker any more. The old backstop re-split
# every message to at most SABRI_MAX_MESSAGE_WORDS words, which meant a code constant —
# not Sabri — decided what a message was. A real person sends a one-word reaction and
# then a long paragraph; both are now his to choose. Message boundaries come from the
# blank lines in his own output (parse_sabri_output), and nothing bounds their length.
# ═════════════════════════════════════════════════════════════════════════════
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
# Deterministic fact check — INVENTION, not omission.
#
# This used to check the opposite thing. Sabri was handed three sentences and ordered to
# deliver all of them, so every number and card in his source was expected to come back,
# and anything missing meant he had dropped or reworded a fact. Now he is handed the whole
# unsent reading and chooses a slice of it, so most source facts are SUPPOSED to be absent
# from what he sends — the old multiset check would fail on every single turn.
#
# The danger that remains, and the one that always mattered more, is the other direction: a
# number, card, sign or planet appearing in what the client reads that Valentina never wrote.
# So the check now runs the other way round. Every fact in his BUBBLES must be traceable to
# something he was allowed to see — Valentina's unsent writing, the client's own words, or
# the conversation already on screen. Anything else is fabricated and rejects the attempt.
#
# Also carried over as a special case: the word-for-digit rewrite ("life path 5" -> "life
# path five"), which the old multiset check caught by accident and which no longer shows up
# as an invented digit because it contains no digit at all.
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


_AUTO_NAME_RE = re.compile(r"\b[A-Z][a-z]{2,}(?:\s+[A-Z][a-z]{2,})*\b")


def _sentence_initial(source: str, start: int) -> bool:
    """Is this capital fully explained by the punctuation in front of it?"""
    index = start - 1
    while index >= 0 and source[index] in " \t\"'“‘(":
        index -= 1
    if index < 0:
        return True
    return source[index] in ".!?:;\n"


def _auto_name_matches(source: str, *, earned_only: bool = False):
    """Capitalised runs that behave like names, not like sentence openers.

    Valentina writes ordinary prose, so every sentence she began with "For" or
    "Like" registered that word as a proper name. It was then force-applied,
    case-insensitively, to every later occurrence in Sabri's delivery — which is
    how "this has been sitting with you For weeks" reached a client.

    Two things earn a capital the right to be enforced. Either the word appears
    capitalised somewhere a full stop does not explain — a real name turns up
    mid-sentence sooner or later — or it never appears in lower case at all, in
    which case there is no evidence it is an ordinary word. "Daniel" survives on
    the second test even when he is only ever mentioned at the start of a
    sentence; "For" fails it, because her prose says "for" elsewhere.

    This only filters the automatic guess. Names known from the dossier arrive
    through ``names`` and are matched exactly, untouched by any of this.
    """
    text = source or ""
    matches = [
        match for match in _AUTO_NAME_RE.finditer(text)
        if any(word not in _NON_NAME_WORDS for word in match.group(0).lower().split())
    ]
    earned = {
        match.group(0) for match in matches
        if not _sentence_initial(text, match.start())
    }
    kept = []
    for match in matches:
        literal = match.group(0)
        if literal in earned:
            kept.append(match)
        elif earned_only:
            continue
        elif not re.search(
            r"(?<!\w)" + re.escape(literal.lower()) + r"(?!\w)", text
        ):
            kept.append(match)          # never written in lower case: treat as a name
    return kept


def _protected_spans(source: str, *, names=(), earned_names_only: bool = False):
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
    # Automatic proper-name guard, restricted to capitals that a full stop does not
    # already explain (see _auto_name_matches). A false negative lets an unknown name
    # drift; a false positive rewrites ordinary words mid-sentence in front of the
    # client, which is the worse of the two and the one that actually shipped.
    for match in _auto_name_matches(source or "", earned_only=earned_names_only):
        candidates.append((match.start(), match.end()))
    chosen = []
    for start, end in sorted(set(candidates), key=lambda span: (span[0], -(span[1] - span[0]))):
        if not any(start < other_end and end > other_start for other_start, other_end in chosen):
            chosen.append((start, end))
    return sorted(chosen)


def protected_literals(source_content: str, *, names=(), earned_names_only: bool = False):
    """Every credibility-critical literal in Valentina's writing, in canonical spelling.

    Sabri's source used to be handed to him with each of these replaced by an opaque
    [[KEEP_0001]] token, which guaranteed byte-exactness for anything he passed through.
    That guarantee cost more than it bought once he started receiving the whole reading
    instead of three sentences: he cannot judge which beat lands when the cards, names and
    dates he is choosing between have been blanked out, and judging is now his entire job.
    His prompt also requires every token to be copied into a message OR the reserve, which
    would have made him re-emit the full unsent corpus verbatim on every turn — minutes of
    output tokens by the middle of a long session.

    So the literals are no longer hidden from him. They are collected here and enforced
    afterwards instead: canonical spelling is restored on anything he repeats, and anything
    he states that is NOT in this list (or in what she has said) is treated as invented."""
    source = (source_content or "").strip()
    literals = {
        source[start:end]
        for start, end in _protected_spans(
            source, names=names, earned_names_only=earned_names_only
        )
    }
    literals.update(str(name) for name in names or () if str(name).strip())
    return {literal for literal in literals if literal.strip()}


def _canonicalize_protected_literals(text: str, *, source_content: str = "", names=()):
    """Restore canonical spelling/capitalisation wherever Sabri repeats a protected fact.

    Auto-detected names are used here in their EARNED form only — a capital that a full stop
    does not explain. The looser "never written in lower case anywhere" rule is right for
    collecting facts, where a false positive costs a junk line in a memory block, and wrong
    here, where it is force-applied to the client's screen: a live turn produced "like Maybe
    you built it all yourself", because Valentina happened never to write "maybe" mid-sentence.
    Mid-sentence capitalisation of an ordinary word in front of a paying client is the worse
    failure, and it is the one that keeps shipping. A name known from the dossier still arrives
    through ``names`` and is applied exactly."""
    result = text or ""
    for literal in sorted(
        protected_literals(source_content, names=names, earned_names_only=True),
        key=len, reverse=True,
    ):
        result = re.sub(
            r"(?<!\w)" + re.escape(literal) + r"(?!\w)",
            lambda _match, exact=literal: exact,
            result,
            flags=re.IGNORECASE,
        )
    return result


# His prompt still describes the protected-literal tokens and shows one by name, and that
# paragraph is the owner's to change, not this file's. Nothing shields any more, so there are
# no real tokens for him to copy \u2014 and on a live turn he reproduced the example from the
# prompt verbatim, which reached the fact check as a number (0001) she had never written and
# cost the turn. Machine syntax must never appear on a client's screen under any circumstance,
# so it is stripped here, before both the check and delivery.
_KEEP_TOKEN_RE = re.compile(r"\[\[\s*KEEP[_\s]*\d*\s*\]\]", re.IGNORECASE)


def sanitize_delivery_text(text: str) -> str:
    """Remove deterministic AI tells from a client-visible bubble without changing meaning."""
    cleaned = _KEEP_TOKEN_RE.sub("", text or "")
    cleaned = cleaned.replace("\u200b", "").replace("\u200c", "").replace("\u200d", "")
    cleaned = cleaned.replace("\ufeff", "").replace("\u00a0", " ")
    cleaned = cleaned.replace("—", ", ").replace("–", "-")
    cleaned = cleaned.replace("**", "").replace("__", "").replace("`", "")
    cleaned = re.sub(r"^\s{0,3}(?:#{1,6}\s+|[-*+]\s+|\d+[.)]\s+)", "", cleaned)
    cleaned = _GENERIC_OPENERS.sub("", cleaned)
    cleaned = re.sub(r"\s+([,.;:!?])", r"\1", cleaned)
    cleaned = re.sub(r",\s*,+", ",", cleaned)
    return " ".join(cleaned.split()).strip()


def _source_preserving_fallback(source_content: str):
    """Deliver one exact source sentence when every Sabri attempt fails.

    The rest of the source is NOT consumed or returned: the reserve is owned by the caller
    now and nothing is removed from it by sending, so a fallback turn costs the session
    nothing. One true sentence in Valentina's own words beats a generic holding line."""
    source = (source_content or "").strip()
    if not source:
        return []
    match = re.search(r"[.!?…](?:\s+|$)", source)
    cut = match.end() if match else len(source)
    first = sanitize_delivery_text(source[:cut].strip())
    return [first] if first else []


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


# Valentina writes prose, so she writes "Life Path Seven"; Sabri writes chat, so he writes
# "life path 7". Those are the SAME fact, and the first live turn after this check shipped
# was rejected twice for exactly that — two Sonnet calls burned and the whole reading thrown
# away for a fallback line, because "7" appeared nowhere in her text as a digit. A number is
# matched on its VALUE, in either spelling, in both directions.
_NUMBER_WORD_VALUES = {
    "zero": "0", "one": "1", "two": "2", "three": "3", "four": "4", "five": "5",
    "six": "6", "seven": "7", "eight": "8", "nine": "9", "ten": "10", "eleven": "11",
    "twelve": "12", "thirteen": "13", "fourteen": "14", "fifteen": "15",
    "sixteen": "16", "seventeen": "17", "eighteen": "18", "nineteen": "19",
    "twenty": "20", "thirty": "30", "forty": "40", "fifty": "50",
    "twentytwo": "22", "thirtythree": "33",
}
_NUMBER_WORD_RE = re.compile(
    r"\b(" + "|".join(sorted(_NUMBER_WORD_VALUES, key=len, reverse=True)) + r")\b",
    re.IGNORECASE,
)
# The one rewrite that still matters: a value she stated as a DIGIT arriving as a word.
# "life path 5" reaching the client as "life path five" reads as a psychic who is not quite
# sure, and it contains no digit for the check above to catch.
_SPELLED_OUT_VALUE = re.compile(
    r"\b(life\s+path|personal\s+year)\s+([a-z]+)\b", re.IGNORECASE
)


def _number_values(text: str) -> set:
    """Every numeric value in the text, however it happens to be spelled."""
    values = set(_number_counts(text))
    lowered = (text or "").lower().replace("-", "").replace(" ", "")
    for word, digits in _NUMBER_WORD_VALUES.items():
        if word in lowered:
            values.add(digits)
    return values


def invented_facts(allowed: str, delivered: str):
    """Facts in ``delivered`` (what the client will actually read) with no basis in ``allowed``.

    ``allowed`` is everything Sabri was legitimately working from: Valentina's unsent writing,
    the client's own latest message, and the conversation already on her screen. A number,
    card, sign or planet in his bubbles that appears nowhere in that text was made up by him,
    and a made-up fact is the one failure this reading cannot survive.

    Returns {"numbers": [...], "terms": [...], "rewrites": [...]} — all empty means clean. Pure."""
    allowed_numbers = _number_values(allowed)
    allowed_terms = set(_term_counts(allowed))
    delivered_terms = set(_term_counts(delivered))
    rewrites = []
    for match in _SPELLED_OUT_VALUE.finditer(delivered or ""):
        word = match.group(2).lower()
        if word not in _NUMBER_WORD_VALUES:
            continue                       # "life path energy" — not a value at all
        label = match.group(1).replace(" ", r"\s+")
        stated_as_digit = re.search(
            r"\b" + label + r"\s+" + _NUMBER_WORD_VALUES[word] + r"\b",
            allowed or "", re.IGNORECASE,
        )
        if stated_as_digit:
            rewrites.append(match.group(0))
    return {
        "numbers": sorted(
            set(_number_counts(delivered)) - allowed_numbers, key=lambda x: (len(x), x)
        ),
        "terms": sorted(delivered_terms - allowed_terms),
        "rewrites": sorted(rewrites),
    }


def has_invented_facts(invented) -> bool:
    return bool(invented["numbers"] or invented["terms"] or invented["rewrites"])


def _audit_sabri_attempt(chat_id, turn_number, attempt, raw, dropped, invented, *, delivered):
    """Append one two_role sabri_delivery audit row for this attempt (the raw Sabri output +
    advisory notes: any dropped return-acks and any fabricated fact). Never affects the
    turn — errors swallowed; only logs when a chat_id context was threaded in."""
    if chat_id is None:
        return
    try:
        import json

        from app.services.ai.reading_draft_log import get_draft_log

        notes = {}
        if dropped:
            notes["dropped_return_acks"] = dropped
        if invented and has_invented_facts(invented):
            notes["invented_facts"] = invented
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
    already_seen: str = "",
    names=(),
    sabri_call=None,
    max_attempts: int = None,
    fallback_message: str = FALLBACK_MESSAGE,
    chat_id=None,
    turn_number: int = 0,
):
    """Run one Sabri turn end-to-end → the messages to send, in order.

    call → canonicalise any protected fact he repeated → parse → strip return-acks →
    remove deterministic AI tells → reject fabricated facts. A fabricated fact or an empty
    turn gets a bounded retry; if every attempt fails, one exact sentence of Valentina's own
    writing goes out instead, and only if there is none does the generic line.

    What he chose to HOLD is no longer read back out of his reply. The reserve belongs to the
    caller and accumulates there; his @@RESERVE@@ block is still parsed off so held prose can
    never leak to the client, and is then discarded. ``already_seen`` is the conversation the
    client is looking at — passed in only so a fact she was told earlier does not read as
    invented. ``sabri_call(input) -> raw text`` is injectable for tests."""
    from app.services.ai.reading_pipeline import is_return_acknowledgment

    s = get_app_settings()
    attempts = max_attempts or s.SABRI_DELIVERY_MAX_ATTEMPTS
    call = sabri_call or run_sabri
    source = (source_content or "").strip()
    # Everything he is allowed to state a fact from: Valentina's unsent writing, plus what is
    # already on the client's screen (her own words included, so quoting her back is not
    # "invention"). Anything outside this he made up.
    allowed = "\n".join(part for part in (source, already_seen or "") if part)

    for attempt in range(1, attempts + 1):
        try:
            raw = call(sabri_input)
        except Exception as e:  # noqa: BLE001 — a Sabri failure must never crash the chat
            logger.warning("sabri_call_failed", attempt=attempt, error=str(e))
            continue
        canonical_raw = _canonicalize_protected_literals(
            raw, source_content=source, names=names
        )
        bubbles, _held = parse_sabri_output(canonical_raw)
        # Strip return-acks on the whole message, so a multi-word ack phrase ("since we last
        # spoke") is matched as one piece rather than across a boundary.
        dropped = [b for b in bubbles if is_return_acknowledgment(b)]
        bubbles = [b for b in bubbles if not is_return_acknowledgment(b)]
        bubbles = [cleaned for b in bubbles if (cleaned := sanitize_delivery_text(b))]
        if dropped:
            logger.warning("sabri_dropped_return_acks", count=len(dropped), dropped=dropped)
        invented = invented_facts(allowed, " ".join(bubbles)) if bubbles else None
        if invented and has_invented_facts(invented):
            logger.warning("sabri_invented_fact", attempt=attempt, **invented)
            _audit_sabri_attempt(
                chat_id, turn_number, attempt, canonical_raw, dropped, invented, delivered=False
            )
            continue
        _audit_sabri_attempt(
            chat_id, turn_number, attempt, canonical_raw, dropped, invented,
            delivered=bool(bubbles),
        )
        if bubbles:
            logger.info("sabri_turn_ready", bubbles=len(bubbles),
                        words=sum(len(b.split()) for b in bubbles), attempt=attempt)
            return bubbles
        logger.warning("sabri_turn_empty_retrying", attempt=attempt)

    source_bubbles = _source_preserving_fallback(source)
    if source_bubbles:
        logger.warning("sabri_turn_source_preserving_fallback")
        return source_bubbles
    logger.warning("sabri_turn_fallback")
    return [fallback_message]
