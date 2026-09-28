from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base

# What a link does. The column holds one of these two words.
VERIFY_ACCOUNT_PURPOSE = "verify_account"
RESET_PASSWORD_PURPOSE = "reset_password"


class AuthLinkToken(Base):
    """
    One emailed link: the verification link sent at sign-up (or resent) and the
    password-reset link. Kept in the database, not the backend process's
    memory, so a restart or a deploy no longer voids every open link.

    Only the sha256 of the link's token is stored; the token itself exists in
    the email alone. A link works once: used_at is set in the same transaction
    that verifies the account or changes the password
    (services/auth.py _use_link_token), and never again after expires_at.

    created_at/updated_at come from Base (which maps them onto every model).
    """

    __tablename__ = "auth_link_tokens"
    __table_args__ = (
        CheckConstraint(
            f"purpose IN ('{VERIFY_ACCOUNT_PURPOSE}', '{RESET_PASSWORD_PURPOSE}')",
            name="ck_auth_link_tokens_purpose",
        ),
        UniqueConstraint("token_hash", name="uq_auth_link_tokens_token_hash"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    purpose: Mapped[str] = mapped_column(String(24), nullable=False)
    # hex sha256 of the token in the link.
    token_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    # Set when the link is used; a link with a used_at is refused.
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
