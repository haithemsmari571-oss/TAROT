"""The live defect of 2026-08-16, chat 20, session 170.

    15:58:33.6  client    it is indeed                      (message 1618)
    15:58:38.4  Valentina yeah i can feel that landing.     (its presence line)
    15:58:41.1  client    when will i leave the country     (message 1620)
                          ...two minutes, no typing indicator at all...
    16:00:00.0  Valentina yeah
    16:00:10.5  Valentina and i feel u on that, like really feel it

Two faults in one turn, both proven from the structured logs:

FAULT A. `reading_burst_message_noted` recorded `first_of_turn: false` and
`read_pause_ms: null` for message 1620, because 1618 was still unanswered so its
`_TURN_MARKS` entry was still set. The presence pass was gated on `first_of_turn`, so
1620 got no line AND armed no typing watchdog. The dots that were on from 1618 were
cleared by the client's own message echo, and nothing turned them back on for 79 seconds.

FAULT B. 1618 never generated on its own — 1620 arrived first and reset the burst window,
so both were claimed as one turn and joined oldest-first under the heading "CLIENT'S
LATEST MESSAGE". Sabri answered the older one.

And the wait he was told about was 13.5 seconds, read once when generation started; by the
time he actually ran, she had been waiting 55. That is how two minutes ended in "yeah".
"""

import inspect

from app.services.ai import reading_burst as B
from app.services.ai import reading_duo as D
from app.services.ai import reading_sabri as S


# ── 1. every client turn gets a presence line, with no branch that skips it ───
def test_the_presence_pass_is_no_longer_gated_on_first_of_turn():
    source = inspect.getsource(B.note_client_message)
    start = source.index("_start_first_word(")
    # There must be no `if first_of_turn:` guarding the call any more.
    assert "if first_of_turn:" not in source
    # ...and the read pause is computed for every message, not only the first.
    assert "read_pause_ms(content) if first_of_turn else None" not in source
    assert source.index("read_pause_ms(content)") < start


def test_a_rapid_burst_still_produces_one_line_by_cancelling_the_previous():
    """Removing the gate must not mean three texts get three reaction lines."""
    source = inspect.getsource(B._start_first_word)
    assert "superseded" in source
    assert ".cancel()" in source


def test_the_presence_clock_runs_from_the_newest_message():
    """1620's read pause and ceiling must be measured from 1620, not from 1618."""
    source = inspect.getsource(B.note_client_message)
    assert "_start_first_word(\n        chat_id, chat_session_id, time.perf_counter()" in source


# ── 2. the indicator is on from that line until delivery ─────────────────────
def test_the_watchdog_is_rearmed_by_every_message():
    """The dots are cleared client-side by her own message echo, so every message has to
    re-arm them. The watchdog lives inside _start_first_word, which now always runs."""
    assert "_stop_typing_presence" in inspect.getsource(B._start_first_word)
    assert "_hold_typing_presence" in inspect.getsource(B._start_first_word)


def test_a_dead_generation_still_clears_the_indicator():
    source = inspect.getsource(B._execute_claim)
    assert "_stop_typing_presence" in source
    assert "broadcast_typing" in source


# ── 3. Sabri answers the newest message, never a previous one ────────────────
def test_the_newest_message_stands_alone_and_the_rest_are_context():
    inp = S.build_sabri_input(
        client_message="when will i leave the country",
        session_memory="",
        source_content="prose",
        waited_seconds=55,
        earlier_messages=["it is indeed"],
    )
    assert "THE MESSAGE YOU ARE ANSWERING" in inp
    assert "about THIS and nothing else" in inp
    # the older one is present, but demoted and explicitly not the subject
    assert "SHE ALSO SENT THESE MOMENTS EARLIER" in inp
    assert "Do NOT make any of them the subject" in inp
    assert inp.index("it is indeed") < inp.index("when will i leave the country")
    assert inp.index("SHE ALSO SENT") < inp.index("THE MESSAGE YOU ARE ANSWERING")


def test_a_single_message_turn_has_no_earlier_block():
    inp = S.build_sabri_input(
        client_message="when will i leave the country",
        session_memory="", source_content="prose", waited_seconds=10,
    )
    assert "SHE ALSO SENT" not in inp
    assert "THE MESSAGE YOU ARE ANSWERING" in inp


def test_the_coordinator_hands_sabri_the_last_message_of_the_turn():
    source = inspect.getsource(B._generate_auto)
    assert "newest = contents[-1]" in source
    assert "earlier = contents[:-1]" in source
    assert "newest_message=newest" in source
    # Valentina still sees the whole turn: several texts are one thing being said.
    assert "reading_duo._duo_generate(\n        claim.chat_id,\n        turn," in source


# ── 4. a long wait may not open with a token message ─────────────────────────
def test_two_minutes_may_not_end_in_yeah():
    assert S.opens_with_a_token_message(["yeah"], 79) is True
    assert S.opens_with_a_token_message(["yeah", "and i feel u on that"], 79) is True


def test_a_short_opener_is_fine_when_she_has_not_been_waiting():
    assert S.opens_with_a_token_message(["yeah"], 6) is False
    assert S.opens_with_a_token_message(["yeah"], None) is False


def test_only_the_opening_is_judged():
    """A short line later in a turn is rhythm, not a token turn."""
    assert S.opens_with_a_token_message(
        ["ok so you asked about leaving the country and i want to answer it properly", "yeah"],
        79,
    ) is False


def test_a_token_opening_after_a_long_wait_is_retried_and_the_better_reply_wins():
    calls = {"n": 0}

    def flaky(_inp):
        calls["n"] += 1
        return "yeah" if calls["n"] == 1 else "ok so you asked about leaving and here is what i see"

    bubbles = S.sabri_deliver(
        "x", source_content="you asked about leaving and here is what i see",
        sabri_call=flaky, max_attempts=2, waited_seconds=79,
    )
    assert calls["n"] == 2
    assert bubbles[0].startswith("ok so you asked")


def test_the_same_token_opening_is_accepted_on_a_fast_turn():
    bubbles = S.sabri_deliver(
        "x", source_content="anything", sabri_call=lambda _i: "yeah",
        max_attempts=1, waited_seconds=5,
    )
    assert bubbles == ["yeah"]


# ── the wait Sabri is told about must be the real one ────────────────────────
def test_the_wait_is_read_again_after_valentina_finishes():
    """Read once at the top it is always about six seconds, the burst window, however long
    Valentina then takes. That is what told him she had waited 13 seconds out of 85."""
    source = inspect.getsource(D._duo_generate)
    valentina_at = source.index("_write_valentina_turn")
    clock_at = source.index("waited_seconds_now()")
    sabri_at = source.index("_sabri_turn(")
    assert valentina_at < clock_at < sabri_at


def test_the_live_clock_touches_no_database():
    """THE OUTAGE RULE: this runs between generation starting and delivery finishing."""
    source = inspect.getsource(B._generate_auto)
    clock = source[source.index("def _waited_now"):source.index("bubbles, reserve, route")]
    for forbidden in ("SessionLocal", "db.query", "db.commit", "_locked_row", "await"):
        assert forbidden not in clock, forbidden


# ── the token rule must never make things worse ──────────────────────────────
def test_a_short_but_substantial_opening_is_allowed():
    """Live regression: "you're not imagining it." was rejected twice at a five-word floor,
    and the fallback then shipped the same sentence in worse form. Four words can carry a
    reading; a token cannot."""
    assert S.opens_with_a_token_message(["you're not imagining it."], 49) is False
    assert S.opens_with_a_token_message(["yeah"], 49) is True
    assert S.opens_with_a_token_message(["mm yeah"], 49) is True


def test_a_token_opening_that_survives_the_retry_is_kept_not_replaced():
    """The nudge is a nudge. Retrying an identical prompt tends to give an identical reply,
    and shipping one sentence of raw prose instead is worse than what was rejected."""
    bubbles = S.sabri_deliver(
        "x", source_content="You are not imagining it. The whole shape of it is off.",
        sabri_call=lambda _i: "yeah", max_attempts=2, waited_seconds=90,
    )
    assert bubbles == ["yeah"]          # his own words, not the raw-prose fallback


def test_a_fabricated_fact_is_still_discarded_outright():
    """The token rule is soft; invention is not."""
    bubbles = S.sabri_deliver(
        "x", source_content="the fear is old", sabri_call=lambda _i: "hes a life path 7",
        max_attempts=2, waited_seconds=90,
    )
    assert "life path 7" not in " ".join(bubbles)
