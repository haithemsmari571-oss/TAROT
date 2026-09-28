"""Three ROUND30 fixes on the money routes.

1. Stripe's return addresses. FRONT_BASE_URL ends with a slash (config.py's
   default, and production's), so the success and cancel URLs came out as
   "https://askvalentina.co.uk//app/you?topup=1&status=success", which the
   site's router answers with its 404 page: every client back from Stripe,
   paid or cancelled, landed there.
2. A failed app checkout answered the client with Stripe's own error text,
   which names the key it was given (masked); the app printed it in the
   top-up window. The text stays in the log only.
3. POST /api/admin/refunds/ logged the superadmin's full email (ROUND28
   defect 2). Its lines carry the admin's id and username, as users.py does.
"""

import logging

import pytest
import stripe
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.config import AppSettings
from app.database.client import get_db
from app.dependencies.get_current_user import get_current_user
from app.enums.role import Role
from app.enums.transaction_status import TransactionStatus
from app.enums.transaction_type import TransactionType
from app.models import Transaction
from app.models.settings import Settings
from app.routers import payments
from app.routers import refunds

ADMIN_EMAIL = "Owner.Admin@test.co"
STRIPE_TEXT = "Expired API Key provided: sk_test_*****************************a1b2"


def _rendered(caplog, capsys) -> str:
    """The server's log output: every record (caplog) plus stdout and stderr,
    less the test client's own httpx and httpcore lines."""
    captured = capsys.readouterr()
    return "".join(
        caplog.handler.format(r) + "\n"
        for r in caplog.records
        if not r.name.startswith(("httpx", "httpcore"))
    ) + captured.out + captured.err


# ── 1. the return addresses ──────────────────────────────────────────────────
def test_the_configured_default_ends_with_a_slash():
    """Why the fix is needed: the default every environment starts from."""
    assert AppSettings.model_fields["FRONT_BASE_URL"].default.endswith("/")


@pytest.mark.parametrize("base", ["https://askvalentina.co.uk/", "https://askvalentina.co.uk"])
def test_back_from_stripe_the_address_has_one_slash(monkeypatch, base):
    monkeypatch.setattr(payments.settings, "FRONT_BASE_URL", base)

    success, cancel = payments.checkout_return_urls("/app/you?topup=1")
    assert success == "https://askvalentina.co.uk/app/you?topup=1&status=success"
    assert cancel == "https://askvalentina.co.uk/app/you?topup=1&status=cancelled"

    success, _ = payments.checkout_return_urls("/app/chats/75?topup=1")
    assert success == "https://askvalentina.co.uk/app/chats/75?topup=1&status=success"

    success, cancel = payments.checkout_return_urls(None)
    assert success == "https://askvalentina.co.uk/billing?status=success"
    assert cancel == "https://askvalentina.co.uk/billing?status=cancelled"
    for url in (success, cancel):
        assert "//" not in url.split("://", 1)[1]


# ── 2. a failed checkout does not show Stripe's text ─────────────────────────
@pytest.fixture
def checkout(db, make_user):
    client = make_user()
    # Her email is confirmed: an unconfirmed client's checkout is refused
    # before Stripe (ROUND38, tests/test_email_confirmation_gate.py).
    client.is_verified = True
    db.add(Settings(key="stripe_api_key", value="sk_test_not_a_real_key"))
    db.commit()
    app = FastAPI()
    app.include_router(payments.router, prefix="/api/payment")
    app.dependency_overrides[get_db] = lambda: db
    app.dependency_overrides[get_current_user] = lambda: client
    return TestClient(app, raise_server_exceptions=False)


def test_a_failed_checkout_answers_without_stripes_words(checkout, monkeypatch, caplog, capsys):
    def refuse(**kwargs):
        raise stripe.AuthenticationError(STRIPE_TEXT)

    monkeypatch.setattr(payments.stripe.checkout.Session, "create", refuse)
    caplog.set_level(logging.DEBUG)

    resp = checkout.post(
        "/api/payment/create-stardust-checkout-session",
        json={"amount_usd": 50, "return_url": "/app/you?topup=1"},
    )

    assert resp.status_code == 400
    assert resp.json() == {"detail": "Error creating checkout session"}
    for leaked in ("sk_test", "Expired", "API Key", "a1b2"):
        assert leaked not in resp.text
    # The log keeps what happened.
    output = _rendered(caplog, capsys)
    assert "stardust_checkout_session_creation_failed" in output
    assert "AuthenticationError" in output


def test_a_created_checkout_still_returns_its_url(checkout, monkeypatch):
    seen = {}

    class Made:
        id = "cs_test_made"
        url = "https://checkout.stripe.test/c/pay/cs_test_made"

    def create(**kwargs):
        seen.update(kwargs)
        return Made()

    monkeypatch.setattr(payments.stripe.checkout.Session, "create", create)
    monkeypatch.setattr(payments.settings, "FRONT_BASE_URL", "https://askvalentina.co.uk/")

    resp = checkout.post(
        "/api/payment/create-stardust-checkout-session",
        json={"amount_usd": 50, "return_url": "/app/you?topup=1"},
    )

    assert resp.status_code == 200, resp.text
    assert resp.json() == {"url": Made.url}
    assert seen["success_url"] == "https://askvalentina.co.uk/app/you?topup=1&status=success"
    assert seen["cancel_url"] == "https://askvalentina.co.uk/app/you?topup=1&status=cancelled"
    assert seen["line_items"][0]["price_data"]["currency"] == "gbp"


# ── 3. the refund route logs no email ────────────────────────────────────────
def test_the_refund_route_logs_the_admin_by_id_not_email(db, make_user, caplog, capsys):
    client = make_user(balance=10)
    admin = make_user(role=Role.SUPERADMIN)
    admin.email = ADMIN_EMAIL
    db.commit()
    debit = Transaction(
        user_id=client.id, transaction_type=TransactionType.DEBIT, amount=2.5,
        balance_before=12.5, balance_after=10, status=TransactionStatus.COMPLETED,
        description="Message #1",
    )
    db.add(debit)
    db.commit()

    app = FastAPI()
    app.include_router(refunds.router, prefix="/api/admin/refunds")
    app.dependency_overrides[get_db] = lambda: db
    app.dependency_overrides[get_current_user] = lambda: admin
    caplog.set_level(logging.DEBUG)

    resp = TestClient(app).post(
        "/api/admin/refunds/",
        json={"transaction_id": debit.id, "amount": 2.5, "reason": "ROUND30 test"},
    )

    assert resp.status_code == 200, resp.text
    output = _rendered(caplog, capsys)
    assert "refund_requested" in output
    assert ADMIN_EMAIL.lower() not in output.lower()
    assert "admin_email" not in output
    assert "admin_user_id" in output
