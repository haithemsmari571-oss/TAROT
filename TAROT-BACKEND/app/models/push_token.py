from sqlalchemy import DateTime, ForeignKey, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base


class PushToken(Base):
    """
    An Expo push token for one of a user's devices.

    A user can have several (phone + tablet, or a device that changed hands),
    and a device can change accounts — registration upserts by token and
    reassigns it to the signing-in user. Tokens Expo reports as
    DeviceNotRegistered are deleted on send.
    """

    __tablename__ = "push_tokens"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id"), index=True, nullable=False
    )
    # Expo push token, e.g. "ExponentPushToken[xxxxxxxxxxxx]". Unique: one row
    # per device, reassigned to whichever account is signed in on it.
    token: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    # "ios" | "android" — informational only.
    platform: Mapped[str] = mapped_column(String(16), nullable=True)
    created_at: Mapped[str] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[str] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    user: Mapped["User"] = relationship("User", foreign_keys=[user_id])
