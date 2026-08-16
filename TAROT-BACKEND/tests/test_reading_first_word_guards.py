"""The opening line: warmth plus intake, and a guard that stays out of its way.

Live, two different readers sent the same client the identical sentence "i'm here. give me
a moment with this." — the fixed fallback pool firing because every attempt was rejected.
The client had written "i want to know about jessica dob 12/12/1999 is she with anyone now",
and the guard rejected any line containing a name, a date or a bare number. The more she
told the reader, the more certain the reply was to be a template.

Three rules survive. Everything else is the job.
"""

import inspect

from app.services.ai import reading_first_word
from app.services.ai.reading_first_word import (
    _FALLBACK_CLOSERS,
    _FALLBACK_GREETINGS,
    _FALLBACK_OPENERS,
    _reject_reason,
    _too_similar,
)


# ── what the line is FOR ─────────────────────────────────────────────────────
def test_the_shape_the_owner_asked_for_is_allowed():
    line = (
        "hello there my dear, sit with me because i can feel how heavy you're feeling "
        "lately, before we start tell me what's his date of birth"
    )
    assert _reject_reason(line, []) is None


def test_the_two_lines_that_were_rejected_live_are_allowed_now():
    """The client asked about "jessica dob 12/12/1999". Both attempts were binned, and two
    different readers sent her the identical canned sentence instead."""
    assert _reject_reason(
        "give me a second, i want to pull on what's happening with her right now", []
    ) is None
    assert _reject_reason(
        "let me look at jessica and what is happening in her life right now.", []
    ) is None


def test_it_may_repeat_her_own_facts_back_to_her():
    """Names, dates, ages, places, numbers she just gave. This is how she knows she was
    heard, and blocking it was the single biggest cause of the template."""
    for line in (
        "jessica, born 12/12/1999, ok. tell me how long you two have known each other",
        "you are 34 and carrying all of this on your own, that is a lot. what is his name?",
        "you said manchester in october, that is soon. what is pulling you there?",
        "two years of this, my love. tell me his date of birth so i can see the shape of it",
    ):
        assert _reject_reason(line, []) is None, line


def test_there_is_no_length_cap():
    long_line = (
        "hello my love, sit with me a second because i can feel how heavy the last few "
        "months have been for you and i do not want to rush past that at all. before i pull "
        "anything for you, tell me his date of birth so i can see how the two of you "
        "actually sit together, because honestly that is where this whole answer lives."
    )
    assert len(long_line.split()) > 40
    assert _reject_reason(long_line, []) is None


def test_ordinary_english_that_happens_to_be_a_card_name_is_fine():
    """Blocking "the strength in you" to prevent a card reference is the over-rejection
    being removed. The bare majors that are also ordinary words are not in the pattern."""
    for line in (
        "i can feel the strength in you even now",
        "a death in the family changes everything, i am so sorry",
        "there is no justice in what he did to you",
    ):
        assert _reject_reason(line, []) is None, line


def test_a_zodiac_sign_or_planet_is_no_longer_rejected():
    assert _reject_reason("you are a cancer sun, it shows in how you love", []) is None
    assert _reject_reason("mercury has been brutal on everyone lately", []) is None


# ── the ONE content rule ─────────────────────────────────────────────────────
def test_it_may_not_name_a_tarot_card():
    assert "tarot card" in _reject_reason("the tower is already showing up for you", [])
    assert "tarot card" in _reject_reason("i can see the five of cups around you", [])


def test_it_may_not_state_a_numerology_value():
    assert "numerology" in _reject_reason("your life path 7 explains all of this", [])
    assert "numerology" in _reject_reason("this is a personal year nine for you", [])


def test_it_may_not_promise_a_timing():
    assert "timing" in _reject_reason("this shifts within 10 days, i can feel it", [])
    assert "timing" in _reject_reason("he comes back before the end of March", [])
    assert "timing" in _reject_reason("expect it by December", [])


# ── meta-talk and stage direction still never reach a client ─────────────────
def test_stage_direction_is_still_blocked():
    line = ("she is leaning in and absorbing. this is a nod. she wants more, not a question. "
            "continue from where you were cut off, same register, same tempo.")
    assert _reject_reason(line, []) is not None


def test_arguing_with_its_own_input_is_still_blocked():
    line = ("I need to stop and be direct with you: the conversation history you have pasted "
            "does not match what you are asking me to do right now.")
    assert _reject_reason(line, []) is not None


# ── the repeat check, loosened ───────────────────────────────────────────────
def test_the_same_line_twice_is_still_caught():
    said = ["i am here. give me a moment with this."]
    assert _too_similar("i am here. give me a moment with this.", said)
    assert _reject_reason("i am here. give me a moment with this.", said) is not None


def test_two_different_warm_lines_are_not_treated_as_a_repeat():
    """At the old threshold, warmth repeating warm words counted as the same line."""
    said = ["i am here with you, take your time"]
    assert not _too_similar("i am here, tell me what has been going on with him", said)
    assert _reject_reason(
        "i am here, tell me what has been going on with him lately", said
    ) is None


def test_two_short_lines_sharing_words_are_a_coincidence_not_a_repeat():
    assert not _too_similar("okay, i hear you", ["okay love"])


# ── the fallback pool must still be safe, and should now be near-unreachable ──
def test_every_fallback_line_still_passes_its_own_filter():
    for pool in (_FALLBACK_OPENERS, _FALLBACK_GREETINGS, _FALLBACK_CLOSERS):
        for line in pool:
            assert _reject_reason(line, []) is None, line


def test_the_fallback_firing_is_logged_loudly():
    source = inspect.getsource(reading_first_word._speak)
    assert "reading_first_word_fallback_fired" in source
    assert 'logger.error("reading_first_word_fallback_fired"' in source


def test_a_rejection_logs_the_whole_candidate_and_the_exact_reason():
    source = inspect.getsource(reading_first_word._speak)
    assert 'candidate=candidate or ""' in source
    assert "[:160]" not in source
    assert "reason=reason" in source


# ── the model ────────────────────────────────────────────────────────────────
def test_the_first_line_runs_on_sonnet_with_no_thinking():
    from app.config import get_app_settings

    assert get_app_settings().FIRST_WORD_MODEL == "claude-sonnet-4-6"
    assert "settings.FIRST_WORD_MODEL" in inspect.getsource(
        reading_first_word._resolve_prompt
    )
    generate = inspect.getsource(reading_first_word._generate)
    assert "thinking" not in generate
    assert "output_config" not in generate
    assert "effort" not in generate


def test_the_appended_instruction_asks_for_warmth_and_one_question():
    instruction = reading_first_word.PASS_ONE_INSTRUCTION
    assert "ASK FOR ONE THING" in instruction
    assert "say why you want it" in instruction
    assert "Never ask for something she has already told you" in instruction
    assert "You MAY say names, dates, numbers" in instruction


def test_the_registry_prompt_itself_is_untouched():
    """The instruction is appended in code. Sabri's own prompt is the owner's."""
    from app.services.ai.reading_sabri import SABRI_SYSTEM_PROMPT

    assert "ASK FOR ONE THING" not in SABRI_SYSTEM_PROMPT
    assert "date of birth so i can see" not in SABRI_SYSTEM_PROMPT
