import asyncio
import os
from datetime import datetime, timedelta
from types import SimpleNamespace
from uuid import uuid4

import pytest


def test_grace_topup_hold_resume_and_billing_postgresql(monkeypatch):
    database_url = os.getenv("D24_POSTGRES_TEST_DATABASE_URL", "").strip()
    if not database_url:
        pytest.skip("D24_POSTGRES_TEST_DATABASE_URL is required")
    if os.getenv("D24_POSTGRES_TEST_CONFIRM_DISPOSABLE") != "YES":
        pytest.fail("D24 PostgreSQL test requires an explicitly disposable database")
    assert os.getenv("DATABASE_URL") == database_url
    assert database_url.rsplit("/", 1)[-1] == "tarot_d24"

    import stripe

    from app.database.client import SessionLocal
    from app.enums.chat_session_status import ChatSessionStatus
    from app.enums.chat_session_triggers import ChatSessionTrigger
    from app.enums.chat_status import ChatStatus
    from app.enums.chat_termination_reason import ChatTerminationReason
    from app.enums.role import Role
    from app.enums.transaction_type import TransactionType
    from app.models.chat import Chat
    from app.models.chat_session import ChatSession
    from app.models.session_intervals import SessionInterval
    from app.models.settings import Settings
    from app.models.transaction import Transaction
    from app.models.user import User
    from app.routers.chats import topup_chat_balance
    from app.services import session_manager as session_manager_module
    from app.services.session_manager import GRACE_SECONDS, SessionManager, SessionState
    from app.services.transactions import create_credit_transaction

    suffix = uuid4().hex
    started_at = datetime.now() - timedelta(seconds=60)
    per_minute = 6.0

    db = SessionLocal()
    try:
        client = User(
            email=f"d24-client-{suffix}@example.invalid",
            username=f"d24-client-{suffix}",
            password_hash="synthetic",
            role=Role.USER,
            balance=per_minute,
            credit_balance=0,
            is_verified=True,
        )
        psychic = User(
            email=f"d24-reader-{suffix}@example.invalid",
            username=f"d24-reader-{suffix}",
            password_hash="synthetic",
            role=Role.PSYCHIC,
            balance=0,
            credit_balance=0,
            price_per_second=per_minute / 60,
            is_verified=True,
        )
        db.add_all([client, psychic])
        db.flush()

        chat = Chat(
            user_id=client.id,
            psychic_id=psychic.id,
            status=ChatStatus.ACTIVE,
            client_joined_at=started_at,
        )
        db.add(chat)
        db.flush()
        paid_session = ChatSession(chat_id=chat.id, status=ChatSessionStatus.ACTIVE)
        db.add(paid_session)
        db.flush()
        first_interval = SessionInterval(
            session_id=paid_session.id,
            started_at=started_at,
            is_billed=True,
            trigger_event=ChatSessionTrigger.INITIAL_START,
        )
        db.add(first_interval)
        for key, value in (
            ("stripe_api_key", "d24-synthetic"),
            ("unit_price_cents", "1"),
        ):
            setting = db.query(Settings).filter(Settings.key == key).first()
            if setting:
                setting.value = value
            else:
                db.add(Settings(key=key, value=value))
        db.commit()
        db.refresh(first_interval)

        manager = SessionManager()
        state = SessionState(
            chat_id=chat.id,
            session_id=paid_session.id,
            interval_id=first_interval.id,
            started_at=started_at,
            client_id=client.id,
            psychic_id=psychic.id,
            rate_per_second=per_minute / 60,
            max_session_duration_seconds=60,
            initial_balance=per_minute,
            last_check_at=datetime.now(),
            awaiting_join=False,
            client_joined_at=started_at,
        )
        manager.active_sessions[chat.id] = state
        session_manager_module.session_manager = manager

        manager._charge_minute(db, state, 1)
        state.minutes_charged = 1
        assert db.query(Transaction).filter(
            Transaction.related_chat_id == chat.id,
            Transaction.transaction_type == TransactionType.DEBIT,
        ).count() == 1

        asyncio.run(manager._enter_grace(chat.id, state))
        state.grace_started_at = datetime.now() - timedelta(seconds=50)
        db.expire_all()
        assert db.get(Chat, chat.id).status == ChatStatus.PAUSED
        db.refresh(first_interval)
        assert first_interval.termination_reason == ChatTerminationReason.PAUSE_FOR_TOPUP
        assert manager.get_session_info(chat.id).grace_seconds_left <= GRACE_SECONDS - 49

        monkeypatch.setattr(
            stripe.checkout.Session,
            "create",
            lambda **_kwargs: SimpleNamespace(
                id="cs_d24_synthetic", url="https://example.invalid/d24-checkout"
            ),
        )
        checkout = asyncio.run(topup_chat_balance(chat.id, db=db, user=client))
        assert checkout.url == "https://example.invalid/d24-checkout"
        held = manager.get_session_info(chat.id)
        assert held.session_status == "GRACE"
        assert held.is_topping_up is True
        assert held.grace_seconds_left > GRACE_SECONDS
        assert db.query(Transaction).filter(
            Transaction.related_chat_id == chat.id,
            Transaction.transaction_type == TransactionType.DEBIT,
        ).count() == 1

        credit = create_credit_transaction(
            db=db,
            user_id=client.id,
            amount=12,
            description="D24 synthetic top-up",
            stripe_payment_intent_id=f"pi_{suffix}",
            idempotency_key=f"evt_{suffix}",
        )
        resumed = manager.resume_session(chat.id, new_balance=float(credit.balance_after))

        db.expire_all()
        assert resumed.session_status == "ACTIVE"
        assert resumed.minutes_charged == 2
        assert resumed.remaining_seconds >= 119
        assert db.get(Chat, chat.id).status == ChatStatus.ACTIVE
        assert state.is_grace is False
        assert state.topping_up is False
        assert state.last_topup_amount == 12

        debits = (
            db.query(Transaction)
            .filter(
                Transaction.related_chat_id == chat.id,
                Transaction.transaction_type == TransactionType.DEBIT,
            )
            .order_by(Transaction.id)
            .all()
        )
        assert [float(row.amount) for row in debits] == [per_minute, per_minute]
        assert [row.description for row in debits] == [
            f"Session #{paid_session.id} - Minute 1",
            f"Session #{paid_session.id} - Minute 2",
        ]
        db.refresh(client)
        assert float(client.balance) == per_minute

        intervals = (
            db.query(SessionInterval)
            .filter(SessionInterval.session_id == paid_session.id)
            .order_by(SessionInterval.id)
            .all()
        )
        assert len(intervals) == 2
        assert intervals[1].trigger_event == ChatSessionTrigger.RESUME_AFTER_TOPUP
        assert intervals[1].is_billed is True
        assert intervals[1].ended_at is None
    finally:
        session_manager_module.session_manager = None
        db.close()
