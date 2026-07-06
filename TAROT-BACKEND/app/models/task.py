from datetime import datetime
from typing import List, Optional

from sqlalchemy import DateTime, Enum, Integer, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.enums.task_frequency import TaskFrequency
from app.enums.task_status import TaskStatus
from app.enums.task_trigger_event import TaskTriggerEvent
from app.enums.verification_type import VerificationType
from app.models.base import Base


class Task(Base):
    """An admin-managed reward task (a "Ritual"). Section 5.

    This is the skeleton: the code defines how tasks work, the admin panel
    (built later) defines what tasks exist. Every field here is editable from
    admin. The reward is ALWAYS read from this record server-side at credit
    time — the client never sends an amount.
    """

    __tablename__ = "tasks"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)

    # Shown on the Constellation page
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=True)
    icon: Mapped[str] = mapped_column(String(64), nullable=True)  # emoji/free choice

    # Reward in Stardust (£1 = 1 ⭐). Stored to 2 dp for consistency with the
    # money ledger even though rewards are usually whole stars. The server reads
    # THIS value at credit time; the client never supplies it.
    reward: Mapped[float] = mapped_column(
        Numeric(10, 2, asdecimal=False), nullable=False, default=0
    )

    verification_type: Mapped[VerificationType] = mapped_column(
        Enum(VerificationType, name="verificationtype"),
        nullable=False,
        default=VerificationType.AUTO,
    )
    # Only set for AUTO tasks — the system event that completes them.
    trigger_event: Mapped[Optional[TaskTriggerEvent]] = mapped_column(
        Enum(TaskTriggerEvent, name="tasktriggerevent"), nullable=True
    )

    frequency: Mapped[TaskFrequency] = mapped_column(
        Enum(TaskFrequency, name="taskfrequency"),
        nullable=False,
        default=TaskFrequency.UNLIMITED,
    )

    status: Mapped[TaskStatus] = mapped_column(
        Enum(TaskStatus, name="taskstatus"),
        nullable=False,
        default=TaskStatus.ACTIVE,
    )
    # Optional schedule window for limited-time challenges.
    starts_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    ends_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # How often this task appears in the rotating 4-task strip (higher = more
    # often). Rotation selection itself is built in a later step.
    rotation_weight: Mapped[int] = mapped_column(
        Integer, nullable=False, default=1, server_default="1"
    )

    claims: Mapped[List["Claim"]] = relationship(
        "Claim", back_populates="task", cascade="all, delete-orphan"
    )
