from datetime import date

from sqlalchemy import Date, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class DailyContent(Base):
    """One day's spiritual content for one zodiac sign.

    This is the exact shape the nightly Claude generation job (a later step) will
    write into — card, interpretation, manifestation, ritual, and a shareable
    quote line, per sign per day. For now rows are filled from a believable
    placeholder pool (see app.services.daily_content); when the generator lands
    it writes to this same table and the pages don't change at all.
    """

    __tablename__ = "daily_content"
    __table_args__ = (
        UniqueConstraint("content_date", "zodiac_sign", name="uq_daily_content_date_sign"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    content_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    zodiac_sign: Mapped[str] = mapped_column(String(32), nullable=False, index=True)

    # Which tarot card (image key) + its name.
    card_key: Mapped[int] = mapped_column(Integer, nullable=False)
    card_name: Mapped[str] = mapped_column(String(64), nullable=False)

    # Valentina's voice content.
    interpretation: Mapped[str] = mapped_column(Text, nullable=False)
    manifestation: Mapped[str] = mapped_column(Text, nullable=False)
    ritual: Mapped[str] = mapped_column(Text, nullable=False)
    quote_line: Mapped[str] = mapped_column(Text, nullable=False)

    # "placeholder" now; "generated" once the nightly Claude job writes it.
    source: Mapped[str] = mapped_column(
        String(32), nullable=False, default="placeholder", server_default="placeholder"
    )
