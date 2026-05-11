from sqlalchemy import ForeignKey, Integer, String, Boolean, JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.enums.notification_type import NotificationType
from app.models.base import Base


class Notification(Base):
    __tablename__ = "notifications"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    type: Mapped[NotificationType] = mapped_column(nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    message: Mapped[str] = mapped_column(String(1000), nullable=False)
    is_read: Mapped[bool] = mapped_column(default=False)
    data: Mapped[dict] = mapped_column(JSON, nullable=True)  # Additional payload data

    # Relationships
    user: Mapped["User"] = relationship("User", back_populates="notifications")
