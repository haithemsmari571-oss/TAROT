"""Never charge a minute the client was not present for.

Billing is prepaid per minute off ``started_at``, and the session only ends when
the balance runs out. So a client who closed the app and was never detected as
gone kept being charged until she had nothing left — her whole balance, for a
reading she was not in.
"""

from datetime import datetime, timedelta

from app.services.session_manager import SessionManager, SessionState


def _state(chat_id=1, minutes_charged=2, started_minutes_ago=2):
    return SessionState(
        chat_id=chat_id,
        session_id=100,
        interval_id=200,
        started_at=datetime.now() - timedelta(minutes=started_minutes_ago),
        client_id=42,
        psychic_id=13,
        rate_per_second=1 / 60,
        max_session_duration_seconds=3600,
        initial_balance=100.0,
        minutes_charged=minutes_charged,
    )


def _manager(state):
    manager = SessionManager.__new__(SessionManager)
    manager.active_sessions = {state.chat_id: state}
    manager.paused_sessions = {}
    return manager


def test_disconnect_freezes_the_meter_at_the_last_paid_minute():
    state = _state(minutes_charged=2)
    _manager(state).handle_client_disconnect(state.chat_id)

    assert state.client_disconnected_at is not None
    # Rewound to the boundary she actually paid for, so the unused remainder of
    # that minute is still hers when she returns.
    assert state.paused_elapsed_seconds == 120


def test_a_second_disconnect_does_not_restart_the_countdown():
    """Extra sockets closing must not extend her grace or re-freeze the meter."""
    state = _state(minutes_charged=2)
    manager = _manager(state)
    manager.handle_client_disconnect(state.chat_id)
    first = state.client_disconnected_at

    state.minutes_charged = 9          # would corrupt the freeze if re-applied
    manager.handle_client_disconnect(state.chat_id)

    assert state.client_disconnected_at == first
    assert state.paused_elapsed_seconds == 120


def test_reconnect_erases_the_gap_instead_of_deferring_it():
    """The whole point: the away time must not be billable when she returns.

    Without rebasing started_at, elapsed keeps running while she is gone and the
    next monitor pass charges every minute of her absence in one burst.
    """
    state = _state(minutes_charged=2)
    manager = _manager(state)
    manager.handle_client_disconnect(state.chat_id)

    # She is away long enough for several minutes to have accrued.
    state.client_disconnected_at = datetime.now() - timedelta(minutes=5)
    manager.handle_client_reconnect(state.chat_id)

    assert state.client_disconnected_at is None
    elapsed = (datetime.now() - state.started_at).total_seconds()
    # The meter reads the two minutes she paid for, not the seven that passed.
    assert 118 <= elapsed <= 125, elapsed
    due_minutes = int(elapsed // 60) + 1
    assert due_minutes - state.minutes_charged <= 1, "a catch-up burst would be charged"


def test_reconnect_does_not_disturb_a_top_up_pause():
    """Grace owns the meter while it is running; presence must not fight it."""
    state = _state(minutes_charged=2)
    state.is_grace = True
    state.paused_elapsed_seconds = 120
    started_before = state.started_at
    manager = _manager(state)
    manager.handle_client_disconnect(state.chat_id)
    manager.handle_client_reconnect(state.chat_id)

    assert state.started_at == started_before


def test_handlers_are_safe_when_there_is_no_session():
    manager = SessionManager.__new__(SessionManager)
    manager.active_sessions = {}
    manager.paused_sessions = {}
    manager.handle_client_disconnect(999)
    manager.handle_client_reconnect(999)


def test_the_disconnect_handlers_are_actually_wired():
    """This bug was not a logic error. Both handlers were correct and neither
    was ever called, so the whole path was dead."""
    import inspect

    from app.routers import chats

    source = inspect.getsource(chats)
    assert "handle_client_disconnect" in source
    assert "handle_client_reconnect" in source
