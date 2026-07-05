from sqlalchemy import Enum, ForeignKey, Integer, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.enums.transaction_status import TransactionStatus
from app.enums.transaction_type import TransactionType
from app.models.base import Base


class Transaction(Base):
    __tablename__ = "transactions"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    transaction_type: Mapped[TransactionType] = mapped_column(Enum(TransactionType))
    # Money stored to 2 dp (pennies) so per-minute debits at the exact reader
    # rate (e.g. £5.20) are recorded without rounding. asdecimal=False → read
    # back as float so existing sums/JSON serialisation keep working.
    amount: Mapped[float] = mapped_column(Numeric(10, 2, asdecimal=False), nullable=False)
    balance_before: Mapped[float] = mapped_column(Numeric(10, 2, asdecimal=False), nullable=False)
    balance_after: Mapped[float] = mapped_column(Numeric(10, 2, asdecimal=False), nullable=False)
    status: Mapped[TransactionStatus] = mapped_column(
        Enum(TransactionStatus), default=TransactionStatus.COMPLETED
    )
    description: Mapped[str] = mapped_column(Text, nullable=True)
    related_chat_id: Mapped[int] = mapped_column(ForeignKey("chats.id"), nullable=True)
    related_session_interval_id: Mapped[int] = mapped_column(
        ForeignKey("session_intervals.id"), nullable=True
    )
    stripe_payment_intent_id: Mapped[str] = mapped_column(String(255), nullable=True)
    idempotency_key: Mapped[str] = mapped_column(
        String(255), unique=True, nullable=True
    )
    transaction_metadata: Mapped[str] = mapped_column(
        Text, nullable=True
    )  # JSON string

    user: Mapped["User"] = relationship("User", back_populates="transactions")
    chat: Mapped["Chat"] = relationship(
        "Chat", back_populates="transactions", foreign_keys=[related_chat_id]
    )
    session_interval: Mapped["SessionInterval"] = relationship(
        "SessionInterval",
        back_populates="transactions",
        foreign_keys=[related_session_interval_id],
    )
