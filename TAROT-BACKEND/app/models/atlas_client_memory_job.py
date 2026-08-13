from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, Float, ForeignKey, Index, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class AtlasClientMemoryJob(Base):
    __tablename__ = "atlas_client_memory_jobs"
    __table_args__ = (
        CheckConstraint(
            "status IN ('PENDING', 'PROCESSING', 'RETRY_PENDING', 'COMPLETED', 'FAILED')",
            name="ck_atlas_memory_job_status",
        ),
        CheckConstraint("attempts >= 0 AND attempts <= 2", name="ck_atlas_memory_job_attempts"),
        CheckConstraint(
            "recovery_cycles >= 0 AND recovery_cycles <= 3",
            name="ck_atlas_memory_job_recovery_cycles",
        ),
        Index(
            "ix_atlas_memory_jobs_sweep",
            "status",
            "processing_started_at",
            "created_at",
        ),
        Index(
            "ix_atlas_memory_jobs_failed_retry",
            "status",
            "next_retry_at",
            "recovery_cycles",
        ),
    )

    chat_session_id: Mapped[int] = mapped_column(
        ForeignKey("chat_sessions.id", ondelete="CASCADE"), primary_key=True
    )
    status: Mapped[str] = mapped_column(String(24), nullable=False, default="PENDING")
    attempts: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    recovery_cycles: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    next_retry_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    processing_started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_error_code: Mapped[str | None] = mapped_column(String(120), nullable=True)
    atlas_version_number: Mapped[int | None] = mapped_column(Integer, nullable=True)
    input_tokens: Mapped[int | None] = mapped_column(Integer, nullable=True)
    output_tokens: Mapped[int | None] = mapped_column(Integer, nullable=True)
    cost_usd: Mapped[float | None] = mapped_column(Float, nullable=True)
