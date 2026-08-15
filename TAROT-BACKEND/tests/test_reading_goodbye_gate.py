"""Which endings earn a goodbye from the reader.

The reader never ends a session. The client ends it, or it ends because the
money ran out, a paused session timed out, or the socket stayed down — and in
all three of those she may be back, sometimes within seconds and sometimes
without having meant to leave. A goodbye there announces an ending that has not
happened.
"""

from app.enums.chat_termination_reason import ChatTerminationReason
from app.services.session_manager import should_say_goodbye

CLIENT = 42
PSYCHIC = 13


def test_client_ending_the_chat_is_the_only_goodbye():
    assert should_say_goodbye(ChatTerminationReason.MANUAL_EXIT, CLIENT, CLIENT)


def test_every_recoverable_ending_stays_silent():
    """She may top up, reconnect, or reopen the app into this same session."""
    for reason in (
        ChatTerminationReason.NO_TOPUP,            # grace expired, no top-up
        ChatTerminationReason.INSUFFICIENT_FUNDS,  # balance ran out
        ChatTerminationReason.PAUSE_FOR_TOPUP,
        ChatTerminationReason.PAUSE_TIMEOUT,       # paused too long
        ChatTerminationReason.CLIENT_DISCONNECTED,
        ChatTerminationReason.SOCKET_LOST,
        ChatTerminationReason.TIMEOUT,
        ChatTerminationReason.USER_INITIATED,
    ):
        assert not should_say_goodbye(reason, CLIENT, CLIENT), reason
        assert not should_say_goodbye(reason, None, CLIENT), reason


def test_the_psychic_closing_the_room_is_not_a_goodbye():
    """That is the operator closing a room, not the client leaving."""
    assert not should_say_goodbye(ChatTerminationReason.MANUAL_EXIT, PSYCHIC, CLIENT)


def test_an_unattributed_manual_exit_stays_silent():
    """Without knowing who ended it, silence is the recoverable choice."""
    assert not should_say_goodbye(ChatTerminationReason.MANUAL_EXIT, None, CLIENT)
    assert not should_say_goodbye(ChatTerminationReason.MANUAL_EXIT, CLIENT, None)


def test_every_reason_in_the_enum_is_covered():
    """A new termination reason must not silently inherit a goodbye."""
    speaks = {
        reason
        for reason in ChatTerminationReason
        if should_say_goodbye(reason, CLIENT, CLIENT)
    }
    assert speaks == {ChatTerminationReason.MANUAL_EXIT}


# ── the goodbye must never talk about its own prompt ──────────────────────────
def test_prompt_meta_commentary_is_rejected():
    """A live goodbye came back narrating the instruction block.

    It broke no other rule - no card, no number, short enough - so nothing
    stopped it reaching the client.
    """
    from app.services.ai import reading_first_word as f

    leaked = (
        'I\'m waiting for what she wrote. The instruction block says '
        '"WHAT SHE JUST WROTE:" but there is nothing there.'
    )
    assert f._reject_reason(leaked, []) is not None
    for line in (
        "the prompt appears to be empty",
        "there is no message from her",
        "as an AI i cannot do that",
    ):
        assert f._reject_reason(line, []) is not None, line


def test_an_ordinary_goodbye_still_passes():
    from app.services.ai import reading_first_word as f

    for line in f._FALLBACK_CLOSERS + f._FALLBACK_GREETINGS + f._FALLBACK_OPENERS:
        assert f._reject_reason(line, []) is None, line


def test_no_arriving_message_produces_no_dangling_header():
    """The empty header is what invited the narration in the first place."""
    from app.services.ai import reading_first_word as f

    turn = f._build_user_turn(
        client_message="", transcript=[], previous=[], is_first_message=False
    )
    assert "WHAT SHE JUST WROTE" not in turn
    assert "not written anything" in turn

    # And the closing says the session is over, so the model does not answer a
    # goodbye with an opener - one live goodbye came back "i'm listening
    # whenever you want to start."
    closing = f._build_user_turn(
        client_message="", transcript=[], previous=[], is_first_message=False,
        moment="close",
    )
    assert "session is over" in closing
    greeting = f._build_user_turn(
        client_message="", transcript=[], previous=[], is_first_message=True,
        moment="greet",
    )
    assert "just arrived" in greeting

    turn_with = f._build_user_turn(
        client_message="i miss him", transcript=[], previous=[], is_first_message=True
    )
    assert "WHAT SHE JUST WROTE:\ni miss him" in turn_with
