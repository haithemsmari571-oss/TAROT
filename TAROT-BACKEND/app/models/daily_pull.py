from datetime import date

from sqlalchemy import Date, ForeignKey, Integer, Numeric, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base


class DailyPull(Base):
    """A single client's daily card pull.

    One row per user per day (enforced by the unique constraint), which is what
    makes the pull "once per day". Also carries the streak bookkeeping so the
    Constellation page can render "Your Practice" and award the day-7 bonus.

    The random reward is computed and credited server-side through the earned-
    Stardust ledger (Step 1); this row records what was granted for auditing.
    """

    __tablename__ = "daily_pulls"
    __table_args__ = (
        UniqueConstraint("user_id", "pull_date", name="uq_daily_pull_user_date"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id"), nullable=False, index=True
    )
    pull_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)

    card_key: Mapped[int] = mapped_column(Integer, nullable=False)
    # Random 1-10 ⭐ granted for the pull.
    reward: Mapped[float] = mapped_column(Numeric(10, 2, asdecimal=False), nullable=False)
    # Total consecutive days including this one (1, 2, 3, …).
    streak_length: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    # Position in the current 7-day cycle (1-7) for the stars visual.
    week_position: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    # Extra Stardust granted when this pull completed a 7-day streak (else 0).
    bonus_awarded: Mapped[float] = mapped_column(
        Numeric(10, 2, asdecimal=False), nullable=False, default=0, server_default="0"
    )

    user: Mapped["User"] = relationship("User")
