"""Single-agent Reader (Phase 3) — parser, input builder, turn orchestration.
No real model calls: reader_call is injected. The streaming call itself (client.py)
is exercised only in the live A/B, not here."""

from app.services.ai.reading_contracts import HeldItem
from app.services.ai.reading_llm import FALLBACK_MESSAGE
from app.services.ai.reading_reader import (
    build_reader_input,
    is_short_turn,
    parse_reader_output,
    run_reader_turn,
    stream_reader_bubbles,
    thinking_for_turn,
)


# ── stream_reader_bubbles (incremental, pure over a delta source) ─────────────
def test_stream_bubbles_incremental_split_and_holds():
    deltas = ["hey", " love", "\n\n", "the cards", " are loud", "\n\n",
              "@@HOLD@@\nif she asks timing :: mid-nov\n"]
    events = list(stream_reader_bubbles(deltas))
    assert events == [
        ("bubble", "hey love"),
        ("bubble", "the cards are loud"),
        ("hold", ("if she asks timing", "mid-nov")),
    ]


def test_stream_bubbles_skips_return_ack_bubble():
    events = list(stream_reader_bubbles(["welcome back", "\n\n", "the deck is moving"]))
    assert events == [("bubble", "the deck is moving")]


def test_stream_bubbles_skips_return_ack_hold():
    events = list(stream_reader_bubbles(["real\n\n@@HOLD@@\nif X :: welcome back love\nif Y :: hes scared\n"]))
    assert events == [("bubble", "real"), ("hold", ("if Y", "hes scared"))]


# ── parse_reader_output ──────────────────────────────────────────────────────
def test_parse_splits_bubbles_on_blank_lines():
    text = "hey love\n\nsomething's moving in you\n\nwhat's his name?"
    bubbles, holds = parse_reader_output(text)
    assert bubbles == ["hey love", "something's moving in you", "what's his name?"]
    assert holds == []


def test_parse_extracts_hold_section():
    text = (
        "hey\n\nthe cards are loud\n\n"
        "@@HOLD@@\n"
        "if she mentions the friend :: theres a third person draining her\n"
        "if she brings up timing :: mid-november is when it cracks\n"
    )
    bubbles, holds = parse_reader_output(text)
    assert bubbles == ["hey", "the cards are loud"]
    assert holds == [
        ("if she mentions the friend", "theres a third person draining her"),
        ("if she brings up timing", "mid-november is when it cracks"),
    ]


def test_parse_tolerates_stray_fences_and_malformed_holds():
    text = "```\nhey love\n\nreal line\n```\n@@HOLD@@\nno separator here\nif X :: kept line\n"
    bubbles, holds = parse_reader_output(text)
    assert bubbles == ["hey love", "real line"]        # fence lines dropped
    assert holds == [("if X", "kept line")]            # malformed hold row skipped


def test_parse_empty_input():
    assert parse_reader_output("") == ([], [])
    assert parse_reader_output("   \n  ") == ([], [])


# ── build_reader_input ───────────────────────────────────────────────────────
def test_build_input_includes_sections_and_empty_buffer():
    out = build_reader_input(
        client_message="hi", chat_transcript=[], client_file=None,
        session_metadata={"first_session": True}, held_back_buffer=[],
    )
    assert "CLIENT MESSAGE:\nhi" in out
    assert "(none — first session)" in out
    assert "HELD-BACK BUFFER (deploy any whose trigger now fits" in out
    assert out.rstrip().endswith("(empty)")


def test_build_input_formats_transcript_and_held_buffer():
    tx = [{"role": "client", "content": "will he come back"},
          {"role": "reader", "content": "he's circling"}]
    buf = [HeldItem(text="third person draining her", hold_trigger="if she mentions the friend")]
    out = build_reader_input(
        client_message="my ex daniel", chat_transcript=tx, client_file="Name: aaa",
        session_metadata={}, held_back_buffer=buf,
    )
    assert "client: will he come back" in out
    assert "you: he's circling" in out
    assert "if she mentions the friend :: third person draining her" in out
    assert "Name: aaa" in out


def test_build_input_injects_authoritative_numerology_when_dob_given():
    from datetime import date

    out = build_reader_input(
        client_message="im sarah, july 22 1992", chat_transcript=[], client_file="Name: sarah",
        session_metadata={}, held_back_buffer=[],
        date_of_birth=date(1992, 7, 22), current_year=2026,
    )
    assert "KNOWN NUMEROLOGY (authoritative" in out
    assert "Life Path: 5" in out            # NOT 6 (the smoke-test bug)
    assert "Personal Year (2026): 3" in out


def test_build_input_accepts_iso_dob_string_from_dossier():
    out = build_reader_input(
        client_message="hi", chat_transcript=[], client_file=None,
        session_metadata={}, held_back_buffer=[],
        date_of_birth="1992-07-22", current_year=2026,
    )
    assert "Life Path: 5" in out
    assert "Personal Year (2026): 3" in out


def test_build_input_omits_numerology_when_no_dob():
    out = build_reader_input(
        client_message="hi", chat_transcript=[], client_file=None,
        session_metadata={"first_session": True}, held_back_buffer=[],
    )
    assert "KNOWN NUMEROLOGY" not in out       # thin/first-session file: nothing injected


def test_build_input_numerology_life_path_only_without_year():
    from datetime import date

    out = build_reader_input(
        client_message="hi", chat_transcript=[], client_file=None,
        session_metadata={}, held_back_buffer=[], date_of_birth=date(1992, 7, 22),
    )
    assert "Life Path: 5" in out
    assert "Personal Year" not in out          # no current_year -> life path only


def test_build_input_bad_dob_does_not_raise():
    out = build_reader_input(
        client_message="hi", chat_transcript=[], client_file=None,
        session_metadata={}, held_back_buffer=[], date_of_birth="not-a-date", current_year=2026,
    )
    assert "KNOWN NUMEROLOGY" not in out       # unparseable DOB is skipped, never crashes


# ── run_reader_turn (injected model call) ────────────────────────────────────
def test_turn_returns_filtered_bubbles_and_holds():
    text = "hey love\n\nsomething cracked open\n\n@@HOLD@@\nif X :: held line\n"
    bubbles, holds = run_reader_turn("input", reader_call=lambda _i: text, max_attempts=2)
    assert bubbles == ["hey love", "something cracked open"]
    assert holds == [("if X", "held line")]


def test_turn_strips_return_ack_bubbles():
    text = "hey hey, welcome back\n\nthe deck is already moving for you"
    bubbles, _ = run_reader_turn("input", reader_call=lambda _i: text, max_attempts=2)
    assert bubbles == ["the deck is already moving for you"]   # return-ack bubble dropped


def test_turn_also_strips_return_ack_holds():
    text = "real bubble\n\n@@HOLD@@\nif X :: welcome back darling\nif Y :: he is scared of losing you\n"
    _, holds = run_reader_turn("input", reader_call=lambda _i: text, max_attempts=2)
    assert holds == [("if Y", "he is scared of losing you")]   # return-ack held line dropped


def test_turn_retries_when_empty_then_succeeds():
    outs = iter(["welcome back", "the cards are loud tonight"])  # 1st all-ack; 2nd clean
    bubbles, _ = run_reader_turn("input", reader_call=lambda _i: next(outs), max_attempts=2)
    assert bubbles == ["the cards are loud tonight"]


def test_turn_falls_back_after_cap_never_empty():
    bubbles, holds = run_reader_turn("input", reader_call=lambda _i: "welcome back", max_attempts=2)
    assert bubbles == [FALLBACK_MESSAGE]     # every attempt all-return-ack -> fallback, never silent
    assert holds == []


def test_turn_retries_on_call_exception_then_falls_back():
    def boom(_i):
        raise RuntimeError("api down")

    bubbles, _ = run_reader_turn("input", reader_call=boom, max_attempts=2)
    assert bubbles == [FALLBACK_MESSAGE]


# ── extended-thinking gate (Option B) ─────────────────────────────────────────
def test_short_turn_greetings_and_acks():
    assert is_short_turn("hi") is True
    assert is_short_turn("hey") is True
    assert is_short_turn("omg thats so true") is True   # 4 words, no ?
    assert is_short_turn("hey how are you") is True      # 4 words, no ?
    assert is_short_turn("") is True
    assert is_short_turn(None) is True


def test_substantive_turns_are_not_short():
    # A real question -> substantive even if brief.
    assert is_short_turn("will he come back?") is False
    # A short but emotionally loaded statement -> substantive (6 words, no ?).
    assert is_short_turn("im honestly done waiting for him") is False
    # A long opener with a DOB/story -> substantive.
    assert is_short_turn(
        "my ex daniel keeps going hot and cold, born march 3 1990, will he come back"
    ) is False


def test_thinking_off_for_short_turns():
    assert thinking_for_turn("hi") == {"thinking": None, "effort": None}


def test_thinking_adaptive_high_for_substantive_turns():
    tp = thinking_for_turn("im honestly done waiting for him")
    assert tp == {"thinking": {"type": "adaptive"}, "effort": "high"}
    assert thinking_for_turn("will he come back?")["thinking"] == {"type": "adaptive"}
