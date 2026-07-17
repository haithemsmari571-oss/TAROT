from typing import Optional

from sqlalchemy import Boolean, ForeignKey, Integer, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class ReadingDraftAttempt(Base):
    """Append-only audit log of the reading pipeline's INTERMEDIATE work, so a human can
    later review what actually happened during a reading — not just the delivered bubbles.

    One row per generation attempt; rows are NEVER overwritten (unlike the Phase-1
    reading_session_states snapshot, which is keyed by chat_id). ``stage`` distinguishes
    the artifacts a turn produces:
      * two_role      -> "valentina_draft" (her raw draft) + "sabri_delivery" (curated,
                         with any advisory notes; is_delivered on the version sent)
      * single_agent  -> "reader_output"  (raw output before hold-splitting; notes = holds)
    ``notes`` holds correction/advisory notes or fired hold-triggers as JSON text when
    applicable. This is a backend audit log; the live review screen belongs with the
    cockpit redesign (see ADMIN_DIAGNOSIS.md) and is NOT built here.
    """

    __tablename__ = "reading_draft_attempts"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    chat_id: Mapped[int] = mapped_column(ForeignKey("chats.id"), index=True)
    turn_number: Mapped[int] = mapped_column(Integer, nullable=False)
    attempt_number: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    engine: Mapped[str] = mapped_column(Text, nullable=False)  # "two_role" | "single_agent"
    stage: Mapped[str] = mapped_column(Text, nullable=False)   # valentina_draft|sabri_delivery|reader_output
    raw_content: Mapped[str] = mapped_column(Text, nullable=False)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)  # correction/advisory notes or holds (JSON)
    is_delivered: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    # created_at / updated_at come from Base (the row's timestamp).
