"""Sabri (two-role delivery director): the plain-text output parser, the deterministic
fact-preservation check (never alter/drop a number/name/card), the input builder, and the
end-to-end sabri_deliver (return-ack strip + empty-retry). No real model — the call is injected."""

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


# ── deterministic message-length chunker (landingpage2 approach) ──────────────
BIG = (
    "i pulled the hermit next to the six of cups for him and it confirmed it — he's not gone. "
    "he's sitting in this low-grade shame right now, the kind a man feels when he knows he's been "
    "inconsistent and doesn't know how to re-enter without acknowledging it. there was a moment, "
    "last time you two spoke, where you expected him to step forward and he just... stood there. "
    "he replays that too. he tells himself he'll reach out tomorrow. tomorrow becomes next week. "
    "the longer the gap the heavier the shame, and the heavier the shame the harder it is to pick "
    "up the phone"
)


def test_chunk_long_message_enforces_word_cap():
    out = S.chunk_message(BIG, 26)
    assert len(BIG.split()) > 100                         # the 127s message
    assert len(out) >= 5
    assert all(len(m.split()) <= 26 for m in out)         # HARD cap — no 50-100+ word message


def test_chunk_splits_on_sentence_boundaries():
    out = S.chunk_message("short first sentence here. and a second one after it.", 26)
    # both fit under the cap, but they're grouped as whole sentences (not split mid-sentence)
    assert out == ["short first sentence here. and a second one after it."]


def test_chunk_short_message_unchanged():
    assert S.chunk_message("hes a pisces with a life path 7", 26) == ["hes a pisces with a life path 7"]


def test_chunk_bubbles_never_merges_across_paragraph_break():
    out = S.chunk_bubbles(["short one", BIG, "ok last"], 26)
    assert out[0] == "short one"                          # first bubble intact, not merged forward
    assert out[-1] == "ok last"                           # last bubble intact, not merged backward
    assert all(len(m.split()) <= 26 for m in out)


def test_chunk_single_overlong_sentence_hard_split():
    # one run-on "sentence" with no terminal punctuation, 40 words -> split to <=26
    run_on = " ".join(f"w{i}" for i in range(40))
    out = S.chunk_message(run_on, 26)
    assert len(out) == 2 and all(len(m.split()) <= 26 for m in out)


def test_chunk_preserves_card_names_across_split():
    # a named card must not be broken across two messages (fidelity)
    out = S.chunk_message(BIG, 26)
    joined = " ".join(out).lower()
    assert "six of cups" in joined and "hermit" in joined


def test_sabri_deliver_applies_length_cap():
    raw = BIG + "\n\n@@RESERVE@@\nheld stuff"
    bubbles, reserve = S.sabri_deliver("x", source_content="", sabri_call=lambda _i: raw)
    assert all(len(b.split()) <= 26 for b in bubbles)     # the 106-word bubble was chunked
    assert reserve == "held stuff"


def test_chunk_never_splits_multiword_card_in_hard_split():
    # Review finding (high): a >26-word sentence with NO clause punctuation used to hard word-count
    # split, breaking "the Knight of Cups" across two messages. Atom-aware split keeps it whole.
    inp = ("i really feel like the cards are showing me something huge and heavy and important "
           "about you and your family and your future and the Knight of Cups is here")
    out = S.chunk_message(inp, 26)
    assert all(len(m.split()) <= 26 for m in out)
    assert any("knight of cups" in m.lower() for m in out)         # card name intact in ONE message
    # and it is never severed: no message has "knight" without the full "knight of cups"
    assert all("knight" not in m.lower() or "knight of cups" in m.lower() for m in out)


def test_chunk_preserves_spaced_dash():
    # Review finding (low): the spaced en/em-dash used to be consumed by the clause split.
    inp = ("ok so listen the reading is really clear here and there is a lot to say about your "
           "path so here it is your key years are 2020 – 2024 for love.")
    joined = " ".join(S.chunk_message(inp, 26))
    assert "–" in joined and "2020" in joined and "2024" in joined


def test_return_ack_split_across_chunk_boundary_still_stripped():
    # Review finding (high): chunking BEFORE the strip let a return-ack phrase split across a chunk
    # boundary slip through. Stripping first (on the un-chunked bubble) drops it whole.
    long_ack = ("ok so honestly the energy around you is so incredibly heavy and tangled and "
                "complicated right now and everything has really shifted a lot since we last "
                "spoke about him")
    bubbles, _ = S.sabri_deliver("x", source_content="",
                                 sabri_call=lambda _i: long_ack + "\n\nthe cards are clear")
    assert all("last spoke" not in b.lower() for b in bubbles)     # not leaked
    assert bubbles == ["the cards are clear"]


# ── fact preservation: numbers, cards, signs/planets, names ───────────────────
def test_missing_facts_none_when_preserved_across_bubbles_and_reserve():
    src = "she has a life path 5. the Knight of Cups is his card. he is a Pisces. born march 3."
    # 5 + Pisces sent (voiced, lowercased); Knight of Cups + 3 held in reserve → nothing dropped
    delivered = "u have a life path 5 babe\n\nhes a pisces\n@@RESERVE@@ he pulled the knight of cups. born march 3."
    miss = S.missing_facts(src, delivered, names=["daniel", "sarah"])
    assert miss == {"numbers": [], "terms": [], "names": []}


def test_missing_facts_catches_altered_number():
    # "life path 5" restated as "life path five" → the digit 5 disappears → caught
    miss = S.missing_facts("her life path 5 rules her", "ur life path five rules u")
    assert miss["numbers"] == ["5"]


def test_missing_facts_catches_dropped_card_and_name():
    src = "the Knight of Cups is daniel's card"
    delivered = "the knight card is his"          # card renamed away, name dropped
    miss = S.missing_facts(src, delivered, names=["daniel"])
    assert "knight of cups" in miss["terms"]
    assert "daniel" in miss["names"]


def test_missing_facts_multiword_card_not_masked_by_single_word():
    # "the Tower" present but "eight of cups" dropped — matched independently
    src = "the Tower and the eight of cups"
    delivered = "the tower is loud"
    miss = S.missing_facts(src, delivered)
    assert miss["terms"] == ["eight of cups"]


def test_missing_facts_multiset_catches_altered_number_when_digit_survives_elsewhere():
    # Set-based check MISSED this (review finding): "life path 5" reworded to "life path five"
    # while a separate "5 years older" keeps a 5 alive. Multiset (Counter) catches the dropped one.
    src = "your life path 5 and he is 5 years older"
    delivered = "your life path five and he is 5 years older"   # one 5 -> "five"
    assert S.missing_facts(src, delivered)["numbers"] == ["5"]


def test_missing_facts_multiset_catches_repeated_term_partial_drop():
    src = "the Tower now and the Tower again"                    # Tower twice
    delivered = "the tower now"                                  # once
    assert S.missing_facts(src, delivered)["terms"] == ["the tower"]


def test_has_missing_facts():
    assert S.has_missing_facts({"numbers": ["5"], "terms": [], "names": []})
    assert not S.has_missing_facts({"numbers": [], "terms": [], "names": []})


# ── input builder: new reading vs held reserve vs empty ───────────────────────
def test_build_input_new_reading():
    inp = S.build_sabri_input(
        client_message="will he come back?", chat_transcript=[],
        source_content="Here is the complete reading prose.", is_new=True, turn_target=10,
    )
    assert "VALENTINA'S COMPLETE NEW READING" in inp
    assert "Here is the complete reading prose." in inp
    assert "will he come back?" in inp
    assert "about 10 messages" in inp


def test_build_input_from_reserve():
    inp = S.build_sabri_input(
        client_message="wow", chat_transcript=[{"role": "psychic", "content": "hey"}],
        source_content="held verbatim content", is_new=False, turn_target=10,
    )
    assert "HELD RESERVE" in inp
    assert "held verbatim content" in inp
    assert "CONVERSATION SO FAR" in inp


def test_build_input_empty_reserve_short_reply():
    inp = S.build_sabri_input(
        client_message="haha ok", chat_transcript=[], source_content="", is_new=False, turn_target=10,
    )
    assert "No held reserve and no new reading" in inp
    assert "Do NOT invent any reading substance" in inp


# ── sabri_deliver: strip return-acks, retry only on empty ─────────────────────
def test_sabri_deliver_strips_return_acks():
    raw = "welcome back darling\n\nok so the cards\n\n@@RESERVE@@\nheld line"
    bubbles, reserve = S.sabri_deliver("x", source_content="", sabri_call=lambda _i: raw)
    assert bubbles == ["ok so the cards"]          # the return-ack bubble is dropped
    assert reserve == "held line"


def test_sabri_deliver_retries_on_empty_then_succeeds():
    calls = {"n": 0}

    def flaky(_inp):
        calls["n"] += 1
        return "" if calls["n"] == 1 else "second try lands\n\nok"

    bubbles, _ = S.sabri_deliver("x", source_content="", sabri_call=flaky, max_attempts=2)
    assert calls["n"] == 2
    assert bubbles == ["second try lands", "ok"]


def test_sabri_deliver_fallback_never_empty():
    # No dead silence: every attempt yields no bubbles -> a fallback line, empty reserve.
    bubbles, reserve = S.sabri_deliver("x", source_content="", sabri_call=lambda _i: "",
                                       max_attempts=2)
    assert bubbles == [FALLBACK_MESSAGE]
    assert reserve == ""


def test_sabri_deliver_fallback_on_all_calls_raising():
    def boom(_inp):
        raise RuntimeError("529 overloaded")
    bubbles, reserve = S.sabri_deliver("x", source_content="", sabri_call=boom, max_attempts=2)
    assert bubbles == [FALLBACK_MESSAGE]


def test_sabri_deliver_preserves_reserve_verbatim():
    src = "he is a Pisces life path 7"
    raw = "hes a pisces\n\n@@RESERVE@@\nlife path 7 is why he retreats"
    bubbles, reserve = S.sabri_deliver("x", source_content=src, sabri_call=lambda _i: raw)
    # nothing dropped: pisces sent, life path 7 held — combined preserves both
    assert not S.has_missing_facts(S.missing_facts(src, "\n".join(bubbles) + "\n" + reserve))
    assert reserve == "life path 7 is why he retreats"
