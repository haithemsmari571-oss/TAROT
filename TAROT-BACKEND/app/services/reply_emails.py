"""Emails about her conversation: a reader replied, or a message was refunded.

Nothing here runs per bubble. The offline-replies thread
(tasks/offline_reply_task.py), which runs only in per-message billing, calls,
after each pass:
- refund_email for each message the pass refunded at the end of its window
  (offline_replies.sweep): one email per refund.
- claim_reply_emails: each conversation where her reader wrote to her more than
  REPLY_EMAIL_DELAY ago and she has not opened it since, the inbox's own unread
  rule (services/client_inbox.py), unless she has already been emailed about it
  since she last opened it. Each is stamped (chats.client_reply_emailed_at) and
  committed before its email goes, so she gets at most one until she comes
  back; a failed send is logged and lost, never repeated.
Both go only to a client (role USER, ACTIVE) whose email address is confirmed
and whose switch is on (users.reply_emails). No email carries the reply's words.
"""

import re
from datetime import datetime, timedelta, timezone
from typing import NamedTuple

from fastapi_mail import NameEmail
from sqlalchemy import and_, exists, or_, select

from app.config import get_app_settings
from app.database.client import SessionLocal
from app.enums.author_type import AuthorType
from app.enums.email_template_key import MailTemplateKey
from app.enums.role import Role
from app.enums.transaction_type import TransactionType
from app.enums.user_status import UserStatus
from app.logging_config import get_logger
from app.models import Chat, Message, Transaction, User

logger = get_logger(__name__)

# The owner's "about 5 minutes": how long a reply waits unread before the email.
REPLY_EMAIL_DELAY = timedelta(minutes=5)
# A reply older than this when the sweep first sees it is never emailed, so a
# restart, or the first run after a deploy, does not send old news.
REPLY_EMAIL_LOOKBACK = timedelta(hours=1)

# The owner's words (ROUND15 section 4, choices 3A and 8A). Each is the
# email's subject and its one line.
REPLIED_LINE = "{reader} replied to you"
REFUNDED_LINE = "{reader} could not reply in time. Your {amount} is back."

# Where the email leads, in the app (clientAppPaths.ts CHATS_PATH and YOU_PATH).
CHAT_PATH = "/app/chats/{chat_id}"
YOU_PATH = "/app/you"


class Email(NamedTuple):
    template: MailTemplateKey
    chat_id: int
    user_id: int
    to_email: str
    to_name: str
    subject: str


def _now():
    return datetime.now(timezone.utc)


# A reader's name as clients see it, the app's rule (readerName.ts). Her username
# is her display name when it reads as one: words of letters (an apostrophe may
# join letters) with single spaces between them. Any other username
# (end_control_reader_fee70ab6, sophie-moon-2) has no display name in it, so she
# is named by its first name part. Never the raw username.
_NAME_WORD = r"[^\W\d_]+(?:['’][^\W\d_]+)*"
_DISPLAY_NAME = re.compile(rf"{_NAME_WORD}(?: {_NAME_WORD})*")
_FIRST_NAME_PART = re.compile(_NAME_WORD)


def reader_name(username):
    """In the app's Title case (readerName.ts): "Sophie";
    "end_control_reader_fee70ab6" -> "End"."""
    username = (username or "").strip()
    if _DISPLAY_NAME.fullmatch(username):
        name = username
    else:
        part = _FIRST_NAME_PART.search(username)
        name = part.group(0) if part else ""
    return name[:1].upper() + name[1:].lower()


def pounds(amount):
    """formatGbp's rule (lib/currency.ts): "£2.50", "£3", "£1,250.50"."""
    pence = round(float(amount) * 100)
    return f"£{pence / 100:,.2f}" if pence % 100 else f"£{pence // 100:,}"


def _app_link(path):
    return get_app_settings().FRONT_BASE_URL.rstrip("/") + path


def _may_email(client):
    return (client.role == Role.USER and client.status == UserStatus.ACTIVE
            and client.is_verified and client.reply_emails)


def _due(now):
    """A conversation she is owed a reply email about, as SQL on Chat joined to
    her User row."""
    unseen_reply = exists().where(
        Message.chat_id == Chat.id,
        Message.sender_id == Chat.psychic_id,
        Message.is_system.is_(False),
        Message.author_type != AuthorType.SYSTEM,  # the reader's free opener
        or_(Chat.client_last_opened_at.is_(None),
            Message.created_at > Chat.client_last_opened_at),
        Message.created_at <= now - REPLY_EMAIL_DELAY,
        Message.created_at > now - REPLY_EMAIL_LOOKBACK,
    )
    not_emailed_since_open = or_(
        Chat.client_reply_emailed_at.is_(None),
        and_(Chat.client_last_opened_at.is_not(None),
             Chat.client_reply_emailed_at < Chat.client_last_opened_at),
    )
    return (
        User.role == Role.USER,
        User.status == UserStatus.ACTIVE,
        User.is_verified.is_(True),
        User.reply_emails.is_(True),
        not_emailed_since_open,
        unseen_reply,
    )


def _claim(chat_id, now):
    with SessionLocal() as db:
        chat = (db.query(Chat).filter(Chat.id == chat_id)
                .with_for_update().populate_existing().one())
        # Again under the row lock: she may have opened it since, or another
        # process may have claimed it.
        still_due = db.scalar(
            select(Chat.id).join(User, User.id == Chat.user_id)
            .where(Chat.id == chat_id, *_due(now))
        )
        if still_due is None:
            db.rollback()
            return None
        chat.client_reply_emailed_at = now
        client = db.get(User, chat.user_id)
        reader = db.get(User, chat.psychic_id)
        email = Email(MailTemplateKey.READER_REPLIED, chat.id, client.id, client.email,
                      client.username, REPLIED_LINE.format(reader=reader_name(reader.username)))
        db.commit()
        return email


def claim_reply_emails(now=None):
    """The reply emails due now, each already stamped and committed."""
    now = now or _now()
    with SessionLocal() as db:
        chat_ids = db.scalars(
            select(Chat.id).join(User, User.id == Chat.user_id)
            .where(*_due(now)).order_by(Chat.id)
        ).all()
    emails = []
    for chat_id in chat_ids:
        try:
            email = _claim(chat_id, now)
        except Exception:  # noqa: BLE001 - one conversation never stops the rest
            logger.exception("reply_email_claim_failed", chat_id=chat_id)
            continue
        if email is not None:
            emails.append(email)
    return emails


def refund_email(message_id):
    """The email for a message refunded at the end of its window, or None when
    she is not to be emailed. The amount is the reversal's."""
    with SessionLocal() as db:
        reversal = db.query(Transaction).filter(
            Transaction.related_message_id == message_id,
            Transaction.transaction_type == TransactionType.REVERSAL,
        ).first()
        message = db.get(Message, message_id)
        if reversal is None or message is None:
            return None
        chat = db.get(Chat, message.chat_id)
        client = db.get(User, chat.user_id)
        if not _may_email(client):
            return None
        reader = db.get(User, chat.psychic_id)
        line = REFUNDED_LINE.format(reader=reader_name(reader.username), amount=pounds(reversal.amount))
        return Email(MailTemplateKey.MESSAGE_REFUNDED, chat.id, client.id, client.email,
                     client.username, line)


def email_pass(refunded, run):
    """After each pass of the offline-replies thread: one email per message the
    pass refunded, then the reply emails due. run(coroutine) sends one on the
    app's event loop. A failure is logged and stops nothing else."""
    emails = []
    for message_id in refunded:
        try:
            email = refund_email(message_id)
        except Exception:  # noqa: BLE001
            logger.exception("refund_email_failed", message_id=message_id)
            continue
        if email is not None:
            emails.append(email)
    try:
        emails += claim_reply_emails()
    except Exception:  # noqa: BLE001
        logger.exception("reply_email_pass_failed")
    for email in emails:
        try:
            run(send(email))
        except Exception:  # noqa: BLE001 - stamped already: lost, never sent twice
            logger.exception("reply_email_send_failed", kind=email.template.value,
                             chat_id=email.chat_id, user_id=email.user_id)
    return emails


async def send(email):
    from app.services.email import send_email

    await send_email(
        recepientEmail=[NameEmail(email=email.to_email, name=email.to_name)],
        template_key=email.template.value,
        vars={
            # send_email HTML-escapes every value now (email.py), so the line is
            # passed raw here — escaping it twice would show the entities.
            "line": email.subject,
            "chat_link": _app_link(CHAT_PATH.format(chat_id=email.chat_id)),
            "you_link": _app_link(YOU_PATH),
        },
        subject=email.subject,
    )
    logger.info("reply_email_sent", kind=email.template.value, chat_id=email.chat_id,
                user_id=email.user_id)
