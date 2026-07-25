from sqlalchemy import JSON, Enum, ForeignKey, Integer
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.enums.situation_source import SituationSource
from app.models.base import Base


class ClientSituationRecord(Base):
    """
    ONE rolling "situation record" per CLIENT — the disk layer of the Atlas
    LLM-OS design (Track A, phase A0).

    Mirrors client_notes' role (per-client, platform-wide, keyed by client_id)
    but structured instead of free-text: a JSON document with themes, open
    predictions, sensitive flags, last reader and key people, maintained by the
    deterministic extractor (A1) and — later, separately gated — an AI delta.

    Nothing in the live reading pipeline READS this table yet. Writing is
    side-effect-only and flag-gated (SITUATION_MEMORY_ENABLED, default off);
    feeding it back into replies is the deferred A-LIVE milestone.
    """

    __tablename__ = "client_situation_records"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    # The CLIENT this record belongs to — exactly one rolling record per client.
    client_id: Mapped[int] = mapped_column(
        ForeignKey("users.id"), unique=True, index=True, nullable=False
    )
    # The most recent reading that contributed (optional provenance).
    chat_id: Mapped[int] = mapped_column(ForeignKey("chats.id"), nullable=True)
    # The structured document:
    # { "themes": [str], "open_predictions": [{"kind","value","first_seen"}],
    #   "sensitive_flags": [str], "last_reader": str|null, "key_people": [str] }
    situation: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    # Where the latest update came from.
    source: Mapped[SituationSource] = mapped_column(
        Enum(SituationSource), default=SituationSource.DETERMINISTIC, nullable=False
    )

    client: Mapped["User"] = relationship("User", foreign_keys=[client_id])
