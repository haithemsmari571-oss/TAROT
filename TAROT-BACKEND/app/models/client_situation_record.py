from sqlalchemy import JSON, Enum, ForeignKey, Integer, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.enums.situation_source import SituationSource
from app.models.base import Base


class ClientSituationRecord(Base):
    """
    ONE rolling "situation record" per (CLIENT, PSYCHIC) pair — the disk layer of
    the Atlas LLM-OS design (Track A, phase A0).

    SILOED PER READER, and that is the whole point. A client who has sessions
    with two different psychics gets two independent records. Briefing one
    psychic must never surface anything the client discussed with another, so
    there is deliberately no client-wide rolling document to merge into: the
    themes, open predictions, sensitive flags and key people in a record come
    only from that one reader's conversations with that one client.

    The uniqueness constraint is (client_id, psychic_id), mirroring the natural
    key of `chats`. Reads and writes MUST filter on both columns; filtering on
    client_id alone would hand one reader another reader's memory.

    Nothing in the live reading pipeline READS this table yet. Writing is
    side-effect-only and flag-gated (SITUATION_MEMORY_ENABLED, default off);
    feeding it back into replies is the deferred A-LIVE milestone.
    """

    __tablename__ = "client_situation_records"
    __table_args__ = (
        UniqueConstraint(
            "client_id",
            "psychic_id",
            name="uq_client_situation_records_client_psychic",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    # The CLIENT this record is about. NOT unique on its own any more — one row
    # per reader who has seen this client.
    client_id: Mapped[int] = mapped_column(
        ForeignKey("users.id"), index=True, nullable=False
    )
    # The PSYCHIC whose sessions produced this record. A psychic is a users row
    # with role=PSYCHIC (there is no separate psychic table), so this points at
    # users.id exactly like chats.psychic_id does.
    psychic_id: Mapped[int] = mapped_column(
        ForeignKey("users.id"), index=True, nullable=False
    )
    # The most recent reading that contributed (optional provenance).
    chat_id: Mapped[int] = mapped_column(ForeignKey("chats.id"), nullable=True)
    # The structured document, scoped to this reader's view of this client:
    # { "themes": [str], "open_predictions": [{"kind","value","first_seen"}],
    #   "sensitive_flags": [str], "last_reader": str|null, "key_people": [str] }
    situation: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    # Where the latest update came from.
    source: Mapped[SituationSource] = mapped_column(
        Enum(SituationSource), default=SituationSource.DETERMINISTIC, nullable=False
    )

    client: Mapped["User"] = relationship("User", foreign_keys=[client_id])
    psychic: Mapped["User"] = relationship("User", foreign_keys=[psychic_id])
