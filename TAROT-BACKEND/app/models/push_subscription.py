from datetime import datetime
from typing import Optional

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base

# Which app a browser subscribed from: the client app under /app, or the
# owner's phone admin under /owner (services/web_push.py).
PUSH_APP_CLIENT = "client"
PUSH_APP_OWNER = "owner"
PUSH_APPS = (PUSH_APP_CLIENT, PUSH_APP_OWNER)
PUSH_APP_CHECK = "app IN ({})".format(", ".join(f"'{app}'" for app in PUSH_APPS))


class PushSubscription(Base):
    """One browser's Web Push subscription (ROUND57).

    The browser's own PushSubscription: the push service address it gave, and
    the two keys the payload is encrypted to. Unique on the address, so the same
    browser subscribing again, or for another account, updates its one row.
    Deleted with the account, when she turns notifications off, and when the
    push service answers 404 or 410 for it.
    """

    __tablename__ = "push_subscriptions"
    __table_args__ = (
        CheckConstraint(PUSH_APP_CHECK, name="ck_push_subscriptions_app"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    endpoint: Mapped[str] = mapped_column(Text, unique=True, nullable=False)
    # The browser's P-256 public key and auth secret, base64url as it sends them.
    p256dh: Mapped[str] = mapped_column(String(255), nullable=False)
    auth: Mapped[str] = mapped_column(String(255), nullable=False)
    app: Mapped[str] = mapped_column(String(16), nullable=False)
    user_agent: Mapped[Optional[str]] = mapped_column(String(512), nullable=True)
    # created_at and updated_at come from the shared Base (models/base.py).
    # The last time the push service accepted a notification for it.
    last_used_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
