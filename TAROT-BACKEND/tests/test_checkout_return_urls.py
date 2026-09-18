"""The Stripe Checkout success and cancel URLs. The builder only: no Stripe call."""

from app.routers import payments


def test_with_return_url_both_urls_come_back_to_the_page_left(monkeypatch):
    monkeypatch.setattr(payments.settings, "FRONT_BASE_URL", "https://front.example.test")
    success, cancel = payments.checkout_return_urls("/app/you?topup=1")
    assert success == "https://front.example.test/app/you?topup=1&status=success"
    assert cancel == "https://front.example.test/app/you?topup=1&status=cancelled"


def test_without_return_url_both_urls_stay_on_billing(monkeypatch):
    monkeypatch.setattr(payments.settings, "FRONT_BASE_URL", "https://front.example.test")
    for missing in (None, ""):
        success, cancel = payments.checkout_return_urls(missing)
        assert success == "https://front.example.test/billing?status=success"
        assert cancel == "https://front.example.test/billing?status=cancelled"
