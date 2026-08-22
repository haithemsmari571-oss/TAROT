"""Owner-managed audio content for the public Sanctuary library."""

from datetime import datetime

from sqlalchemy import Boolean, CheckConstraint, DateTime, Float, Index, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class LibraryItem(Base):
    __tablename__ = "library_items"
    __table_args__ = (
        CheckConstraint(
            "duration_seconds > 0",
            name="ck_library_items_duration_positive",
        ),
        CheckConstraint(
            "(cover_image_path IS NULL AND cover_content_type IS NULL AND cover_size_bytes IS NULL) "
            "OR (cover_image_path IS NOT NULL AND cover_content_type IS NOT NULL "
            "AND cover_size_bytes IS NOT NULL)",
            name="ck_library_items_cover_metadata_paired",
        ),
        Index(
            "ix_library_items_public_sort",
            "enabled",
            "published_at",
            "sort_order",
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    # Stable public slug. It is generated at creation and is never editable.
    key: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    # Deliberately open text. New content types require no code or schema change.
    type: Mapped[str] = mapped_column(String(80), nullable=False)
    title: Mapped[str] = mapped_column(String(100), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    audio_file_path: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    audio_content_type: Mapped[str] = mapped_column(String(32), nullable=False)
    audio_size_bytes: Mapped[int] = mapped_column(Integer, nullable=False)
    audio_sha256: Mapped[str] = mapped_column(String(64), nullable=False)
    duration_seconds: Mapped[float] = mapped_column(Float, nullable=False)

    cover_image_path: Mapped[str | None] = mapped_column(String(255), unique=True, nullable=True)
    cover_content_type: Mapped[str | None] = mapped_column(String(32), nullable=True)
    cover_size_bytes: Mapped[int | None] = mapped_column(Integer, nullable=True)

    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default="true")
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    original_filename: Mapped[str | None] = mapped_column(String(255), nullable=True)
