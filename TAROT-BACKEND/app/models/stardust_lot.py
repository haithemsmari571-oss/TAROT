from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base


class StardustLot(Base):
    """One batch of EARNED Stardust with its own 30-day expiry clock.

    Earned Stardust (from gamification tasks/claims) is deliberately NOT stored
    as a single scalar on the user, because each award expires 30 days after it
    is credited (Section 2, rule 2) and can only ever cover 50% of an order
    (rule 1). Tracking each award as a lot lets us:

      * expire each award independently on its own clock,
      * show "earned expiring soon" in the balance breakdown,
      * spend the soonest-to-expire lot first (FIFO by expiry).

    Purchased Stardust (``users.balance``) and legacy free credit
    (``users.credit_balance``) are unaffected — they have no expiry and no
    redemption cap. Money is stored to 2 dp as float (``asdecimal=False``) to
    match the rest of the ledger.
    """

    __tablename__ = "stardust_lots"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id"), nullable=False, index=True
    )

    # Original amount awarded, and how much of it is still unspent+unexpired.
    amount: Mapped[float] = mapped_column(
        Numeric(10, 2, asdecimal=False), nullable=False
    )
    remaining: Mapped[float] = mapped_column(
        Numeric(10, 2, asdecimal=False), nullable=False
    )

    # Where this Stardust came from, for the ledger/audit trail
    # (e.g. "claim:42", "task:daily_pull", "admin_gift").
    source: Mapped[str] = mapped_column(String(255), nullable=True)

    credited_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, index=True
    )
    # credited_at + 30 days. The lot is dead once now >= expires_at.
    expires_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, index=True
    )
    # Set True by the expiry sweep once any leftover was forfeited, so we never
    # double-write an EXPIRE ledger row for the same lot.
    is_expired: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false"
    )

    # The EARN ledger row that created this lot (for cross-referencing).
    transaction_id: Mapped[int] = mapped_column(
        ForeignKey("transactions.id"), nullable=True
    )

    user: Mapped["User"] = relationship("User", back_populates="stardust_lots")
