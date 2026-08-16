"""The client's gender: collected, not guessed.

Nothing in the product asked for it, so the reading assumed — a woman asking about a man —
on the live site, in front of the owner. A model handed a gap fills the gap.
"""

import pytest
from pydantic import ValidationError

from app.enums.gender import Gender
from app.schemas.auth import UserSignup
from app.schemas.user import UserProfileUpdate
from app.services.ai import reading_client_facts as F


# ── the field itself ─────────────────────────────────────────────────────────
def test_the_four_options_and_how_they_are_written():
    assert [g.value for g in Gender] == ["WOMAN", "MAN", "OTHER", "NOT_STATED"]
    assert Gender.WOMAN.label == "woman"
    assert Gender.MAN.label == "man"
    assert Gender.OTHER.label == "other"
    assert Gender.NOT_STATED.label == "not stated"


# ── mandatory at registration, enforced on the server ────────────────────────
def test_an_account_cannot_be_created_without_it():
    with pytest.raises(ValidationError) as caught:
        UserSignup(
            username="nadia", email="n@test.co", password="x", date_of_birth="1990-03-03"
        )
    assert "gender" in str(caught.value)


def test_prefer_not_to_say_is_an_answer_not_a_blank():
    signup = UserSignup(
        username="nadia", email="n@test.co", password="x",
        date_of_birth="1990-03-03", gender="NOT_STATED",
    )
    assert signup.gender is Gender.NOT_STATED


def test_a_made_up_value_is_rejected():
    with pytest.raises(ValidationError):
        UserSignup(
            username="n", email="n@test.co", password="x",
            date_of_birth="1990-03-03", gender="FEMALE",
        )


# ── editable afterwards ──────────────────────────────────────────────────────
def test_the_profile_update_accepts_it():
    assert UserProfileUpdate(gender="MAN").gender is Gender.MAN


def test_omitting_it_on_an_update_never_overwrites_what_she_chose():
    """update_user_profile applies model_dump(exclude_unset=True), so an update that does
    not mention gender must not carry a None that would wipe it."""
    assert "gender" not in UserProfileUpdate(bio="hi").model_dump(exclude_unset=True)


# ── the line the reading roles are handed ────────────────────────────────────
def test_the_line_states_it_as_verified():
    assert F.gender_line(Gender.WOMAN) == (
        "Client's gender: woman (verified — she stated this herself)"
    )
    assert F.gender_line(Gender.MAN).startswith("Client's gender: man (verified")
    assert F.gender_line(Gender.OTHER).startswith("Client's gender: other (verified")


def test_not_stated_is_said_out_loud_and_tells_the_reader_not_to_assume():
    """The whole point. A missing line reads as 'no information' and gets guessed at."""
    line = F.gender_line(Gender.NOT_STATED)
    assert "NOT STATED" in line
    assert "not missing data" in line
    assert "Do not assume" in line


def test_an_unknown_or_absent_value_falls_back_to_not_stated():
    assert F.gender_line(None) == F.gender_line(Gender.NOT_STATED)
    assert F.gender_line("NONSENSE") == F.gender_line(Gender.NOT_STATED)
    assert F.gender_line("WOMAN") == F.gender_line(Gender.WOMAN)   # accepts the raw value


def test_the_block_is_never_empty_even_with_no_date_of_birth():
    block = F.build_verified_facts_block(gender=Gender.WOMAN)
    assert F.VERIFIED_HEADER in block
    assert "Client's gender: woman" in block


def test_gender_sits_in_the_same_block_as_the_astrology():
    from datetime import date

    block = F.build_verified_facts_block(
        date_of_birth=date(2002, 12, 1), current_year=2026, gender=Gender.WOMAN
    )
    assert block.count(F.VERIFIED_HEADER) == 1        # ONE block, not two
    assert "Zodiac sign: Sagittarius" in block
    assert "Life Path: 8" in block
    assert "Personal Year (2026): 5" in block
    assert "Client's gender: woman" in block
    # the gender line is under the same authoritative header as the rest
    assert block.index(F.VERIFIED_HEADER) < block.index("Client's gender")


def test_the_block_does_not_touch_either_prompt():
    """The prompts are the owner's and live in the registry. This is input, not instruction."""
    from app.services.ai.reading_sabri import SABRI_SYSTEM_PROMPT
    from app.services.ai.reading_valentina import VALENTINA_SYSTEM_PROMPT

    for prompt in (VALENTINA_SYSTEM_PROMPT, SABRI_SYSTEM_PROMPT):
        assert "gender" not in prompt.lower()


# ── it reaches BOTH roles ────────────────────────────────────────────────────
def test_valentina_is_given_the_line():
    from app.services.ai.reading_valentina import build_valentina_input

    built = build_valentina_input(
        client_message="will he come back?", session_memory="", client_file=None,
        session_metadata={}, gender=Gender.WOMAN,
    )
    assert "Client's gender: woman (verified" in built


def test_sabri_is_given_the_line():
    from app.services.ai.reading_sabri import build_sabri_input

    built = build_sabri_input(
        client_message="will he come back?", session_memory="", source_content="prose",
        verified_facts=F.build_verified_facts_block(gender=Gender.WOMAN),
    )
    assert "Client's gender: woman (verified" in built


def test_the_gender_is_read_before_generation_starts_not_during():
    """THE OUTAGE RULE. It is read at claim time, in a session that is already open."""
    import inspect

    from app.services.ai import reading_burst as B

    assert "_client_gender(db, chat.user_id)" in inspect.getsource(B._claim_or_delay)
    for forbidden in ("SessionLocal", "_client_gender("):
        assert forbidden not in inspect.getsource(B._generate_auto), forbidden
