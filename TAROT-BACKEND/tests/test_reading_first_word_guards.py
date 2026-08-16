"""Both lines below reached a live client's screen and must never do so again."""
from app.services.ai.reading_first_word import _reject_reason, _FALLBACK_OPENERS, _FALLBACK_GREETINGS, _FALLBACK_CLOSERS


def test_stage_direction_is_rejected():
    line = ("she's leaning in and absorbing. this is a nod. she wants more, not a question. "
            "continue from where you were cut off, same register, same tempo.")
    assert _reject_reason(line, []) is not None


def test_arguing_with_its_own_input_is_rejected():
    line = ("I need to stop and be direct with you: the conversation history you've pasted "
            "doesn't match what you're asking me to do right now.")
    assert _reject_reason(line, []) is not None


def test_narrating_the_client_is_rejected():
    assert _reject_reason("she is ready for the next part", []) is not None


def test_speaking_to_her_about_a_third_party_is_fine():
    assert _reject_reason("your sister sounds like she means well", []) is None
    assert _reject_reason("i hear you. stay with me a second.", []) is None


def test_every_fallback_line_still_passes_its_own_filter():
    for pool in (_FALLBACK_OPENERS, _FALLBACK_GREETINGS, _FALLBACK_CLOSERS):
        for line in pool:
            assert _reject_reason(line, []) is None, line
