from datetime import datetime

from sqlalchemy import DateTime, Integer, Numeric, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class PsychicOnboardingDraft(Base):
    """A staged, not-yet-created psychic from a bulk-onboarding batch.

    Bulk onboarding is create-first-then-review: an uploaded manifest + image
    files are parsed into these rows, the operator reviews/edits them, and only
    an explicit confirm turns the non-error rows into real PSYCHIC accounts.
    Nothing here touches the live users table until confirm.
    """

    __tablename__ = "psychic_onboarding_drafts"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    batch_id: Mapped[str] = mapped_column(index=True)
    row_index: Mapped[int] = mapped_column(Integer)

    # status: pending (ready to create) | error (needs a fix first) |
    #         created (a real psychic was made) | skipped
    status: Mapped[str] = mapped_column(default="pending")
    error_reason: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Operator-provided fields (editable in review).
    display_name: Mapped[str | None] = mapped_column(nullable=True)
    price_per_minute: Mapped[float | None] = mapped_column(
        Numeric(10, 2, asdecimal=False), nullable=True
    )
    bio: Mapped[str | None] = mapped_column(Text, nullable=True)
    categories_csv: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Generated (or manifest-overridden) account identifiers, shown in review.
    username: Mapped[str | None] = mapped_column(nullable=True)
    email: Mapped[str | None] = mapped_column(nullable=True)

    # The image: original name from the manifest + the media path once saved.
    image_filename: Mapped[str | None] = mapped_column(nullable=True)
    profile_picture_path: Mapped[str | None] = mapped_column(nullable=True)

    created_user_id: Mapped[int | None] = mapped_column(Integer, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
