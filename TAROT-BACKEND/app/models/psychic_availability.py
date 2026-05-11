from datetime import time

from sqlalchemy import ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base


class PsychicAvailability(Base):
    __tablename__ = "psychic_availability"
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    psychic_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    day_of_the_week: Mapped[str]
    start_at: Mapped[time]
    end_at: Mapped[time]

    psychics: Mapped["User"] = relationship("User", back_populates="availability")
