"""When a client must have confirmed her email (owner decision EmailConfirm=A).

A new client signs in and uses the app before she confirms her email. The
confirmation is asked for at two points only, and the server enforces both, so
calling the API directly does not get round them:

- her second message, in any thread: the first is allowed, and each one after
  it waits for the confirmation (per_message_billing.charge_client_message);
- her first top-up, the start of a Stripe checkout (routers/payments.py).

Both refusals carry the one reason EMAIL_NOT_CONFIRMED, which the app turns
into its "Confirm your email to keep going" sheet with a Resend email action.
"""

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models.message import Message
from app.models.user import User

EMAIL_NOT_CONFIRMED = "EMAIL_NOT_CONFIRMED"
# How many messages a client may send before she confirms her email.
UNCONFIRMED_MESSAGE_ALLOWANCE = 1


def messages_sent_before(db: Session, client: User, message: Message | None = None) -> int:
    """How many messages the client has sent, in every thread, not counting
    ``message``: the row a charge is about to pay for, which the callers have
    already flushed."""
    query = db.query(Message).filter(
        Message.sender_id == client.id,
        Message.is_system.is_(False),
    )
    if message is not None and message.id is not None:
        query = query.filter(Message.id != message.id)
    return query.count()


def message_needs_confirmed_email(db: Session, client: User, message: Message | None = None) -> bool:
    """True when this message must wait until the client confirms her email."""
    if client.is_verified:
        return False
    return messages_sent_before(db, client, message) >= UNCONFIRMED_MESSAGE_ALLOWANCE


def require_confirmed_email_for_top_up(user: User) -> None:
    """Refuses a checkout start, before Stripe is called, until the account's
    email is confirmed. A client cannot have topped up before, because this
    refusal stands in front of her first top-up."""
    if not user.is_verified:
        raise HTTPException(status_code=403, detail=EMAIL_NOT_CONFIRMED)
