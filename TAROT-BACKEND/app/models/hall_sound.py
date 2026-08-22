"""The ambient loops a customer can choose on the entry form and in the room.

Uploaded by the owner in Vulcan, served from MEDIA_DIR like the reader
photographs. "Silence" is built into the site and is never a row here.
"""

from sqlalchemy import Boolean, CheckConstraint, Float, Index, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class HallSound(Base):
    __tablename__ = "hall_sounds"
    __table_args__ = (
        CheckConstraint("level >= 0 AND level <= 1", name="ck_hall_sounds_level_0_1"),
        CheckConstraint("duration_seconds > 0", name="ck_hall_sounds_duration_positive"),
        Index("ix_hall_sounds_enabled_sort", "enabled", "sort_order"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    # Stable slug the site stores in sessionStorage to carry a customer's choice
    # from the entry form into the room. Set once at upload; never edited.
    key: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(80), nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default="true")
    # File name inside MEDIA_DIR (never an absolute path): unguessable, non-colliding.
    file_path: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    content_type: Mapped[str] = mapped_column(String(32), nullable=False)
    size_bytes: Mapped[int] = mapped_column(Integer, nullable=False)
    sha256: Mapped[str] = mapped_column(String(64), nullable=False)
    duration_seconds: Mapped[float] = mapped_column(Float, nullable=False)
    # Per-file trim, 0..1, so a loud loop can be brought down without re-exporting.
    level: Mapped[float] = mapped_column(Float, nullable=False, default=1.0, server_default="1.0")
    # What the owner exported it as — the stored name above is deliberately
    # meaningless, so this is how he recognises a loop in the admin list.
    original_filename: Mapped[str | None] = mapped_column(String(255), nullable=True)
