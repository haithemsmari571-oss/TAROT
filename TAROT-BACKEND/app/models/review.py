from sqlalchemy import ForeignKey, CheckConstraint, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base

# The owner's word on a review (routers/reviews.py, admin_router). A new or
# edited review is pending; only an approved one reaches a public page.
REVIEW_PENDING = "pending"
REVIEW_APPROVED = "approved"
REVIEW_HIDDEN = "hidden"
REVIEW_STATUSES = (REVIEW_PENDING, REVIEW_APPROVED, REVIEW_HIDDEN)


class Review(Base):
    __tablename__ = "reviews"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    # Indexed: the reader's page lists and sums her reviews by psychic_id
    # (ix_reviews_psychic_id, migration 1ff3c66c2a5d).
    psychic_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    rating: Mapped[int]  # 1-5 stars
    comment: Mapped[str] = mapped_column(nullable=True)
    status: Mapped[str] = mapped_column(
        String(16), default=REVIEW_PENDING, server_default=REVIEW_PENDING, nullable=False
    )

    # Relationships
    user: Mapped["User"] = relationship(
        "User",
        foreign_keys=[user_id],
        back_populates="reviews_given",
    )

    psychic: Mapped["User"] = relationship(
        "User",
        foreign_keys=[psychic_id],
        back_populates="reviews_received",
    )

    __table_args__ = (
        CheckConstraint("rating >= 1 AND rating <= 5", name="check_rating_range"),
        CheckConstraint(
            "status IN (" + ", ".join(f"'{status}'" for status in REVIEW_STATUSES) + ")",
            name="check_review_status",
        ),
        # Ensure a user can only review a psychic once
        UniqueConstraint("user_id", "psychic_id", name="unique_user_psychic_review"),
    )
