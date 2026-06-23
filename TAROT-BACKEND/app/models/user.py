from typing import List

from sqlalchemy import Enum, Integer
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.enums.role import Role
from app.enums.user_status import UserStatus
from app.models.base import Base


class User(Base):
    __tablename__ = "users"
    
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    role: Mapped[Role] = mapped_column(default=Role.USER)
    email: Mapped[str] = mapped_column(unique=True)
    username: Mapped[str] = mapped_column(unique=True)
    password_hash: Mapped[str]
    balance: Mapped[int] = mapped_column(default=0)
    is_verified: Mapped[bool] = mapped_column(default=False)
    is_online: Mapped[bool] = mapped_column(default=True)
    price_per_second: Mapped[float] = mapped_column(nullable=True)
    profile_picture_path: Mapped[str] = mapped_column(nullable=True)
    bio: Mapped[str] = mapped_column(nullable=True)
    
    # 💡 Added: Dynamic display order field
    # Default is 9999 so un-ordered psychics go to the end
    order: Mapped[int] = mapped_column(Integer, default=9999, nullable=False)
    
    status: Mapped[UserStatus] = mapped_column(
        Enum(UserStatus), default=UserStatus.ACTIVE
    )

    # Relationships
    categories: Mapped[List["PsychicCategory"]] = relationship(
        "PsychicCategory",
        back_populates="psychics",
        cascade="all, delete-orphan",
    )

    availability: Mapped[List["PsychicAvailability"]] = relationship(
        "PsychicAvailability",
        back_populates="psychics",
        cascade="all, delete-orphan",
    )

    psychic_chats: Mapped[List["Chat"]] = relationship(
        "Chat",
        foreign_keys="Chat.psychic_id",
        back_populates="psychic",
    )

    client_chats: Mapped[List["Chat"]] = relationship(
        "Chat",
        foreign_keys="Chat.user_id",
        back_populates="user",
    )

    messages: Mapped[List["Message"]] = relationship(
        "Message",
        foreign_keys="Message.sender_id",
        back_populates="sender",
    )

    transactions: Mapped[List["Transaction"]] = relationship(
        "Transaction", back_populates="user", cascade="all, delete-orphan"
    )

    reviews_given: Mapped[List["Review"]] = relationship(
        "Review",
        foreign_keys="Review.user_id",
        back_populates="user",
        cascade="all, delete-orphan",
    )

    reviews_received: Mapped[List["Review"]] = relationship(
        "Review",
        foreign_keys="Review.psychic_id",
        back_populates="psychic",
        cascade="all, delete-orphan",
    )

    notifications: Mapped[List["Notification"]] = relationship(
        "Notification",
        back_populates="user",
        cascade="all, delete-orphan",
    )