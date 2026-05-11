from sqlalchemy import ForeignKey, CheckConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base


class Review(Base):
    __tablename__ = "reviews"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    psychic_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    rating: Mapped[int]  # 1-5 stars
    comment: Mapped[str] = mapped_column(nullable=True)

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
        # Ensure a user can only review a psychic once
        # UniqueConstraint("user_id", "psychic_id", name="unique_user_psychic_review"),
    )
