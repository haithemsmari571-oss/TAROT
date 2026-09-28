import html
import re
from typing import List

from fastapi import FastAPI
from fastapi_mail import (
    ConnectionConfig,
    FastMail,
    MessageSchema,
    MessageType,
    NameEmail,
)
from pydantic import BaseModel

from app.config import get_app_settings
from app.enums.email_template_key import MailTemplateKey
from app.exceptions.email import TemplateNotFound, TemplateVariabelNotFilled
from app.logging_config import error_fields, get_logger

settings = get_app_settings()
logger = get_logger(__name__)

# Who every email is from, on the MAIL_FROM address, and how the client emails
# sign off ({{brand}} in the templates, filled by send_email).
BRAND_NAME = "Ask Valentina"

# Who runs the site, in the owner's words (ROUND39), at the foot of every
# client email ({{company_identity}} and {{company_contact}}, filled by
# send_email), as the site's footer shows them (tarot-landing-web
# src/lib/company.ts holds the same words for the site).
COMPANY_IDENTITY = (
    f"{BRAND_NAME} is a trading name of Numinous Holdings Ltd, a company "
    "registered in England and Wales (company number 17151844)."
)
REGISTERED_OFFICE = "66 Paul Street, London, EC2A 4NA"
SUPPORT_EMAIL = "support@askvalentina.co.uk"
COMPANY_CONTACT = f"Registered office: {REGISTERED_OFFICE} · Contact: {SUPPORT_EMAIL}"


class EmailSchema(BaseModel):
    email: List[NameEmail]


conf = ConnectionConfig(
    MAIL_USERNAME=settings.MAIL_USERNAME,
    MAIL_PASSWORD=settings.MAIL_PASSWORD,
    MAIL_FROM=settings.MAIL_FROM,
    MAIL_FROM_NAME=BRAND_NAME,
    MAIL_SERVER=settings.MAIL_SERVER,
    MAIL_PORT=settings.MAIL_PORT,
    MAIL_STARTTLS=settings.MAIL_STARTTLS,
    MAIL_SSL_TLS=settings.MAIL_SSL_TLS,
    USE_CREDENTIALS=settings.MAIL_USE_CREDENTIALS,
    VALIDATE_CERTS=settings.MAIL_VALIDATE_CERTS,
    MAIL_DEBUG=settings.MAIL_DEBUG,
)

app = FastAPI()


# A reader replied, or a message was refunded (services/reply_emails.py): one
# line, which is also the subject, and the way into the conversation. No reply
# text, ever. {{line}} arrives HTML-escaped.
_CONVERSATION_EMAIL = """
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>{{brand}}</title>
  <style>
    body {
      font-family: Arial, sans-serif;
      line-height: 1.6;
      color: #333333;
      background-color: #f9f9f9;
      padding: 20px;
    }
    .container {
      max-width: 600px;
      margin: 0 auto;
      background-color: #ffffff;
      padding: 30px;
      border-radius: 8px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
    }
    h2 {
      color: #2c3e50;
    }
    a.button {
      display: inline-block;
      padding: 12px 20px;
      margin: 20px 0;
      font-weight: bold;
      color: #ffffff;
      background-color: #007BFF;
      text-decoration: none;
      border-radius: 5px;
    }
    a.button:hover {
      background-color: #0056b3;
    }
    .footer {
      font-size: 12px;
      color: #888888;
      margin-top: 20px;
    }
    .footer a {
      color: #888888;
    }
  </style>
</head>
<body>
  <div class="container">
    <h2>{{line}}</h2>
    <p>
      <a href="{{chat_link}}" target="_blank" class="button">Open the chat</a>
    </p>
    <div class="footer">
      <p><a href="{{you_link}}" target="_blank">Turn these emails off</a> in the app, under You.</p>
      &copy; 2026 {{brand}}. All rights reserved.
      <p>{{company_identity}}<br>{{company_contact}}</p>
    </div>
  </div>
</body>
</html>
"""


templates = {
    MailTemplateKey.FORGOT_PASSWORD.value: """
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Password Reset</title>
  <style>
    body {
      font-family: Arial, sans-serif;
      line-height: 1.6;
      color: #333333;
      background-color: #f9f9f9;
      padding: 20px;
    }
    .container {
      max-width: 600px;
      margin: 0 auto;
      background-color: #ffffff;
      padding: 30px;
      border-radius: 8px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
    }
    h2 {
      color: #2c3e50;
    }
    a.button {
      display: inline-block;
      padding: 12px 20px;
      margin: 20px 0;
      font-weight: bold;
      color: #ffffff;
      background-color: #007BFF;
      text-decoration: none;
      border-radius: 5px;
    }
    a.button:hover {
      background-color: #0056b3;
    }
    p {
      margin: 15px 0;
    }
    .footer {
      font-size: 12px;
      color: #888888;
      margin-top: 20px;
    }
  </style>
</head>
<body>
  <div class="container">
    <h2>Password Reset Request</h2>
    <p>Hi {{username}},</p>
    <p>We received a request to reset your password. Click the button below to reset it:</p>
    <p>
      <a href="{{reset_link}}" target="_blank" class="button">Reset Password</a>
    </p>
    <p>If you did not request a password reset, you can safely ignore this email. This link will expire in {{link_minutes}} minutes.</p>
    <p>Thanks,<br>{{brand}}</p>
    <div class="footer">
      &copy; 2026 {{brand}}. All rights reserved.
      <p>{{company_identity}}<br>{{company_contact}}</p>
    </div>
  </div>
</body>
</html>
""",
    MailTemplateKey.VERIFY_ACCOUNT.value: """
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Verify Your Account</title>
  <style>
    body {
      font-family: Arial, sans-serif;
      line-height: 1.6;
      color: #333333;
      background-color: #f9f9f9;
      padding: 20px;
    }
    .container {
      max-width: 600px;
      margin: 0 auto;
      background-color: #ffffff;
      padding: 30px;
      border-radius: 8px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
    }
    h2 {
      color: #2c3e50;
    }
    a.button {
      display: inline-block;
      padding: 12px 20px;
      margin: 20px 0;
      font-weight: bold;
      color: #ffffff;
      background-color: #28a745;
      text-decoration: none;
      border-radius: 5px;
    }
    a.button:hover {
      background-color: #1e7e34;
    }
    p {
      margin: 15px 0;
    }
    .footer {
      font-size: 12px;
      color: #888888;
      margin-top: 20px;
    }
  </style>
</head>
<body>
  <div class="container">
    <h2>Verify Your Account</h2>
    <p>Hi {{username}},</p>
    <p>Welcome! Please verify your email to activate your account.</p>
    <p>
      <a href="{{verify_link}}" target="_blank" class="button">Verify Account</a>
    </p>
    <p>If you didn’t create this account, you can ignore this email.</p>
    <p>Thanks,<br>{{brand}}</p>
    <div class="footer">
      &copy; 2026 {{brand}}. All rights reserved.
      <p>{{company_identity}}<br>{{company_contact}}</p>
    </div>
  </div>
</body>
</html>
""",
    MailTemplateKey.LIFETIME_ACCESS.value: """
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Lifetime Access — Manual Fulfilment Needed</title>
  <style>
    body {
      font-family: Arial, sans-serif;
      line-height: 1.6;
      color: #333333;
      background-color: #f9f9f9;
      padding: 20px;
    }
    .container {
      max-width: 600px;
      margin: 0 auto;
      background-color: #ffffff;
      padding: 30px;
      border-radius: 8px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
    }
    h2 { color: #8A5A00; }
    .flag {
      display: inline-block;
      padding: 6px 12px;
      margin-bottom: 10px;
      font-weight: bold;
      color: #ffffff;
      background-color: #F2AE40;
      border-radius: 5px;
    }
    table { border-collapse: collapse; width: 100%; margin: 16px 0; }
    td { padding: 8px 10px; border-bottom: 1px solid #eee; font-size: 14px; }
    td.k { color: #888; width: 40%; }
    .footer { font-size: 12px; color: #888888; margin-top: 20px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="flag">⚡ MANUAL FULFILMENT NEEDED</div>
    <h2>Lifetime Access purchased</h2>
    <p>A client just paid for <strong>Lifetime Access</strong>. This is not
    tracked automatically — please grant their access manually.</p>
    <table>
      <tr><td class="k">User</td><td>{{username}} (ID {{user_id}})</td></tr>
      <tr><td class="k">Email</td><td>{{user_email}}</td></tr>
      <tr><td class="k">Amount paid</td><td>${{amount_usd}} USD</td></tr>
      <tr><td class="k">Stripe session</td><td>{{stripe_session_id}}</td></tr>
      <tr><td class="k">Entitlement</td><td>{{entitlement}}</td></tr>
    </table>
    <p>Transaction record: #{{transaction_id}} (also flagged in the admin order list).</p>
    <div class="footer">
      &copy; 2026 {{brand}}. Automated notification.
    </div>
  </div>
</body>
</html>
""",
    MailTemplateKey.READER_REPLIED.value: _CONVERSATION_EMAIL,
    MailTemplateKey.MESSAGE_REFUNDED.value: _CONVERSATION_EMAIL,
}


@app.post("/email")
async def send_email(
    recepientEmail: List[NameEmail], template_key: str, vars: dict,
    subject: str | None = None,
) -> bool:
    """subject, when given, is the email's own (the reader's name is in it);
    otherwise the template's fixed one below."""
    try:
        template = templates.get(template_key)
        if not template:
            logger.error(
                "email_template_not_found",
                template_key=template_key,
            )
            raise TemplateNotFound()

        mail_body = _fill_body_variables(template, {
            **vars,
            "brand": BRAND_NAME,
            "company_identity": COMPANY_IDENTITY,
            "company_contact": COMPANY_CONTACT,
        })

        email_subjects = {
            MailTemplateKey.FORGOT_PASSWORD.value: "Reset your password",
            MailTemplateKey.VERIFY_ACCOUNT.value: f"Verify your {BRAND_NAME} account",
            MailTemplateKey.LIFETIME_ACCESS.value: (
                "⚡ Lifetime Access purchased — manual fulfilment needed"
            ),
        }
        subject = subject or email_subjects.get(template_key, f"{BRAND_NAME} Notification")

        message = MessageSchema(
            subject=subject,
            recipients=recepientEmail,
            body=mail_body,
            subtype=MessageType.html,
        )

        logger.debug(
            "sending_email",
            template_key=template_key,
            recipient_count=len(recepientEmail),
        )

        fm = FastMail(conf)
        logger.info("email_send_start", template=template_key)

        await fm.send_message(message)

        logger.info("email_send_done", template=template_key)

        logger.info(
            "email_sent_successfully",
            template_key=template_key,
            recipient_count=len(recepientEmail),
        )

        return True
    except (TemplateNotFound, TemplateVariabelNotFilled):
        raise
    except Exception as e:
        # No traceback: an SMTP refusal's text names the recipient's address.
        logger.error(
            "email_send_failed",
            template_key=template_key,
            recipient_count=len(recepientEmail) if recepientEmail else 0,
            **error_fields(e),
        )
        raise


def _fill_body_variables(template: str, vars: dict):
    template_filled = template

    for key, value in vars.items():
        placeholder = f"{{{{{key}}}}}"
        # Every value is HTML-escaped: these fill an HTML email, and some come
        # from the account (username, email). Without this a crafted username
        # injected markup into the verify/reset email and into the owner's
        # Lifetime Access notification. URLs and numbers escape harmlessly (only
        # "&" changes, which is correct inside an href).
        template_filled = template_filled.replace(placeholder, html.escape(str(value)))

    _validate_all_vars_are_filled(template_filled)

    return template_filled


def _validate_all_vars_are_filled(template_filled: str):
    pattern = r"\{\{[A-Za-z_][A-Za-z0-9_]*\}\}"
    unfilled_vars = re.findall(pattern, template_filled)
    if unfilled_vars:
        logger.error(
            "email_template_variables_not_filled",
            unfilled_variables=unfilled_vars,
        )
        raise TemplateVariabelNotFilled("Not all template variables were filled.")
