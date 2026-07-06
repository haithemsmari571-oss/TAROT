from datetime import date, datetime
from typing import Optional

from sqlalchemy import JSON, Date, DateTime, Integer, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class ContentGenerationRun(Base):
    """Audit record of one nightly (or manual) content-generation run — powers
    the admin "Nightly job" panel: when it ran, success/fail per sign, and cost.
    """

    __tablename__ = "content_generation_runs"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    # The date the content was generated FOR (tomorrow, for the nightly job).
    content_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    trigger: Mapped[str] = mapped_column(String(16), nullable=False)  # scheduled|manual

    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    finished_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    # RUNNING | SUCCESS | PARTIAL | FAILED
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="RUNNING")

    signs_ok: Mapped[Optional[list]] = mapped_column(JSON, nullable=True)
    signs_failed: Mapped[Optional[list]] = mapped_column(JSON, nullable=True)

    input_tokens: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    output_tokens: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    cost_usd: Mapped[float] = mapped_column(
        Numeric(10, 4, asdecimal=False), nullable=False, default=0
    )
