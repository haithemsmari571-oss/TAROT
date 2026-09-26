import enum


class MailTemplateKey(enum.Enum):
    FORGOT_PASSWORD = "forgot_password"
    VERIFY_ACCOUNT = "verify_account"
    LIFETIME_ACCESS = "lifetime_access"
    # The two emails about her conversation (services/reply_emails.py).
    READER_REPLIED = "reader_replied"
    MESSAGE_REFUNDED = "message_refunded"
