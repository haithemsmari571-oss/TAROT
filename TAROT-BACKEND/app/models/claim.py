from datetime import datetime
from typing import Optional

from sqlalchemy import JSON, DateTime, Enum, ForeignKey, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.enums.claim_status import ClaimStatus
from app.models.base import Base


class Claim(Base):
    """A single task completion — the backbone of the whole reward system.

    Section 6: "Every task completion creates a claim record." Auto tasks are
    created and approved in the same server action; manual tasks are created
    PENDING for the admin queue. Approving reads the reward from the Task record
    at that moment and credits earned Stardust.

    ``idempotency_key`` guards auto tasks against a system event firing twice
    (same principle as the Stripe webhook). ``reward_amount`` is the amount
    actually credited, snapshotted from the task at approval time so the ledger
    stays truthful even if the task is re-priced afterwards.
    """

    __tablename__ = "claims"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id"), nullable=False, index=True
    )
    task_id: Mapped[int] = mapped_column(
        ForeignKey("tasks.id"), nullable=False, index=True
    )

    status: Mapped[ClaimStatus] = mapped_column(
        Enum(ClaimStatus, name="claimstatus"),
        nullable=False,
        default=ClaimStatus.PENDING,
    )

    # Optional evidence for manual tasks. ``evidence_path`` holds the FIRST image
    # (kept for the single-thumbnail view + cleanup); ``evidence_paths`` holds all
    # of them (up to 4). ``message`` is the client's optional short note.
    evidence_path: Mapped[Optional[str]] = mapped_column(String(512), nullable=True)
    evidence_paths: Mapped[Optional[list]] = mapped_column(JSON, nullable=True)
    evidence_handle: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    message: Mapped[Optional[str]] = mapped_column(String(300), nullable=True)

    # Amount actually credited (read from the task at approval). Null while PENDING.
    reward_amount: Mapped[Optional[float]] = mapped_column(
        Numeric(10, 2, asdecimal=False), nullable=True
    )

    rejection_reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    approved_by: Mapped[Optional[int]] = mapped_column(
        ForeignKey("users.id"), nullable=True
    )
    resolved_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # The EARN ledger row created when this claim was approved/credited.
    transaction_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("transactions.id"), nullable=True
    )
    # Dedupe key for auto tasks so one system event can't create two paid claims.
    idempotency_key: Mapped[Optional[str]] = mapped_column(
        String(255), unique=True, nullable=True
    )

    user: Mapped["User"] = relationship(
        "User", foreign_keys=[user_id], back_populates="claims"
    )
    task: Mapped["Task"] = relationship("Task", back_populates="claims")
