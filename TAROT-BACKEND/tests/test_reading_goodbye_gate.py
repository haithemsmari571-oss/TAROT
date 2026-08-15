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
