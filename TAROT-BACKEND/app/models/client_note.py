from sqlalchemy import ForeignKey, Integer, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base


class ClientNote(Base):
    """
    A dossier note about a CLIENT — platform-wide, not per-psychic.

    Every reading's summary note is saved against the client's profile so ANY
    psychic can read the client's full history on a future reading (the client
    never has to repeat themselves), and superadmins can open a client's dossier
    at any time. Keyed by client_id; author_psychic_id records who wrote it.
    """

    __tablename__ = "client_notes"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    # The CLIENT this note belongs to (the dossier owner).
    client_id: Mapped[int] = mapped_column(
        ForeignKey("users.id"), index=True, nullable=False
    )
    # Which psychic authored it (nullable — an admin/superadmin may add one).
    author_psychic_id: Mapped[int] = mapped_column(
        ForeignKey("users.id"), nullable=True
    )
    # The reading it came from (optional — a note may be added outside a session).
    chat_id: Mapped[int] = mapped_column(ForeignKey("chats.id"), nullable=True)
    note: Mapped[str] = mapped_column(Text, nullable=False)

    client: Mapped["User"] = relationship("User", foreign_keys=[client_id])
    author: Mapped["User"] = relationship("User", foreign_keys=[author_psychic_id])
