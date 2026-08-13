from datetime import datetime
from typing import List, Optional

from sqlalchemy import JSON, DateTime, ForeignKey, Integer, String, Text
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
    default_model: Mapped[str] = mapped_column(String(64), nullable=False)

    # Current (editable) text, and the shipped default kept permanently as a
    # known-good fallback the owner can always restore.
    prompt: Mapped[str] = mapped_column(Text, nullable=False)
    default_prompt: Mapped[str] = mapped_column(Text, nullable=False)

    # [{ "name": "zodiac_sign", "description": "..." }, ...] documented in the UI.
    variables: Mapped[Optional[list]] = mapped_column(JSON, nullable=True)
    output_schema: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    output_schema_version: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    # Unknown/future rows remain protected until code explicitly classifies them.
    classification: Mapped[str] = mapped_column(
        String(32), nullable=False, default="PROTECTED", server_default="PROTECTED"
    )
    active_version: Mapped[int] = mapped_column(
        Integer, nullable=False, default=1, server_default="1"
    )
    draft_version: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    # 1 while the row still tracks the shipped default, 0 once the owner has
    # edited it. This is what lets a later code change to a prompt constant
    # actually reach the model: see registry.resolve_prompt_text. Without it the
    # DB row was authoritative from the first seed, forever.
    is_default: Mapped[int] = mapped_column(
        Integer, nullable=False, default=1, server_default="1"
    )

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
        order_by="desc(AiPromptVersion.version)",
    )


class AiPromptVersion(Base):
    """A saved snapshot of a prompt's text. We keep the last 10 per prompt so an
    edit is never lost and any version can be restored with one tap."""

    __tablename__ = "ai_prompt_versions"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    prompt_id: Mapped[int] = mapped_column(
        ForeignKey("ai_prompts.id"), nullable=False, index=True
    )
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    text: Mapped[str] = mapped_column(Text, nullable=False)
    model: Mapped[str] = mapped_column(String(64), nullable=False)
    state: Mapped[str] = mapped_column(
        String(16), nullable=False, default="ACTIVE", server_default="ACTIVE"
    )
    activated_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    prompt: Mapped["AiPrompt"] = relationship("AiPrompt", back_populates="versions")
