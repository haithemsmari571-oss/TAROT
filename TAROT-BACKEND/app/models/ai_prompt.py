from datetime import datetime
from typing import List, Optional

from sqlalchemy import JSON, DateTime, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base


class AiPrompt(Base):
    """A registered AI prompt — the single source of truth for the WORDS of an
    AI feature. Platform rule: every AI prompt lives here and is admin-editable;
    none are hardcoded. Code owns the model, output parsing, retries and limits;
    the registry owns the prompt text.
    """

    __tablename__ = "ai_prompts"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    # Stable code key the feature fetches by (e.g. "daily_content").
    key: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    model: Mapped[str] = mapped_column(String(64), nullable=False)

    # Current (editable) text, and the shipped default kept permanently as a
    # known-good fallback the owner can always restore.
    prompt: Mapped[str] = mapped_column(Text, nullable=False)
    default_prompt: Mapped[str] = mapped_column(Text, nullable=False)

    # [{ "name": "zodiac_sign", "description": "..." }, ...] documented in the UI.
    variables: Mapped[Optional[list]] = mapped_column(JSON, nullable=True)

    status: Mapped[str] = mapped_column(
        String(16), nullable=False, default="ACTIVE", server_default="ACTIVE"
    )
    last_run_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    last_run_status: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)

    versions: Mapped[List["AiPromptVersion"]] = relationship(
        "AiPromptVersion",
        back_populates="prompt",
        cascade="all, delete-orphan",
        order_by="desc(AiPromptVersion.id)",
    )


class AiPromptVersion(Base):
    """A saved snapshot of a prompt's text. We keep the last 10 per prompt so an
    edit is never lost and any version can be restored with one tap."""

    __tablename__ = "ai_prompt_versions"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    prompt_id: Mapped[int] = mapped_column(
        ForeignKey("ai_prompts.id"), nullable=False, index=True
    )
    text: Mapped[str] = mapped_column(Text, nullable=False)

    prompt: Mapped["AiPrompt"] = relationship("AiPrompt", back_populates="versions")
