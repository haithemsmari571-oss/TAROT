"""The client clock: the read pause, the silence ceiling, and typing speed.

All of it is visual. None of it gates when generation runs — that is still the six-second
burst guard and nothing else.
"""

import inspect

from app.config import get_app_settings
from app.services.ai import reading_burst as B
from app.services.ai import reading_executor as E


# ── the read pause ───────────────────────────────────────────────────────────
def test_read_pause_scales_with_what_she_actually_wrote():
    """A fixed beat was wrong in both directions: instant for a twenty-line letter, and a
    needless wait after "ok"."""
    assert B.read_pause_ms("") == 1500                       # base, nothing to read
    assert B.read_pause_ms("ok") == 1700                     # barely a pause
    two_lines = " ".join(["word"] * 20)
    assert 4000 <= B.read_pause_ms(two_lines) <= 6000        # a couple of lines: 4-5s
    twenty_lines = " ".join(["word"] * 200)
    assert 10000 <= B.read_pause_ms(twenty_lines) <= 15000   # a long one: 10-15s


def test_read_pause_is_capped():
    """Nobody reads for a minute before saying anything."""
    assert B.read_pause_ms(" ".join(["word"] * 5000)) == get_app_settings().READ_PAUSE_MAX_MS


def test_the_first_line_waits_out_the_read_pause():
    """Landing in three seconds flat is right for "hey" and wrong for a twenty-line letter.
    Arriving too fast reads as a machine just as clearly as arriving too slow."""
    from app.services.ai import reading_first_word

    source = inspect.getsource(reading_first_word.speak_now)
    assert "read_pause_seconds" in source
    sleep_at = source.index("asyncio.sleep(read_pause_seconds)")
    speak_at = source.index("_speak(")
    assert sleep_at < speak_at                     # pause FIRST, then react
    # ...and the deadline is measured from the end of the pause, not from her message
    assert "started = arrived_at + read_pause_seconds" in source


def test_the_burst_guard_is_untouched():
    """The six-second window exists so a paragraph sent as three texts gets one reply."""
    assert B.MESSAGE_BURST_SILENCE_SECONDS == 6.0


# ── the silence ceiling ──────────────────────────────────────────────────────
def test_typing_comes_on_after_the_ceiling_and_is_not_a_database_call():
    """The rule this file has already paid for breaking once: nothing on the generation
    path may touch a database. The presence watchdog is a sleep and a broadcast."""
    source = inspect.getsource(B._hold_typing_presence)
    assert "broadcast_typing" in source
    for forbidden in ("SessionLocal", "db.query", "db.commit", "_locked_row"):
        assert forbidden not in source, forbidden


def test_the_ceiling_is_measured_from_the_end_of_the_read_pause():
    source = inspect.getsource(B._start_first_word)
    assert "pause_seconds + ceiling" in source


def test_delivery_takes_the_indicator_over_from_the_watchdog():
    assert "_stop_typing_presence" in inspect.getsource(B._deliver_auto_plan)


def test_a_failed_turn_clears_the_indicator():
    """Dots that never stop are worse than no dots: she waits for a reader who is gone."""
    source = inspect.getsource(B._execute_claim)
    assert "_stop_typing_presence" in source
    assert "broadcast_typing" in source


def test_first_word_switches_the_dots_on_after_it_speaks():
    """The client clears its own indicator on every arriving message, so switching them on
    before the line would be undone by the line itself."""
    from app.services.ai import reading_first_word

    source = inspect.getsource(reading_first_word._speak)
    send_at = source.index("manager.send_to_chat")
    typing_at = source.index("broadcast_typing")
    assert send_at < typing_at


# ── typing speed ─────────────────────────────────────────────────────────────
def test_typing_runs_at_sixty_words_a_minute():
    assert get_app_settings().DUO_PER_WORD_MS == 1000


def test_a_long_message_genuinely_takes_a_long_time():
    """An eighty-word paragraph takes eighty seconds to type, and that is what a person
    looks like. There is no ceiling on a single message any more."""
    config = E.proportional_reveal_config_from_settings()
    eighty_words = " ".join(["word"] * 80)
    assert E.compute_proportional_typing_ms(eighty_words, config) == 80_000
    three_hundred = " ".join(["word"] * 300)
    assert E.compute_proportional_typing_ms(three_hundred, config) == 300_000   # uncapped


def test_a_small_gap_still_sits_between_messages():
    assert get_app_settings().DUO_BETWEEN_BUBBLES_MS == 500
