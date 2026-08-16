"""Sabri (two-role delivery director): the plain-text output parser, the deterministic
fact-preservation check (never alter/drop a number/name/card), the input builder, and the
end-to-end sabri_deliver (return-ack strip + empty-retry). No real model — the call is injected."""

import re

from app.services.ai import reading_sabri as S
from app.services.ai.reading_llm import FALLBACK_MESSAGE


# ── output parser: bubbles + opaque @@RESERVE@@ boundary ──────────────────────
def test_parse_bubbles_and_reserve():
    raw = (
        "ok so the first thing\n\n"
        "the cards arent showing me a man who doesnt care\n\n"
        "@@RESERVE@@\n"
        "He is a Pisces with a life path 7.\n\n"
        "The Hermit came up for his pattern."
    )
    bubbles, reserve = S.parse_sabri_output(raw)
    assert bubbles == ["ok so the first thing",
                       "the cards arent showing me a man who doesnt care"]
    # reserve is OPAQUE: kept verbatim, internal blank line preserved, NOT re-split into bubbles
    assert reserve.startswith("He is a Pisces")
    assert "\n\n" in reserve
    assert "The Hermit came up for his pattern." in reserve


def test_parse_no_reserve():
    bubbles, reserve = S.parse_sabri_output("just this\n\nand this")
    assert bubbles == ["just this", "and this"]
    assert reserve == ""


def test_parse_first_reserve_line_is_sole_boundary():
    # The delimiter flaw the judge panel flagged: a later '@@RESERVE@@' inside opaque reserve
    # must NOT re-split. Only the FIRST exact @@RESERVE@@ line is the boundary.
    raw = "msg one\n\n@@RESERVE@@\nheld a\n@@RESERVE@@\nheld b"
    bubbles, reserve = S.parse_sabri_output(raw)
    assert bubbles == ["msg one"]
    assert reserve == "held a\n@@RESERVE@@\nheld b"


def test_parse_tolerates_code_fences():
    raw = "```\nhey u\n```\n\nok"
    bubbles, _ = S.parse_sabri_output(raw)
    assert bubbles == ["hey u", "ok"]


def test_parse_inline_sentinel_does_not_leak():
    # If Sabri puts the sentinel inline (off-contract), the marker + held prose must NEVER reach
    # the client. Partition on the first sentinel occurrence anywhere is the boundary.
    bubbles, reserve = S.parse_sabri_output("ok here u go @@RESERVE@@ he is a pisces life path 7")
    assert all(S.RESERVE_SENTINEL not in b for b in bubbles)   # no marker leaks
    assert "he is a pisces life path 7" not in "\n".join(bubbles)  # held prose not shown
    assert reserve == "he is a pisces life path 7"


# ── message length is Sabri's judgment: no cap, no chunker ───────────────────
BIG = (
    "i pulled the hermit next to the six of cups for him and it confirmed it — he's not gone. "
    "he's sitting in this low-grade shame right now, the kind a man feels when he knows he's been "
    "inconsistent and doesn't know how to re-enter without acknowledging it. there was a moment, "
    "last time you two spoke, where you expected him to step forward and he just... stood there. "
    "he replays that too. he tells himself he'll reach out tomorrow. tomorrow becomes next week. "
    "the longer the gap the heavier the shame, and the heavier the shame the harder it is to pick "
    "up the phone"
)


def test_a_long_message_is_delivered_whole():
    """The 26-word chunker is gone. If Sabri writes a paragraph, she receives a paragraph.

    A person sometimes says one word and sometimes says a lot in one breath, and a constant
    cannot tell those apart. The old backstop split every message at 26 words, which meant
    the code, not Sabri, decided what a message was."""
    bubbles = S.sabri_deliver("x", source_content=BIG, sabri_call=lambda _i: BIG)
    assert len(bubbles) == 1                       # ONE message, not five
    assert len(bubbles[0].split()) > 100           # and it kept every word
    assert bubbles[0].endswith("up the phone")


def test_message_boundaries_come_from_his_blank_lines():
    raw = "one word\n\n" + BIG + "\n\nand a short one after it"
    bubbles = S.sabri_deliver("x", source_content=BIG, sabri_call=lambda _i: raw)
    assert len(bubbles) == 3                  # exactly his three paragraphs
    assert bubbles[0] == "one word"           # a one-word message stays one word
    assert len(bubbles[1].split()) > 100      # a long one is not re-split
    assert bubbles[2] == "and a short one after it"


def test_the_chunker_is_gone():
    assert not hasattr(S, "chunk_message")
    assert not hasattr(S, "chunk_bubbles")
    assert not hasattr(S, "_next_delivery_slice")


def test_return_ack_is_stripped_whole():
    long_ack = ("ok so honestly the energy around you is so incredibly heavy and tangled and "
                "complicated right now and everything has really shifted a lot since we last "
                "spoke about him")
    bubbles = S.sabri_deliver("x", source_content="",
                              sabri_call=lambda _i: long_ack + "\n\nthe cards are clear")
    assert all("last spoke" not in b.lower() for b in bubbles)     # not leaked
    assert bubbles == ["the cards are clear"]


# ── fact check: INVENTION, not omission ──────────────────────────────────────
# Sabri now sees the whole unsent reading and sends a slice of it, so most source facts are
# supposed to be absent from any one turn. What must never happen is a fact reaching the
# client that Valentina did not write.
def test_holding_a_fact_back_is_not_a_violation():
    src = "she has a life path 5. the Knight of Cups is his card. he is a Pisces. born march 3."
    sent = "hes a pisces, thats the whole shape of it"   # everything else held for later
    assert not S.has_invented_facts(S.invented_facts(src, sent))


def test_an_invented_card_is_caught():
    src = "the Tower is what came up for him"
    sent = "the Knight of Cups says he is coming back"  # she never wrote that card
    assert "knight of cups" in S.invented_facts(src, sent)["terms"]


def test_an_invented_number_is_caught():
    src = "his fear is old"
    assert S.invented_facts(src, "hes a life path 7 babe")["numbers"] == ["7"]


def test_a_number_the_client_herself_gave_is_not_invented():
    """She said it; repeating it back is not fabrication. ``allowed`` includes the screen."""
    allowed = "he is a life path 7" + "\n" + "client: my ex is a life path 7"
    assert not S.has_invented_facts(S.invented_facts(allowed, "yeah a life path 7 does that"))


def test_the_word_for_digit_rewrite_is_still_caught():
    """A value she stated as a DIGIT arriving as a word reads as a psychic who is unsure,
    and contains no digit for the invented-number check to see."""
    src = "her life path 5 rules her"
    assert S.invented_facts(src, "ur life path five rules u")["rewrites"] == ["life path five"]
    # ...and the correct rendering is not flagged
    assert not S.has_invented_facts(S.invented_facts(src, "ur life path 5 rules u"))


def test_prose_spelling_and_chat_spelling_are_the_same_fact():
    """The first live turn after this check shipped was rejected twice for this.

    Valentina writes prose and wrote "Life Path Seven". Sabri writes chat and wrote
    "life path 7" — the same fact, correctly carried — and the check called the digit
    fabricated, burning two Sonnet calls and throwing away the whole reading."""
    src = "Her Life Path Seven can hold more than she thinks."
    assert not S.has_invented_facts(S.invented_facts(src, "ur life path 7 can hold this"))
    # and the other way round: she wrote a digit, he spelled it out in ordinary prose
    assert not S.has_invented_facts(
        S.invented_facts("he is 7 years older", "hes seven years older babe")
    )
    # a value she never mentioned at all is still caught
    assert S.invented_facts(src, "ur life path 3 says otherwise")["numbers"] == ["3"]


def test_life_path_energy_is_not_treated_as_a_value():
    assert not S.has_invented_facts(
        S.invented_facts("her life path 5", "ur life path energy is loud")
    )


def test_has_invented_facts():
    assert S.has_invented_facts({"numbers": ["5"], "terms": [], "rewrites": []})
    assert not S.has_invented_facts({"numbers": [], "terms": [], "rewrites": []})


def test_sabri_retries_when_he_invents_a_card_then_delivers_the_clean_attempt():
    src = "the Tower is what came up for him."
    calls = {"n": 0}

    def drifting(_inp):
        calls["n"] += 1
        if calls["n"] == 1:
            return "the Knight of Cups says hes coming back"
        return "the Tower is the whole story here"

    bubbles = S.sabri_deliver("x", source_content=src, sabri_call=drifting, max_attempts=2)
    assert calls["n"] == 2
    assert "Knight of Cups" not in " ".join(bubbles)
    assert "Tower" in " ".join(bubbles)


# ── input builder: two blocks that must never be confused ────────────────────
def test_build_input_separates_already_seen_from_never_sent():
    """The one way this design fails is Sabri confusing what she has read with what she has
    not. Both blocks are present, labelled, and say the opposite thing about sending."""
    inp = S.build_sabri_input(
        client_message="will he come back?",
        session_memory="client: hi\nyou: hey love",
        source_content="Here is the complete reading prose.",
        waited_seconds=41,
    )
    assert "ALREADY SEEN BY THE CLIENT" in inp
    assert "NEVER send any of it again" in inp
    assert "you: hey love" in inp
    assert "WRITTEN BUT NEVER SENT" in inp
    assert "Nothing here has reached her" in inp
    assert "Here is the complete reading prose." in inp
    assert inp.index("ALREADY SEEN") < inp.index("WRITTEN BUT NEVER SENT")
    assert "will he come back?" in inp


def test_build_input_carries_the_wait_clock():
    inp = S.build_sabri_input(
        client_message="?", session_memory="", source_content="prose", waited_seconds=41.6,
    )
    assert "WAITING 41 SECONDS" in inp
    assert "your judgment alone" in inp


def test_build_input_has_no_message_target_or_length_cap():
    inp = S.build_sabri_input(
        client_message="?", session_memory="", source_content="prose", waited_seconds=10,
    )
    assert "SHORT messages" not in inp
    assert "hold the majority" not in inp


def test_build_input_nothing_unsent():
    inp = S.build_sabri_input(
        client_message="haha ok", session_memory="", source_content="", waited_seconds=3,
    )
    assert "Nothing unsent from Valentina" in inp
    assert "Do NOT invent any reading substance" in inp


# ── sabri_deliver: strip return-acks, retry only on empty ─────────────────────
def test_sabri_deliver_strips_return_acks():
    raw = "welcome back darling\n\nok so the cards\n\n@@RESERVE@@\nheld line"
    bubbles = S.sabri_deliver("x", source_content="", sabri_call=lambda _i: raw)
    assert bubbles == ["ok so the cards"]          # the return-ack bubble is dropped


def test_held_prose_never_reaches_the_client():
    """His @@RESERVE@@ block is ignored for state now, but it must still never be shown."""
    raw = "here is the bit that lands\n\n@@RESERVE@@\nHe is a Pisces with a life path 7."
    bubbles = S.sabri_deliver("x", source_content="", sabri_call=lambda _i: raw)
    assert bubbles == ["here is the bit that lands"]
    assert "life path 7" not in " ".join(bubbles)
    assert all(S.RESERVE_SENTINEL not in b for b in bubbles)


def test_sabri_deliver_retries_on_empty_then_succeeds():
    calls = {"n": 0}

    def flaky(_inp):
        calls["n"] += 1
        return "" if calls["n"] == 1 else "second try lands\n\nok"

    bubbles = S.sabri_deliver("x", source_content="", sabri_call=flaky, max_attempts=2)
    assert calls["n"] == 2
    assert bubbles == ["second try lands", "ok"]


def test_sabri_deliver_fallback_never_empty():
    # No dead silence: every attempt yields no bubbles -> a fallback line.
    bubbles = S.sabri_deliver("x", source_content="", sabri_call=lambda _i: "", max_attempts=2)
    assert bubbles == [FALLBACK_MESSAGE]


def test_sabri_deliver_fallback_on_all_calls_raising():
    def boom(_inp):
        raise RuntimeError("529 overloaded")
    bubbles = S.sabri_deliver("x", source_content="", sabri_call=boom, max_attempts=2)
    assert bubbles == [FALLBACK_MESSAGE]


def test_source_preserving_fallback_uses_valentinas_own_sentence():
    """When every attempt fails, one true sentence of hers beats a generic holding line —
    and nothing is consumed, because the unsent pile is owned by the caller now."""
    source = (
        "The Five of Pentacles marks 14 August 1992. "
        "The timing stays before the end of summer."
    )
    bubbles = S.sabri_deliver(
        "x", source_content=source, sabri_call=lambda _input: "", max_attempts=2
    )
    assert bubbles == ["The Five of Pentacles marks 14 August 1992."]


def test_sabri_rewrites_around_a_fact_but_the_fact_survives_exactly():
    source = (
        "Daniel was born 14 August 1992. The Five of Pentacles shows the fear, "
        "and contact comes before the end of summer."
    )
    bubbles = S.sabri_deliver(
        "x", source_content=source, max_attempts=1, names=("Daniel",),
        sabri_call=lambda _i: (
            "ngl daniel has that fear sitting heavy, the five of pentacles is the anchor\n\n"
            "his dob stays 14 August 1992 and contact comes before the end of summer"
        ),
    )
    delivered = "\n".join(bubbles)
    assert "Five of Pentacles" in delivered      # canonical capitalisation restored
    assert "14 August 1992" in delivered
    assert "before the end of summer" in delivered
    assert "Daniel" in delivered
    assert "Daniel was born 14 August 1992" not in delivered  # prose around it was rewritten


def test_sabri_sees_the_whole_reading_not_a_three_sentence_slice():
    """The change item 1 exists for. He used to be handed three sentences and ordered to
    deliver all of them, so his selection ability was never used at all."""
    source = (
        "Daniel feels the distance. The Moon names the uncertainty. "
        "Contact comes before the end of summer. This fourth sentence is his shame. "
        "This fifth sentence is the doorway."
    )
    sabri_input = S.build_sabri_input(
        client_message="what do you see?", session_memory="", source_content=source,
        waited_seconds=30,
    )
    seen = {}

    def rewritten(model_input):
        seen["input"] = model_input
        return "ngl the distance is real"

    S.sabri_deliver(sabri_input, source_content=source, sabri_call=rewritten, max_attempts=1)
    assert "This fourth sentence is his shame." in seen["input"]
    assert "This fifth sentence is the doorway." in seen["input"]
    assert "SYSTEM DELIVERY BOUNDARY" not in seen["input"]
    assert "Rewrite every part of the source slice" not in seen["input"]


def test_he_may_choose_from_the_far_end_of_the_reading():
    """Selection means he is not restricted to the top of what she wrote."""
    source = (
        "The first perception is about her mother. The second is about work. "
        "The Tower is the one that answers what she just asked."
    )
    bubbles = S.sabri_deliver(
        "x", source_content=source, max_attempts=1,
        sabri_call=lambda _i: "the Tower is the whole answer here babe",
    )
    assert "Tower" in " ".join(bubbles)
    assert "mother" not in " ".join(bubbles)


def test_sabri_canonicalizes_an_extra_lowercase_proper_name_mention():
    source = "Maya feels the distance. The Moon names it. Contact comes in July."
    bubbles = S.sabri_deliver(
        "x", source_content=source, max_attempts=1, names=("Maya",),
        sabri_call=lambda _i: "maya, this is heavy, and the moon is loud",
    )
    delivered = " ".join(bubbles)
    assert "maya" not in delivered
    assert "Maya" in delivered


def test_sabri_deterministic_ai_tell_cleanup():
    raw = (
        "### Here's the thing: **he is frozen** — but not gone\n\n"
        "1. what I’m seeing is `the contact window` – late summer\u200b"
    )
    bubbles = S.sabri_deliver("x", source_content="", sabri_call=lambda _input: raw)
    delivered = " ".join(bubbles)
    assert delivered == "he is frozen, but not gone the contact window - late summer"
    assert "—" not in delivered
    assert "–" not in delivered
    assert "**" not in delivered
    assert "`" not in delivered
    assert "here's the thing" not in delivered.lower()
    assert "what i’m seeing is" not in delivered.lower()


def test_sabri_prompt_requires_real_rewrite_and_forbids_dashes():
    assert "MUST genuinely paraphrase" in S.SABRI_SYSTEM_PROMPT
    assert "Do not merely split" in S.SABRI_SYSTEM_PROMPT
    assert "an em dash (—)" in S.SABRI_SYSTEM_PROMPT
    assert "an en dash (–)" in S.SABRI_SYSTEM_PROMPT
    assert "[[KEEP_0001]]" in S.SABRI_SYSTEM_PROMPT


# ── sentence openers are not proper names ────────────────────────────────────
def test_sentence_openers_do_not_rewrite_ordinary_words():
    """The defect live clients saw: "this has been sitting with you For weeks".

    Valentina writes prose. Every sentence she began with "For" or "Like" was
    harvested as a proper name and then force-applied, case-insensitively, to
    every later occurrence in Sabri's delivery.
    """
    source = (
        "For weeks she has been holding this alone, waiting for something to shift. "
        "Like a door she keeps propped open, like she cannot quite close it. "
        "Before anything else she needs to hear that, before the rest of it lands."
    )
    delivery = (
        "you've known for a while haven't you, like deep down, "
        "and this has been sitting with you for weeks before today"
    )
    out = S._canonicalize_protected_literals(delivery, source_content=source)
    assert "For weeks" not in out
    assert "like deep" in out
    assert out == delivery, out


def test_a_name_at_a_sentence_start_is_still_protected():
    """A word never written in lower case is a name, wherever it appears."""
    source = "Daniel was born in the spring. The pull here is his."
    out = S._canonicalize_protected_literals(
        "i keep coming back to daniel in this", source_content=source
    )
    assert "Daniel" in out


def test_a_name_used_mid_sentence_is_protected():
    source = "The pull here is Marcus. Marcus has been circling back for months."
    out = S._canonicalize_protected_literals(
        "i keep coming back to marcus in this", source_content=source
    )
    assert "Marcus" in out
