"""Reflection — the server as the authority.

A customer pauses to sit with what she said: the meter and the charge stop at
the exact second, the chat stays ACTIVE, and the budget (reflect_budget.py,
the one arithmetic) decides how long. These tests drive SessionManager on an
in-memory SQLite database in the pattern of test_client_presence_billing.py.

They are unit tests on SQLite. They are not proof of the freeze on a live
reading: that needs the compose stack end to end, and then production.
"""

from __future__ import annotations

import asyncio
from datetime import datetime, timedelta

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

import app.models  # noqa: F401 — registers every model on Base.metadata
from app.enums.chat_session_status import ChatSessionStatus
from app.enums.chat_session_triggers import ChatSessionTrigger
from app.enums.chat_status import ChatStatus
from app.enums.chat_termination_reason import ChatTerminationReason
from app.enums.role import Role
from app.models import Chat, ChatSession, SessionInterval, User
from app.models.base import Base
from app.services import reflect_budget as budget
from app.services.session_manager import (
    REFLECT_TIME_UP_GRACE,
    ReflectionRefused,
    SessionManager,
    SessionNotFoundError,
    SessionState,
)

RATE = 1 / 60  # one point per minute, so every "minute" is one unit of balance


@pytest.fixture
def sqlite(monkeypatch):
    """An in-memory database that ALSO stands in for app.database.client.SessionLocal,
    because SessionManager opens its own sessions per operation."""
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    Base.metadata.create_all(engine)
    Local = sessionmaker(bind=engine, expire_on_commit=False)
    from app.database import client as database_client

    monkeypatch.setattr(database_client, "SessionLocal", Local)
    db = Local()
    try:
        yield db, Local
    finally:
        db.close()
        engine.dispose()


def _reading(db, *, seconds_in: int, minutes_charged: int, balance: float = 100.0,
             reflection_used: int = 0, reflecting_since: datetime | None = None):
    """A live reading `seconds_in` seconds old with `minutes_charged` minutes
    already paid, as rows AND as the in-memory state the monitor reads."""
    n = db.query(User).count()
    client = User(email=f"client{n}@test.co", username=f"client{n}", password_hash="hash",
                  balance=balance, role=Role.USER)
    psychic = User(email=f"psychic{n}@test.co", username=f"psychic{n}", password_hash="hash",
                   role=Role.PSYCHIC, price_per_second=RATE)
    db.add_all([client, psychic])
    db.commit()
    now = datetime.now()
    started = now - timedelta(seconds=seconds_in)
    chat = Chat(user_id=client.id, psychic_id=psychic.id, status=ChatStatus.ACTIVE,
                client_joined_at=started)
    db.add(chat)
    db.commit()
    session = ChatSession(chat_id=chat.id, status=ChatSessionStatus.ACTIVE,
                          reflection_seconds_used=reflection_used,
                          reflecting_since=reflecting_since)
    db.add(session)
    db.commit()
    interval = SessionInterval(session_id=session.id, started_at=started, is_billed=True,
                               trigger_event=ChatSessionTrigger.RESUME_AFTER_TOPUP)
    db.add(interval)
    db.commit()
    state = SessionState(
        chat_id=chat.id, session_id=session.id, interval_id=interval.id, started_at=started,
        client_id=client.id, psychic_id=psychic.id, rate_per_second=RATE,
        max_session_duration_seconds=3600, initial_balance=balance,
        minutes_charged=minutes_charged, client_joined_at=started,
        reflection_seconds_used=reflection_used, reflecting_since=reflecting_since,
    )
    manager = SessionManager()
    manager.active_sessions[chat.id] = state
    return manager, state, chat, session, client, psychic


def _row(db, session_id):
    db.expire_all()
    return db.get(ChatSession, session_id)


async def _one_monitor_pass(manager):
    """Run exactly one pass of the real monitor loop."""
    manager._running = True
    task = asyncio.create_task(manager._monitor_sessions())
    await asyncio.sleep(0.3)          # the first pass runs before the loop's sleep
    manager._running = False
    task.cancel()
    try:
        await task
    except (asyncio.CancelledError, Exception):  # noqa: BLE001
        pass


# ── the one arithmetic ───────────────────────────────────────────────────────

def test_banked_accrual_across_the_900_second_marks():
    """Two minutes at the start, two more at every mark, unused time banks —
    the same figures the website's reflectBudget.ts prints."""
    assert (budget.REFLECT_GRANT_SECONDS, budget.REFLECT_MARK_SECONDS) == (120, 900)
    assert [budget.reflect_earned_seconds(p) for p in (0, 899, 900, 1800, 3600)] == [
        120, 120, 240, 360, 600,
    ]
    # she used her first two minutes, then crossed the mark: two more, banked
    assert budget.reflect_remaining_seconds(899, used_seconds=120) == 0
    assert budget.reflect_remaining_seconds(900, used_seconds=120) == 120
    # nothing used across two marks: the whole bank
    assert budget.reflect_remaining_seconds(1800, used_seconds=0) == 360
    # a reflection in progress counts against it, and never below zero
    assert budget.reflect_remaining_seconds(0, 0, live_seconds=30) == 90
    assert budget.reflect_remaining_seconds(0, 0, live_seconds=500) == 0
    assert budget.reflect_overdue_seconds(0, 0, live_seconds=123) == 3


def test_the_manager_reads_the_bank_off_the_paid_meter(sqlite):
    db, _ = sqlite
    manager, state, *_ = _reading(db, seconds_in=1800, minutes_charged=30)
    assert manager._reflect_remaining(state) == 360
    state.reflection_seconds_used = 200
    assert manager._reflect_remaining(state) == 160


# ── the freeze ───────────────────────────────────────────────────────────────

def test_begin_freezes_at_the_exact_second_not_the_minute_boundary(sqlite):
    db, _ = sqlite
    manager, state, chat, session, *_ = _reading(db, seconds_in=70, minutes_charged=2)
    info = manager.begin_reflection(chat.id, db)
    assert 69 <= state.paused_elapsed_seconds <= 71, state.paused_elapsed_seconds
    assert state.reflecting_since is not None
    assert info.session_status == "REFLECTING"
    assert info.elapsed_seconds == state.paused_elapsed_seconds
    assert 119 <= info.reflect_remaining_seconds <= 120
    # persisted, so a refresh or a restart finds it
    row = _row(db, session.id)
    assert row.reflecting_since is not None and row.reflection_seconds_used == 0
    # the chat is still ACTIVE — the reader keeps writing and delivering
    db.expire_all()
    assert db.get(Chat, chat.id).status == ChatStatus.ACTIVE


def test_freeze_stops_charging_while_reflecting(sqlite, monkeypatch):
    """Seventy seconds in with one minute paid, the monitor owes minute two —
    unless she is reflecting, in which case it charges nothing."""
    db, _ = sqlite
    manager, state, chat, *_ = _reading(db, seconds_in=70, minutes_charged=1)
    gate_hits = []
    real_tick = manager._tick_reflection

    async def _spy(chat_id, session_state, db_):
        gate_hits.append(chat_id)
        await real_tick(chat_id, session_state, db_)

    monkeypatch.setattr(manager, "_tick_reflection", _spy)
    manager.begin_reflection(chat.id, db)
    asyncio.run(_one_monitor_pass(manager))
    assert gate_hits == [chat.id]                # the pass ran and took the reflection gate
    assert state.minutes_charged == 1            # …and charged nothing
    assert state.reflecting_since is not None


def test_the_same_pass_charges_when_she_is_not_reflecting(sqlite):
    """The positive control for the test above: the monitor does charge."""
    db, _ = sqlite
    manager, state, chat, *_ = _reading(db, seconds_in=70, minutes_charged=1)
    asyncio.run(_one_monitor_pass(manager))
    assert state.minutes_charged == 2


def test_return_rebases_so_no_reflected_second_is_ever_billed(sqlite):
    db, _ = sqlite
    manager, state, chat, session, *_ = _reading(db, seconds_in=70, minutes_charged=2)
    manager.begin_reflection(chat.id, db)
    # a hundred seconds of reflection pass
    state.reflecting_since -= timedelta(seconds=100)
    state.started_at -= timedelta(seconds=100)
    info, was_reflecting = manager.end_reflection(chat.id, "return", db)
    assert was_reflecting
    assert state.reflecting_since is None
    assert 99 <= state.reflection_seconds_used <= 101
    # the meter continues from the frozen second: 70, not 170
    elapsed = (datetime.now() - state.started_at).total_seconds()
    assert 69 <= elapsed <= 72, elapsed
    assert info.session_status == "ACTIVE"
    assert 99 <= info.reflect_seconds_used <= 101
    # and the monitor's next pass owes exactly minute two, never minute three
    asyncio.run(_one_monitor_pass(manager))
    assert state.minutes_charged == 2
    row = _row(db, session.id)
    assert row.reflecting_since is None and 99 <= row.reflection_seconds_used <= 101


# ── refusals ─────────────────────────────────────────────────────────────────

def test_refused_at_zero_remaining(sqlite):
    db, _ = sqlite
    manager, state, chat, *_ = _reading(db, seconds_in=30, minutes_charged=1,
                                        reflection_used=120)
    assert manager._reflect_remaining(state) == 0
    with pytest.raises(ReflectionRefused) as refused:
        manager.begin_reflection(chat.id, db)
    assert refused.value.reason == "no_budget"
    assert state.reflecting_since is None


def test_every_other_refusal_names_its_reason(sqlite):
    db, _ = sqlite
    manager, state, chat, *_ = _reading(db, seconds_in=30, minutes_charged=1)
    state.awaiting_join = True
    with pytest.raises(ReflectionRefused, match="awaiting_join"):
        manager.begin_reflection(chat.id, db)
    state.awaiting_join = False
    state.is_grace = True
    with pytest.raises(ReflectionRefused, match="grace"):
        manager.begin_reflection(chat.id, db)
    state.is_grace = False
    chat.status = ChatStatus.PAUSED
    db.commit()
    with pytest.raises(ReflectionRefused, match="not_active"):
        manager.begin_reflection(chat.id, db)
    chat.status = ChatStatus.ACTIVE
    db.commit()
    manager.begin_reflection(chat.id, db)
    with pytest.raises(ReflectionRefused, match="already_reflecting"):
        manager.begin_reflection(chat.id, db)
    with pytest.raises(SessionNotFoundError):
        manager.begin_reflection(chat.id + 999, db)


# ── exhaustion ───────────────────────────────────────────────────────────────

def test_exhaustion_auto_ends_three_seconds_after_remaining_hits_zero(sqlite, monkeypatch):
    db, _ = sqlite
    manager, state, chat, session, *_ = _reading(db, seconds_in=10, minutes_charged=1)
    ended = []

    async def _record(chat_id, info, reason):
        ended.append((chat_id, reason, info.session_status, info.reflect_seconds_used))

    monkeypatch.setattr(manager, "_broadcast_session_reflect_ended", _record)
    manager.begin_reflection(chat.id, db)
    assert REFLECT_TIME_UP_GRACE == 3

    # 121 s into a 120 s budget: zero reached one second ago — still hers
    state.reflecting_since = datetime.now() - timedelta(seconds=121)
    asyncio.run(manager._tick_reflection(chat.id, state, db))
    assert state.reflecting_since is not None and not ended

    # three seconds past zero: the server ends it itself, through the one exit
    state.reflecting_since = datetime.now() - timedelta(seconds=120 + REFLECT_TIME_UP_GRACE)
    asyncio.run(manager._tick_reflection(chat.id, state, db))
    assert state.reflecting_since is None
    assert ended and ended[0][1] == "budget" and ended[0][2] == "ACTIVE"
    assert 122 <= state.reflection_seconds_used <= 124
    # the meter resumed from the frozen second
    assert 9 <= (datetime.now() - state.started_at).total_seconds() <= 12
    # spent can never exceed earned: nothing is left, and Reflect is refused
    assert manager._reflect_remaining(state) == 0
    with pytest.raises(ReflectionRefused, match="no_budget"):
        manager.begin_reflection(chat.id, db)
    assert _row(db, session.id).reflecting_since is None


# ── idempotent return ────────────────────────────────────────────────────────

def test_return_when_not_reflecting_changes_nothing(sqlite):
    db, _ = sqlite
    manager, state, chat, session, *_ = _reading(db, seconds_in=40, minutes_charged=1,
                                                 reflection_used=35)
    started_before = state.started_at
    info, was_reflecting = manager.end_reflection(chat.id, "return", db)
    assert not was_reflecting
    assert info is not None and info.session_status == "ACTIVE"
    assert state.started_at == started_before
    assert state.reflection_seconds_used == 35 and info.reflect_seconds_used == 35
    # twice after a real return: the second is a no-op too
    manager.begin_reflection(chat.id, db)
    manager.end_reflection(chat.id, "return", db)
    used_after_first = state.reflection_seconds_used
    started_after_first = state.started_at
    info2, again = manager.end_reflection(chat.id, "return", db)
    assert not again and info2.session_status == "ACTIVE"
    assert state.reflection_seconds_used == used_after_first
    assert state.started_at == started_after_first
    # and with no session at all: nothing, not an error
    assert manager.end_reflection(chat.id + 999, "return", db) == (None, False)


# ── presence while reflecting ────────────────────────────────────────────────

def test_disconnect_during_reflection_does_not_double_freeze(sqlite):
    db, _ = sqlite
    manager, state, chat, *_ = _reading(db, seconds_in=70, minutes_charged=2)
    manager.begin_reflection(chat.id, db)
    frozen = state.paused_elapsed_seconds
    # fifty seconds of reflection pass before the socket drops
    state.reflecting_since -= timedelta(seconds=50)
    state.started_at -= timedelta(seconds=50)
    manager.handle_client_disconnect(chat.id)
    assert state.client_disconnected_at is not None
    assert state.paused_elapsed_seconds == frozen          # not 120
    assert state.reflecting_since is not None               # still reflecting


def test_reconnect_during_reflection_does_not_rebase(sqlite):
    db, _ = sqlite
    manager, state, chat, *_ = _reading(db, seconds_in=70, minutes_charged=2)
    manager.begin_reflection(chat.id, db)
    state.reflecting_since -= timedelta(seconds=50)
    state.started_at -= timedelta(seconds=50)
    manager.handle_client_disconnect(chat.id)
    started_while_away = state.started_at
    manager.handle_client_reconnect(chat.id)
    assert state.client_disconnected_at is None
    assert state.started_at == started_while_away          # the rebase is Return's
    # Return now: the meter continues from the frozen 70, not from 120 or 170
    manager.end_reflection(chat.id, "return", db)
    assert 69 <= (datetime.now() - state.started_at).total_seconds() <= 72


# ── the session ending mid-reflection ────────────────────────────────────────

def test_end_session_while_reflecting_persists_the_total(sqlite):
    db, _ = sqlite
    manager, state, chat, session, client, psychic = _reading(db, seconds_in=70,
                                                              minutes_charged=2,
                                                              reflection_used=40)
    manager.begin_reflection(chat.id, db)
    state.reflecting_since -= timedelta(seconds=25)
    state.started_at -= timedelta(seconds=25)
    asyncio.run(
        manager.end_session(chat.id, ChatTerminationReason.MANUAL_EXIT,
                            ended_by_user_id=psychic.id)
    )
    row = _row(db, session.id)
    assert row.status == ChatSessionStatus.COMPLETED
    assert row.reflecting_since is None
    assert 64 <= row.reflection_seconds_used <= 66       # 40 before + 25 now
    assert chat.id not in manager.active_sessions
    db.expire_all()
    assert db.get(Chat, chat.id).status == ChatStatus.ENDED


# ── restart recovery ─────────────────────────────────────────────────────────

def test_restart_recovers_a_reflection_in_progress_from_the_two_columns(sqlite):
    db, _ = sqlite
    since = datetime.now() - timedelta(seconds=20)
    _, _, chat, session, *_ = _reading(db, seconds_in=400, minutes_charged=0,
                                       reflection_used=60, reflecting_since=since)
    fresh = SessionManager()
    fresh._load_active_sessions_from_db()
    state = fresh.active_sessions[chat.id]
    assert state.reflecting_since == since
    assert state.reflection_seconds_used == 60
    # meter frozen at (reflecting_since − interval start) − used = 380 − 60 = 320
    assert 319 <= state.paused_elapsed_seconds <= 321
    # nothing re-billed: the due minutes are those of the frozen meter
    assert state.minutes_charged == state.paused_elapsed_seconds // 60 + 1
    # the bank is the server's, off the frozen meter: 120 − 60 − 20
    assert 39 <= fresh._reflect_remaining(state) <= 40
    info = fresh._calculate_session_info(state, db)
    assert info.session_status == "REFLECTING" and info.elapsed_seconds == state.paused_elapsed_seconds


def test_restart_excludes_reflected_time_when_not_reflecting(sqlite):
    db, _ = sqlite
    _, _, chat, session, *_ = _reading(db, seconds_in=400, minutes_charged=0,
                                       reflection_used=100)
    fresh = SessionManager()
    fresh._load_active_sessions_from_db()
    state = fresh.active_sessions[chat.id]
    assert state.reflecting_since is None
    assert state.reflection_seconds_used == 100
    elapsed = (datetime.now() - state.started_at).total_seconds()
    assert 299 <= elapsed <= 301, elapsed                  # 400 − 100
    assert state.minutes_charged == 300 // 60 + 1
