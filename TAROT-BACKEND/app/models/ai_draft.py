from typing import Optional

from sqlalchemy import Enum, ForeignKey, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.enums.ai_draft_status import AiDraftStatus
from app.enums.response_mode import ResponseMode
from app.models.base import Base


class AiDraft(Base):
    """A Valentina draft that needs a human decision before it reaches the client.

    Created in hybrid mode (always) and in sabri mode when Sabri still fails
    after the retry cap. The admin panel reads PENDING rows, shows the editable
    draft plus Sabri's flags, and sends or discards it. Durable (survives a
    reconnect/restart) so a draft is never lost between the pipeline and the panel.
    """

    __tablename__ = "ai_drafts"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    chat_id: Mapped[int] = mapped_column(ForeignKey("chats.id"), index=True)
    # The client message this draft is replying to (nullable — kept for context).
    client_message_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("messages.id"), nullable=True
    )
    # The mode that produced this draft (HYBRID or SABRI-fallback).
    mode: Mapped[ResponseMode] = mapped_column(Enum(ResponseMode))
    draft_text: Mapped[str] = mapped_column(Text)
    # Sabri's flags as a plain JSON string (list of short reasons); empty when it
    # passed (hybrid still routes a passing draft here for review).
    sabri_flags: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    # Whether Sabri passed the draft (hybrid surfaces both; sabri-fallback is
    # always a fail).
    sabri_passed: Mapped[bool] = mapped_column(default=False)
    # How many Valentina→Sabri attempts were spent.
    attempts: Mapped[int] = mapped_column(default=1)
    status: Mapped[AiDraftStatus] = mapped_column(
        Enum(AiDraftStatus), default=AiDraftStatus.PENDING, index=True
    )

    chat: Mapped["Chat"] = relationship("Chat", foreign_keys=[chat_id])
