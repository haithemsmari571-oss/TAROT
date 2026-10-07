"""The staff Lifetime Access email signs with the brand constant (ROUND32,
decision 7). Its footer said "© 2026 AskValentina"; it now reads {{brand}},
which send_email fills from email.py's BRAND_NAME ("Ask Valentina"), as every
client email already does. No template spells the brand as one word.
"""

import asyncio

from pydantic import NameEmail

from app.enums.email_template_key import MailTemplateKey
from app.services import email as email_service
from tests.test_auth_logs import mail  # noqa: F401

LIFETIME_VARS = {
    "username": "nadia",
    "user_id": 7,
    "user_email": "nadia.stone@test.co",
    "amount_usd": "49.00",
    "stripe_session_id": "cs_test_synthetic",
    "entitlement": "lifetime",
    "transaction_id": 11,
}


def test_the_lifetime_access_email_footer_uses_the_brand(mail):
    asyncio.run(
        email_service.send_email(
            recepientEmail=[NameEmail(email="staff@test.co", name="staff")],
            template_key=MailTemplateKey.LIFETIME_ACCESS.value,
            vars=LIFETIME_VARS,
        )
    )

    [message] = mail.sent
    assert f"&copy; 2026 {email_service.BRAND_NAME}. Automated notification." in message.alternative_body
    assert "AskValentina" not in message.alternative_body


def test_no_email_template_spells_the_brand_as_one_word():
    assert email_service.BRAND_NAME == "Ask Valentina"
    for key, template in email_service.templates.items():
        assert "AskValentina" not in template, key


# ── who runs the site, at the foot of every client email (ROUND39) ──────────
CLIENT_EMAILS = [
    (MailTemplateKey.VERIFY_ACCOUNT, {"username": "nadia", "verify_link": "https://x/v"}),
    (MailTemplateKey.FORGOT_PASSWORD, {"username": "nadia", "reset_link": "https://x/r", "link_minutes": 60}),
    (MailTemplateKey.READER_REPLIED, {"line": "Sophie replied", "chat_link": "https://x/c", "you_link": "https://x/y"}),
    (MailTemplateKey.MESSAGE_REFUNDED, {"line": "Refunded", "chat_link": "https://x/c", "you_link": "https://x/y"}),
]


def test_the_company_words_are_the_owners():
    assert email_service.COMPANY_IDENTITY == (
        "Ask Valentina is a trading name of Numinous Holdings Ltd, a company "
        "registered in England and Wales (company number 17151844)."
    )
    assert email_service.COMPANY_CONTACT == (
        "Registered office: 66 Paul Street, London, EC2A 4NA · Contact: support@askvalentina.co.uk"
    )


def test_every_client_email_names_the_company_in_its_footer(mail):
    for key, vars in CLIENT_EMAILS:
        asyncio.run(
            email_service.send_email(
                recepientEmail=[NameEmail(email="nadia@test.co", name="nadia")],
                template_key=key.value,
                vars=vars,
            )
        )
    assert len(mail.sent) == len(CLIENT_EMAILS)
    for message in mail.sent:
        footer = message.alternative_body.split('<div class="footer">', 1)[1]
        assert email_service.COMPANY_IDENTITY in footer
        assert email_service.COMPANY_CONTACT in footer


def test_no_email_carries_the_old_brand():
    for key, template in email_service.templates.items():
        for old in ("Alchemical", "celestial.io", "council@"):
            assert old.lower() not in template.lower(), (key, old)
