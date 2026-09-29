"""The published Terms of Service and Privacy Policy replace the generic template.

The settings rows terms_of_service and privacy_policy (GET /settings/public,
drawn on /terms, /privacy, /app/you/terms and /app/you/privacy as Markdown)
held a generic template written for "this Tarot reading application", with
refunds "on a case-by-case basis". Where a row still holds that template (it
contains one of the template's phrases listed in TEXTS), it gets the published
text.
A missing row is inserted with the published text. Any other row holds
somebody's own wording and is left alone, with one log line. The seeds
(app/database/seeders/*/settings.json) hold the same published texts.

Downgrade puts the generic template back where a row still holds the
published text, and leaves any other row alone.

Revision ID: 1e859de0e75c
Revises: 5e0f6599a623
"""

import logging

import sqlalchemy as sa
from alembic import op


revision = "1e859de0e75c"
down_revision = "5e0f6599a623"
branch_labels = None
depends_on = None


log = logging.getLogger("alembic.runtime.migration")

TERMS_OF_SERVICE = """# Terms of Service

Last updated: 28 September 2026

## 1. Who we are

Ask Valentina is run by Numinous Holdings Ltd, a company registered in England and Wales under company number 17151844, with its registered office at 66 Paul Street, London EC2A 4NA. In these terms "we" and "us" mean Numinous Holdings Ltd, and "you" means the person using the account.

You can reach us at [support@askvalentina.co.uk](mailto:support@askvalentina.co.uk).

## 2. Agreeing to these terms

You agree to these terms, and to our Privacy Policy, when you tick the box to accept them as you create your account. We keep a record of the date and time you ticked it.

We may change these terms. If a change matters to you, we will tell you by email or in the app before it takes effect.

## 3. Who can use Ask Valentina

You must be 18 or over. We ask for your date of birth when you sign up and we do not open accounts for anyone under 18.

We may ask you to confirm your email address before you can do certain things, such as sending more messages or buying Stardust.

## 4. What a reading is

Readings on Ask Valentina are for guidance and entertainment. They are not advice. Do not use a reading in place of advice from a doctor, lawyer, financial adviser, counsellor or any other qualified professional, and do not make important decisions on a reading alone. We do not promise that anything said in a reading is accurate or will happen.

## 5. Readers' hours

Each reader keeps her own online hours in UK time. When she is away, your message waits, and she answers when her hours begin again.

## 6. Stardust and prices

Ask Valentina uses Stardust. One Stardust is worth £1.

You buy Stardust in packs. Payments are taken by Stripe, our payment provider. We never see or store your card details.

Each reader has her own price per message, which we set. You see it on her profile and on the Send button. The price you pay is the one shown when you press Send.

The reader's first hello in a new conversation is free. Each message you send costs the reader's price, taken from your Stardust when you press Send. A message can be up to 300 characters. If you do not have enough Stardust for a message, it is not sent and nothing is taken.

When a message is paid for, we use Stardust you earned in the app first, then your welcome credit, then Stardust you bought.

Stardust has no cash value and cannot be exchanged for money. This does not affect your statutory rights.

## 7. Automatic refunds

If your reader doesn't reply within 24 hours, your Stardust is refunded automatically. You do not need to ask.

We also give it back straight away if something goes wrong on our side and a reply cannot be sent.

A refund goes back to where the Stardust came from: bought Stardust to your bought Stardust, welcome credit to your welcome credit, and earned Stardust to your earned Stardust. If that earned Stardust has expired in the meantime, it comes back as welcome credit.

You will see the refund in the conversation and in your activity under You, and we email you. Refunds are made in Stardust, not to your card.

## 8. Welcome credit

A new account gets free welcome credit. The amount is shown on the sign-up page when you join.

Welcome credit is spent on messages like Stardust. It has no cash value, cannot be exchanged for money, and is lost if you delete your account.

## 9. Stardust you earn

Some features of the app may give you Stardust as a reward. Earned Stardust expires 30 days after it is added to your account.

## 10. Emails we send you

We send you an email to confirm your address when you sign up, and a link to reset your password when you ask for one.

We also email you when a reader has replied and you have not read it yet, and when a message is refunded. These go only to a confirmed address, and you can turn them off in the app under You.

## 11. Your conversations

A conversation with a reader never closes. You can come back to it at any time, and your earlier messages stay in it.

## 12. Reviews

You can review a reader once she has answered at least one of your paid messages. You can leave one review per reader, with 1 to 5 stars and up to 1,000 characters. You can change or delete your review.

We read every review before it appears, and a changed review is read again. We may decline to publish a review, or remove it later, if it breaks the law, contains personal information, is abusive, or is not about a real reading. A published review shows your username.

## 13. Deleting your account

You can delete your account yourself in the app, under You.

When you do, we remove your email address, username, date of birth, gender, bio and photo, and sign you out on every device. Any Stardust left on the account is lost, and so are messages still waiting for a reply. We keep your conversations and the record of payments and Stardust under an anonymous identity, so that our accounts stay complete. Deleting cannot be undone, and your email address can be used again for a new account.

## 14. Your account

Keep your password to yourself. You are responsible for what happens on your account. Tell us at once at [support@askvalentina.co.uk](mailto:support@askvalentina.co.uk) if you think someone else has used it.

We may suspend an account that breaks these terms or the law.

## 15. Our responsibility to you

We provide Ask Valentina with reasonable care and skill. Nothing in these terms limits our liability for death or personal injury caused by our negligence, for fraud, or for anything else the law does not allow us to limit, and nothing in them affects your statutory rights as a consumer.

## 16. The law that applies

These terms are governed by the law of England and Wales. The courts of England and Wales can hear any dispute. If you live in Scotland or Northern Ireland, you can also bring proceedings in your home courts.

## 17. Contact

Numinous Holdings Ltd, 66 Paul Street, London EC2A 4NA. Email [support@askvalentina.co.uk](mailto:support@askvalentina.co.uk).

How to make a complaint: email [support@askvalentina.co.uk](mailto:support@askvalentina.co.uk)."""

PRIVACY_POLICY = """# Privacy Policy

Last updated: 28 September 2026

## 1. Who we are

Ask Valentina is run by Numinous Holdings Ltd, company number 17151844, 66 Paul Street, London EC2A 4NA. We are the controller of your personal information. You can reach us about anything in this policy at [support@askvalentina.co.uk](mailto:support@askvalentina.co.uk).

## 2. What we collect

When you create an account: your email address, username, password (stored only in scrambled form), date of birth, gender, and the date and time you accepted our terms.

If you choose to add them: a short bio and a profile photo.

When you use Ask Valentina: the messages you send and receive, the readers you talk to, reviews you leave, your Stardust balance and every Stardust movement, and your email settings.

When you buy Stardust: a record of each purchase. Your card details are handled by Stripe, our payment provider. We never see or store them.

Technical information: your IP address, browser and device details, and sign-in records, which our servers keep for security.

## 3. How we use it

To run your account and your conversations, take payments, give refunds and send the emails you need (confirmation, password reset, reply and refund emails). The legal basis is our contract with you.

To keep the service safe, prevent fraud and misuse, fix problems and improve Ask Valentina. The legal basis is our legitimate interest in running a safe, working service.

To keep financial records and meet other legal duties. The legal basis is legal obligation.

To check you are 18 or over, we use your date of birth.

## 4. Cookies

We use only what is needed to keep you signed in and to make the site work. We do not use advertising or tracking cookies. If we measure visits, we do it without cookies and without identifying you.

## 5. Who we share it with

We share personal information only with service providers who help us run Ask Valentina, such as the companies that host our servers, send our emails and take payments, and only as much as each one needs. They act on our instructions and must keep it safe.

We do not sell your personal information. We may share it where the law requires us to.

Some of these providers may process information outside the UK. Where they do, we rely on protections recognised under UK law, such as adequacy regulations or the UK International Data Transfer Agreement.

## 6. How long we keep it

We keep your information while your account is open. When you delete your account, we remove your email address, username, date of birth, gender, bio and photo. We keep conversations and payment and Stardust records under an anonymous identity, and we keep financial records for as long as the law requires, usually six years.

## 7. Your rights

You can ask us for a copy of your information, ask us to correct it or delete it, object to how we use it, ask us to limit it, or ask for it in a form you can take elsewhere. Email [support@askvalentina.co.uk](mailto:support@askvalentina.co.uk). We will answer within one month.

You can also complain to the Information Commissioner's Office at ico.org.uk. We would like the chance to help first.

## 8. Age

Ask Valentina is only for people aged 18 or over. We do not knowingly collect information from anyone under 18.

## 9. Changes

If we change this policy in a way that matters to you, we will tell you by email or in the app."""

# The generic template both rows held until this revision, word for word as
# the seeds had it; the downgrade puts it back.
TEMPLATE_TERMS_OF_SERVICE = """# Terms of Service

Last updated: April 28, 2026

## Acceptance of Terms

By accessing and using this Tarot reading application, you accept and agree to be bound by the terms and provision of this agreement.

## Use License

- Permission is granted to use this application for personal, non-commercial purposes
- You must not modify or copy the materials
- You must not use the materials for any commercial purpose
- You must not attempt to reverse engineer any software contained in this application

## Service Description

Our application provides Tarot reading services for entertainment and spiritual guidance purposes. Readings are for informational purposes only and should not be considered as professional advice.

## User Accounts

- You are responsible for maintaining the confidentiality of your account
- You are responsible for all activities that occur under your account
- You must notify us immediately of any unauthorized use

## Payment Terms

- Prices are subject to change with notice
- All payments are processed securely through Stripe
- Refunds are handled on a case-by-case basis

## Limitation of Liability

The application and readings are provided "as is" without any warranties. We shall not be liable for any damages arising from the use of this service.

## Disclaimer

Tarot readings are for entertainment and spiritual guidance purposes only. They should not replace professional advice from qualified practitioners in legal, financial, medical, or other professional services.

## Changes to Terms

We reserve the right to modify these terms at any time. Continued use of the application after changes constitutes acceptance of the modified terms.

## Governing Law

These terms shall be governed by and construed in accordance with applicable laws.

## Contact Us

If you have any questions about these Terms of Service, please contact us."""

TEMPLATE_PRIVACY_POLICY = """# Privacy Policy

Last updated: April 28, 2026

## Introduction

Welcome to our Tarot reading application. We respect your privacy and are committed to protecting your personal data.

## Information We Collect

- Personal identification information (name, email address)
- Payment information (processed securely through Stripe)
- Reading history and preferences
- Usage data and analytics

## How We Use Your Information

- To provide and maintain our service
- To process your transactions
- To send you notifications about your readings
- To improve our application
- To comply with legal obligations

## Data Security

We implement appropriate security measures to protect your personal information. Your payment information is processed securely through Stripe and we do not store credit card details.

## Your Rights

You have the right to:
- Access your personal data
- Correct inaccurate data
- Request deletion of your data
- Object to processing of your data
- Data portability

## Contact Us

If you have any questions about this Privacy Policy, please contact us."""

# Each row's published text, its template, and the phrases that mark a value
# as the template (or a copy of it) rather than somebody's own wording.
TEXTS = {
    "terms_of_service": (
        TERMS_OF_SERVICE,
        TEMPLATE_TERMS_OF_SERVICE,
        ("case-by-case", "Tarot reading application"),
    ),
    "privacy_policy": (
        PRIVACY_POLICY,
        TEMPLATE_PRIVACY_POLICY,
        ("Usage data and analytics", "Tarot reading application"),
    ),
}

SELECT_VALUE = sa.text("SELECT value FROM settings WHERE key = :key")
INSERT_ROW = sa.text("INSERT INTO settings (key, value) VALUES (:key, :value)")
SET_VALUE = sa.text(
    "UPDATE settings SET value = :value, updated_at = CURRENT_TIMESTAMP "
    "WHERE key = :key AND value = :was"
)


def upgrade() -> None:
    bind = op.get_bind()
    for key, (text, _template, template_phrases) in TEXTS.items():
        current = bind.execute(SELECT_VALUE, {"key": key}).scalar()
        if current is None:
            bind.execute(INSERT_ROW, {"key": key, "value": text})
            log.info("Inserted %s with the published text (the row was missing)", key)
        elif current == text:
            log.info("Left %s alone: it already holds the published text", key)
        elif any(phrase in current for phrase in template_phrases):
            bind.execute(SET_VALUE, {"key": key, "value": text, "was": current})
            log.info("Replaced the generic template in %s with the published text", key)
        else:
            log.info("Left %s alone: it holds its own wording, not the generic template", key)


def downgrade() -> None:
    bind = op.get_bind()
    for key, (text, template, _template_phrases) in TEXTS.items():
        restored = bind.execute(SET_VALUE, {"key": key, "value": template, "was": text}).rowcount
        if restored:
            log.info("Put the generic template back in %s", key)
        else:
            log.info("Left %s alone: it does not hold the published text", key)
