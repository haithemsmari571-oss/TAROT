"""Lifetime Access is paid in pounds, so it is written in pounds (ROUND34 item 1,
ROUND33 decision 1 = A).

The checkout charges in "gbp" (routers/payments.py), but the order's ledger
line and the staff notification printed "($1000)". Both now print the amount
through the site's one money rule (reply_emails.pounds, formatGbp's rule):
"£1,000". The metadata field keeps its legacy name, amount_usd (item 3).

The real webhook handler runs on the in-memory database; the support email
and the live push are recorded, nothing leaves the process.
"""

import asyncio

import pytest
from sqlalchemy.orm import sessionmaker

import app.database.client as database_client
from app.enums.notification_type import NotificationType
from app.enums.role import Role
from app.models import Transaction
from app.models.notification import Notification
from app.notification_manager import notification_manager
from app.routers import payments
from app.services import email as email_service


@pytest.fixture
def lifetime(db, make_user, monkeypatch):
    """The handler's own SessionLocal on the test database, a client and two
    staff accounts, and recorders for the email and the pushes."""
    monkeypatch.setattr(database_client, "SessionLocal",
                        sessionmaker(bind=db.get_bind(), expire_on_commit=False))
    emails, pushes = [], []

    async def _send_email(**kwargs):
        emails.append(kwargs)

    async def _send_to_user(message, user_id):
        pushes.append((user_id, message))

    monkeypatch.setattr(email_service, "send_email", _send_email)
    monkeypatch.setattr(notification_manager, "send_to_user", _send_to_user)
    client = make_user()
    admin = make_user(role=Role.ADMIN)
    superadmin = make_user(role=Role.SUPERADMIN)

    def buy(metadata, amount_total=100_000, event_id="evt_round34"):
        asyncio.run(payments._handle_lifetime_purchase(
            event={"id": event_id}, session={"id": f"cs_{event_id}"}, metadata=metadata,
            user_id=client.id, payment_intent_id=f"pi_{event_id}", amount_total=amount_total,
            idempotency_key=f"lifetime:{event_id}"))

    return {"db": db, "client": client, "staff": [admin, superadmin], "buy": buy,
            "emails": emails, "pushes": pushes}


def _staff_messages(db, staff):
    return [n.message for n in db.query(Notification)
            .filter(Notification.user_id.in_([s.id for s in staff]),
                    Notification.type == NotificationType.LIFETIME_ACCESS_PURCHASED)
            .order_by(Notification.id)]


def test_the_ledger_line_prints_pounds(lifetime):
    lifetime["buy"]({"amount_usd": "1000", "lifetime": "true"})

    [row] = lifetime["db"].query(Transaction).all()
    assert row.description == "⚡ LIFETIME ACCESS — manual fulfilment needed (£1,000)"
    assert "$" not in row.description


def test_the_staff_notification_prints_pounds(lifetime):
    lifetime["buy"]({"amount_usd": "1000", "lifetime": "true"})

    name = lifetime["client"].username
    line = f"{name} purchased Lifetime Access (£1,000). Grant access manually — no automatic tracking."
    assert _staff_messages(lifetime["db"], lifetime["staff"]) == [line, line]
    staff_ids = {s.id for s in lifetime["staff"]}
    staff_pushes = [m for user_id, m in lifetime["pushes"] if user_id in staff_ids]
    assert [m["message"] for m in staff_pushes] == [line, line]
    assert not any("$" in m["message"] for _, m in lifetime["pushes"])


def test_the_amount_from_stripe_when_the_metadata_has_none(lifetime):
    lifetime["buy"]({"lifetime": "true"}, amount_total=45_000)

    [row] = lifetime["db"].query(Transaction).all()
    assert row.description.endswith("(£450)")
    assert all(m.endswith("(£450). Grant access manually — no automatic tracking.")
               for m in _staff_messages(lifetime["db"], lifetime["staff"]))


def test_the_field_keeps_its_legacy_name(lifetime):
    """Item 3: amount_usd is left as it is, name only; its value is pounds."""
    lifetime["buy"]({"amount_usd": "1000", "lifetime": "true"})

    [email] = lifetime["emails"]
    assert email["vars"]["amount_usd"] == 1000
    [row] = lifetime["db"].query(Transaction).all()
    assert '"amount_usd": 1000' in row.transaction_metadata
