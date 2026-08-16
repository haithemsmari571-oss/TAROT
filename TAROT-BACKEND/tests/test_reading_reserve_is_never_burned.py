"""An interrupted reading must be kept, not destroyed.

When the client typed while a reading was generating, her message bumped the generation
version, the now-stale claim was rejected, and _generate_auto returned one line ABOVE the
assignment that would have banked Valentina's writing. Both Opus calls had already finished
and been paid for. The words were the same words; whether she happened to type during them
has nothing to do with whether they are worth keeping.
"""

import inspect

from app.services.ai import reading_burst as B
from app.services.ai import reading_duo as D


def test_writing_is_banked_before_the_staleness_check():
    """The whole fix is an ordering: bank, then ask whether this turn is still wanted."""
    source = inspect.getsource(B._generate_auto)
    bank = source.index("state.reserve = reserve")
    put = source.index("store.put(state)", bank)
    check = source.index("_store_auto_plan", put)
    assert bank < put < check


def test_no_new_database_call_was_added_between_generation_and_delivery():
    """THE OUTAGE RULE. Reordering two statements that were already there is allowed;
    adding a query in that window is what took production down."""
    source = inspect.getsource(B._generate_auto)
    assert source.count("store.put(") == 1
    assert "SessionLocal" not in source
    assert "db.query" not in source
    assert "db.commit" not in source


def test_a_superseded_turn_says_it_kept_the_writing():
    assert "reading_burst_superseded_writing_kept" in inspect.getsource(B._generate_auto)


# ── accumulation ─────────────────────────────────────────────────────────────
def test_accumulate_adds_oldest_first():
    assert D.accumulate_reserve("first reading", "second reading") == (
        "first reading\n\nsecond reading"
    )


def test_accumulate_handles_an_empty_side():
    assert D.accumulate_reserve("", "only this") == "only this"
    assert D.accumulate_reserve("only this", "") == "only this"
    assert D.accumulate_reserve("", "") == ""


def test_nothing_is_ever_removed_by_sending():
    """Sabri does not report what he held, so nothing can be subtracted by mistake. He
    avoids repeating himself because the capsule shows him what she has already read."""
    source = inspect.getsource(D._duo_generate)
    assert "accumulate_reserve" in source
    # the old "replace on NEW / guess on CONTINUE" write guard is gone from both writers
    assert 'route == "new" or' not in source
    assert 'route == "new" or' not in inspect.getsource(B._deliver_auto_plan)


def test_the_old_todo_is_gone():
    assert "TODO(phase-3 follow-up" not in inspect.getsource(D)


# ── the write guard that could not tell drained from glue ────────────────────
def test_delivery_no_longer_second_guesses_the_reserve():
    source = inspect.getsource(B._deliver_auto_plan)
    assert "claim.response_reserve.strip()" not in source
