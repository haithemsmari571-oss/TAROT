"""EmailConfirm=A: let her in first, confirm before her second message or her
first top-up (services/email_confirmation.py).

A new client signs in and writes to a reader before she confirms her email.
The server holds her second message, in any thread, and the start of her
first Stripe checkout until she does, so calling the API directly does not get
round either. Each refusal stores nothing and charges nothing, and carries the
reason EMAIL_NOT_CONFIRMED, which the app turns into its confirm sheet. Once
she has used the confirmation link, both go through.

Sign-in runs through the real auth router (tests/test_auth_logs.py), a send
through the real message handler (tests/test_per_message_billing.py), /request
and the checkouts through the real routers (tests/test_per_message_endpoints.py,
tests/test_checkout_and_refund_fixes.py). Stripe is never called for real.
"""

import jwt
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.database.client import get_db
from app.dependencies.get_current_user import get_current_user
from app.enums.role import Role
from app.models import Chat, Message, Transaction, User
from app.models.settings import Settings
from app.routers import payments
from app.services import auth as auth_service
from app.services.email_confirmation import EMAIL_NOT_CONFIRMED
from app.services.session_manager import SessionManager
from tests.test_auth_logs import EMAIL, PASSWORD, _body, auth, mail  # noqa: F401
from tests.test_per_message_billing import (
    _chat,
    _debits,
    _mode,
    _people,
    _send,
    _stub_delivery,
)
from tests.test_per_message_endpoints import _client as _chats_http
from tests.test_per_message_endpoints import _mode as _endpoint_mode
from tests.test_per_message_endpoints import _people as _endpoint_people
from tests.test_per_message_endpoints import _quiet_reply_side_effects, sqlite  # noqa: F401

REFUSED_FRAME = {"event": "message_rejected", "data": {"reason": EMAIL_NOT_CONFIRMED}}


def _confirm_through_the_link(db, user):
    """The real confirmation: the emailed link's token, used as the link does
    (services/auth.py verify_account)."""
    link = auth_service._generate_verify_account_link(db, user.id)
    auth_service.verify_account(db, link.rsplit("/", 1)[1])
    db.refresh(user)
    assert user.is_verified is True


# ── 1. sign-in ───────────────────────────────────────────────────────────────
def test_an_unconfirmed_client_signs_in(db, auth):
    assert auth.post("/api/auth/sign-up", json=_body()).status_code == 201
    user = db.query(User).one()
    user.is_verified = False
    db.commit()

    response = auth.post("/api/auth/sign-in", json={"email": EMAIL, "password": PASSWORD})

    assert response.status_code == 200, response.text
    tokens = response.json()
    assert set(tokens) >= {"access_token", "refresh_token"}
    claims = jwt.decode(tokens["access_token"], options={"verify_signature": False})
    assert claims["sub"] == str(user.id)
    assert claims["role"] == Role.USER.value
    db.refresh(user)
    assert user.is_verified is False  # signing in confirms nothing


def test_an_unconfirmed_reader_still_confirms_first(db, auth):
    assert auth.post("/api/auth/sign-up", json=_body()).status_code == 201
    user = db.query(User).one()
    user.role = Role.PSYCHIC
    user.is_verified = False
    db.commit()

    response = auth.post("/api/auth/sign-in", json={"email": EMAIL, "password": PASSWORD})

    assert response.status_code == 403, response.text
    assert "access_token" not in response.text


# ── 2. messages, over the room's socket ──────────────────────────────────────
def test_her_first_message_goes_through_unconfirmed(db, make_user, monkeypatch):
    _mode(monkeypatch, "per_message")
    _stub_delivery(monkeypatch)
    client, psychic = _people(db, make_user, credit=100.0, price=2.5)
    assert client.is_verified is False
    chat = _chat(db, client, psychic)

    ws = _send(db, chat, client, "is he thinking of me")

    assert [p for p in ws.sent if p.get("event") == "message_rejected"] == []
    message = db.query(Message).one()
    assert (message.sender_id, message.content) == (client.id, "is he thinking of me")
    assert [d.related_message_id for d in _debits(db)] == [message.id]


def test_her_second_message_waits_for_the_confirmation(db, make_user, monkeypatch):
    _mode(monkeypatch, "per_message")
    _stub_delivery(monkeypatch)
    client, psychic = _people(db, make_user, credit=100.0, price=2.5)
    chat = _chat(db, client, psychic)
    _send(db, chat, client, "is he thinking of me")
    db.refresh(client)
    credit_after_first = float(client.credit_balance)

    ws = _send(db, chat, client, "and will he call")

    assert ws.sent == [REFUSED_FRAME]
    assert [m.content for m in db.query(Message).all()] == ["is he thinking of me"]
    assert len(_debits(db)) == 1
    db.refresh(client)
    assert float(client.credit_balance) == credit_after_first  # nothing charged


def test_the_second_message_waits_in_any_thread(db, make_user, monkeypatch):
    _mode(monkeypatch, "per_message")
    _stub_delivery(monkeypatch)
    client, first_reader = _people(db, make_user, credit=100.0, price=2.5)
    second_reader = make_user(role=Role.PSYCHIC)
    second_reader.price_per_message = 3.0
    db.commit()
    _send(db, _chat(db, client, first_reader), client, "is he thinking of me")

    ws = _send(db, _chat(db, client, second_reader), client, "what about work")

    assert ws.sent == [REFUSED_FRAME]
    assert db.query(Message).count() == 1
    assert len(_debits(db)) == 1


def test_after_confirming_her_second_message_goes_through(db, make_user, monkeypatch):
    _mode(monkeypatch, "per_message")
    _stub_delivery(monkeypatch)
    client, psychic = _people(db, make_user, credit=100.0, price=2.5)
    chat = _chat(db, client, psychic)
    _send(db, chat, client, "is he thinking of me")
    assert _send(db, chat, client, "and will he call").sent == [REFUSED_FRAME]

    _confirm_through_the_link(db, client)
    ws = _send(db, chat, client, "and will he call")

    assert [p for p in ws.sent if p.get("event") == "message_rejected"] == []
    assert [m.content for m in db.query(Message).order_by(Message.id).all()] == [
        "is he thinking of me", "and will he call",
    ]
    assert len(_debits(db)) == 2


def test_a_confirmed_client_is_never_asked(db, make_user, monkeypatch):
    _mode(monkeypatch, "per_message")
    _stub_delivery(monkeypatch)
    client, psychic = _people(db, make_user, credit=100.0, price=2.5)
    client.is_verified = True
    db.commit()
    chat = _chat(db, client, psychic)

    for text in ("one", "two", "three"):
        ws = _send(db, chat, client, text)
        assert [p for p in ws.sent if p.get("event") == "message_rejected"] == []

    assert db.query(Message).count() == 3
    assert len(_debits(db)) == 3


# ── 3. /request cannot get round it ──────────────────────────────────────────
def test_request_refuses_her_second_message_with_nothing_created(sqlite, monkeypatch):  # noqa: F811
    db, _ = sqlite
    _endpoint_mode(monkeypatch, "per_message")
    calls = _quiet_reply_side_effects(monkeypatch)
    client, psychic = _endpoint_people(db, balance=10.0)
    _, other_reader = _endpoint_people(db, balance=0.0)
    http = _chats_http(db, client, SessionManager(), monkeypatch)
    first = http.post("/api/chat/request", json={"psychic_id": psychic.id, "message": "will he come back"})
    assert first.status_code == 201, first.text
    rows = (db.query(Chat).count(), db.query(Message).count(), db.query(Transaction).count())

    second = http.post("/api/chat/request", json={"psychic_id": other_reader.id, "message": "and my job"})

    assert second.status_code == 402, second.text
    assert second.json()["detail"] == EMAIL_NOT_CONFIRMED
    assert (db.query(Chat).count(), db.query(Message).count(), db.query(Transaction).count()) == rows
    assert len(calls["enqueue"]) == 1  # only the first message went to a reader


# ── 4. the first top-up ──────────────────────────────────────────────────────
@pytest.fixture
def checkout(db, make_user, monkeypatch):
    """The payments router at its real prefix, a client with no confirmed email,
    and a Stripe stand-in that records every checkout it is asked to create."""
    client = make_user()
    db.add(Settings(key="stripe_api_key", value="sk_test_not_a_real_key"))
    db.add(Settings(key="unit_price_cents", value="100"))
    db.commit()
    created = []

    class Made:
        id = "cs_test_made"
        url = "https://checkout.stripe.test/c/pay/cs_test_made"

    def create(**kwargs):
        created.append(kwargs)
        return Made()

    monkeypatch.setattr(payments.stripe.checkout.Session, "create", create)
    app = FastAPI()
    app.include_router(payments.router, prefix="/api/payment")
    app.dependency_overrides[get_db] = lambda: db
    app.dependency_overrides[get_current_user] = lambda: client
    http = TestClient(app, raise_server_exceptions=False)
    return http, client, created, Made.url


GLIDER = ("/api/payment/create-stardust-checkout-session", {"amount_usd": 50, "return_url": "/app/you?topup=1"})
FIXED = ("/api/payment/create-checkout-session", {"points_amount": 20})


@pytest.mark.parametrize("route", [GLIDER, FIXED], ids=["glider", "fixed"])
def test_her_first_top_up_waits_for_the_confirmation(checkout, route):
    http, _client, created, _url = checkout

    response = http.post(route[0], json=route[1])

    assert response.status_code == 403, response.text
    assert response.json() == {"detail": EMAIL_NOT_CONFIRMED}
    assert created == []  # Stripe was never asked


@pytest.mark.parametrize("route", [GLIDER, FIXED], ids=["glider", "fixed"])
def test_after_confirming_her_top_up_reaches_stripe(checkout, db, route):
    http, client, created, url = checkout
    assert http.post(route[0], json=route[1]).status_code == 403

    _confirm_through_the_link(db, client)
    response = http.post(route[0], json=route[1])

    assert response.status_code == 200, response.text
    assert response.json() == {"url": url}
    assert len(created) == 1
