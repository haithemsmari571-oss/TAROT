"""The block of verified facts about the client that both reading roles are handed.

This is the block that already carries her zodiac sign, Life Path and Personal Year — values
the code calculates deterministically and the models are told never to compute themselves.
Gender now sits in it, for the same reason and with the same standing: it is something the
system KNOWS because she stated it, not something a reader should ever be working out.

Two rules shape this file.

IT IS ALWAYS PRESENT. Even when she has stated nothing and there is no date of birth on the
account, the block is emitted with an explicit "not stated" line. A missing line reads as no
information and gets filled in with the likeliest guess, which is exactly the failure this
exists to stop: a woman asked about her situation and the reading came back about a man she
was supposedly waiting on, because nothing had ever said otherwise.

IT DOES NOT TOUCH EITHER PROMPT. The prompts live in the owner's registry and are his. This
is input the code assembles and hands over — the same way the numerology has always worked.
"""

from app.enums.gender import Gender

VERIFIED_HEADER = (
    "KNOWN NUMEROLOGY (authoritative — these are correct, use them, do NOT recompute):"
)

_GENDER_LINE = {
    Gender.WOMAN: "Client's gender: woman (verified — she stated this herself)",
    Gender.MAN: "Client's gender: man (verified — he stated this himself)",
    Gender.OTHER: "Client's gender: other (verified — they stated this themselves)",
}
_NOT_STATED_LINE = (
    "Client's gender: NOT STATED — this is not missing data, it is an answer. "
    "Do not assume it, do not infer it from anything they say, and do not write as though "
    "you know it."
)


def gender_line(gender) -> str:
    """One line, always. 'Not stated' is written out loud rather than left out."""
    if isinstance(gender, str):
        try:
            gender = Gender(gender)
        except ValueError:
            gender = Gender.NOT_STATED
    return _GENDER_LINE.get(gender or Gender.NOT_STATED, _NOT_STATED_LINE)


def build_verified_facts_block(
    *, date_of_birth=None, current_year=None, client_message=None, gender=None
) -> str:
    """The verified block for one turn: the deterministic numerology plus her gender.

    Reuses reading_reader._numerology_block verbatim for the astrology and numerology, so
    there is one calculator and one wording for those, and appends the gender line under the
    same header. Returns a non-empty block ALWAYS — the gender line alone is reason enough
    for the block to exist. Pure: no database, no model, no IO."""
    from app.services.ai.reading_reader import _numerology_block

    numerology = _numerology_block(
        date_of_birth, current_year, client_message=client_message
    )
    line = gender_line(gender)
    if numerology:
        # Same block, one more verified fact under the same authoritative header.
        return f"{numerology}\n{line}"
    return f"{VERIFIED_HEADER}\n{line}"
