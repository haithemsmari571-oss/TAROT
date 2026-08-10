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
from app.logging_config import get_logger

settings = get_app_settings()
logger = get_logger(__name__)


class EmailSchema(BaseModel):
    email: List[NameEmail]


conf = ConnectionConfig(
    MAIL_USERNAME=settings.MAIL_USERNAME,
    MAIL_PASSWORD=settings.MAIL_PASSWORD,
    MAIL_FROM=settings.MAIL_FROM,
    MAIL_SERVER=settings.MAIL_SERVER,
    MAIL_PORT=settings.MAIL_PORT,
    MAIL_STARTTLS=settings.MAIL_STARTTLS,
    MAIL_SSL_TLS=settings.MAIL_SSL_TLS,
    USE_CREDENTIALS=settings.MAIL_USE_CREDENTIALS,
    VALIDATE_CERTS=settings.MAIL_VALIDATE_CERTS,
    MAIL_DEBUG=settings.MAIL_DEBUG,
)

app = FastAPI()


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
    <p>If you did not request a password reset, you can safely ignore this email. This link will expire in 5 minutes.</p>
    <p>Thanks,<br>The Support Team</p>
    <div class="footer">
      &copy; 2026 Your Company. All rights reserved.
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
    <p>Thanks,<br>The Support Team</p>
    <div class="footer">
      &copy; 2026 Your Company. All rights reserved.
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
      &copy; 2026 AskValentina. Automated notification.
    </div>
  </div>
</body>
</html>
""",
}


@app.post("/email")
async def send_email(
    recepientEmail: List[NameEmail], template_key: str, vars: dict
) -> bool:
    try:
        template = templates.get(template_key)
        if not template:
            logger.error(
                "email_template_not_found",
                template_key=template_key,
            )
            raise TemplateNotFound()

        mail_body = _fill_body_variables(template, vars)

        email_subjects = {
            MailTemplateKey.FORGOT_PASSWORD.value: "Reset your password",
            MailTemplateKey.VERIFY_ACCOUNT.value: "Verify your AskValentina account",
            MailTemplateKey.LIFETIME_ACCESS.value: (
                "⚡ Lifetime Access purchased — manual fulfilment needed"
            ),
        }
        subject = email_subjects.get(template_key, "AskValentina Notification")

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
        logger.error(
            "email_send_failed",
            template_key=template_key,
            recipient_count=len(recepientEmail) if recepientEmail else 0,
            error=str(e),
            error_type=e.__class__.__name__,
            exc_info=True,
        )
        raise


def _fill_body_variables(template: str, vars: dict):
    template_filled = template

    for key, value in vars.items():
        placeholder = f"{{{{{key}}}}}"
        template_filled = template_filled.replace(placeholder, str(value))

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
