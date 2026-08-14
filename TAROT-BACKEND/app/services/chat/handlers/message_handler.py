"""Handler for message sending and receiving"""

from typing import Any, Dict
from datetime import datetime
from app.services.chat.handlers.base import BaseEventHandler
from app.events.types import ChatEventType
from app.models import User, Chat
from app.services.chats import save_message
from app.logging_config import get_logger

logger = get_logger(__name__)

# Platform rule: messages ride free only while a live billed session covers
# them. Outside one (no session, awaiting join, grace hold, ended chat) the
# client pays per message. 1 Stardust = £1.
OUT_OF_SESSION_MESSAGE_FEE = 1.0


def _client_in_live_session(chat: Chat) -> bool:
    """True when the chat has a session actively billing (not AWAITING_JOIN,
    not GRACE) — the only state where client messages are covered by the
    per-minute timer."""
    from app.enums.chat_status import ChatStatus
    from app.services.session_manager import get_session_manager

    if chat.status != ChatStatus.ACTIVE:
        return False
    state = get_session_manager().active_sessions.get(chat.id)
    return bool(state and not state.awaiting_join and not state.is_grace)


def _chat_ever_accepted(db, chat: Chat) -> bool:
    """Request-phase messages are free (owner decision): the fee applies only
    once the chat has been accepted at least once. A billable SessionInterval is
    created exactly at accept, so its existence is the accept marker — this keeps
    a rejected request (REQUESTED → ENDED, never accepted) fee-free."""
    from app.enums.chat_status import ChatStatus
    from app.models import ChatSession, SessionInterval

    if chat.status == ChatStatus.REQUESTED:
        return False
    return (
        db.query(SessionInterval.id)
        .join(ChatSession, ChatSession.id == SessionInterval.session_id)
        .filter(ChatSession.chat_id == chat.id)
        .first()
        is not None
    )


class MessageHandler(BaseEventHandler):
    """Handles message sending/receiving"""

    async def handle(self, event_data: Dict[str, Any]) -> None:
        """Keep one chat's commit and notification order causal."""
        from app.services.ai.reading_burst import message_flow_lock

        async with message_flow_lock(self.chat_id):
            await self._handle_serialized(event_data)

    async def _handle_serialized(self, event_data: Dict[str, Any]) -> None:
        """Save message and broadcast to chat participants"""
        from app.routers.chats import manager  # Import here to avoid circular

        logger.debug(
            "message_handler_received",
            chat_id=self.chat_id,
            user_id=self.user_id,
            event_data=event_data,
        )

        # Validate message content
        content = event_data.get("content", "").strip()
        if not content:
            logger.warning(
                "message_empty_content",
                chat_id=self.chat_id,
                user_id=self.user_id,
            )
            await self.send_error("Message content cannot be empty")
            return

        # Get user and chat from DB
        user = self.db.query(User).filter(User.id == self.user_id).first()
        chat = self.db.query(Chat).filter(Chat.id == self.chat_id).first()

        if not user or not chat:
            logger.error(
                "message_invalid_user_or_chat",
                chat_id=self.chat_id,
                user_id=self.user_id,
                user_found=user is not None,
                chat_found=chat is not None,
            )
            await self.send_error("Invalid user or chat")
            return

        # ── Out-of-session message fee ──────────────────────────────────────
        # Only the chat's client pays (psychics are salaried; admins drive the
        # cockpit). Charged BEFORE saving: an unaffordable message is rejected,
        # never stored or broadcast — no free paths.
        from app.enums.role import Role

        fee_charged = None  # set when this message was individually billed
        client_balance_after = None
        sender_is_paying_client = (
            user.id == chat.user_id
            and user.role not in (Role.ADMIN, Role.SUPERADMIN)
        )
        if (
            sender_is_paying_client
            and not _client_in_live_session(chat)
            and _chat_ever_accepted(self.db, chat)
        ):
            from app.exceptions.transactions import InsufficientBalanceError
            from app.services.stardust_rewards import get_spendable_stardust
            from app.services.transactions import create_debit_transaction

            psychic_name = chat.psychic.username if chat.psychic else "your reader"
            try:
                create_debit_transaction(
                    db=self.db,
                    user_id=user.id,
                    amount=OUT_OF_SESSION_MESSAGE_FEE,
                    description=f"Message to {psychic_name} (between sessions)",
                    related_chat_id=chat.id,
                    metadata={
                        "message_fee": OUT_OF_SESSION_MESSAGE_FEE,
                        "psychic_id": chat.psychic_id,
                        "psychic_username": psychic_name,
                    },
                )
            except InsufficientBalanceError:
                balance = get_spendable_stardust(self.db, user)
                logger.info(
                    "message_fee_insufficient_balance",
                    chat_id=self.chat_id,
                    user_id=user.id,
                    balance=balance,
                    fee=OUT_OF_SESSION_MESSAGE_FEE,
                )
                await self.send_event(
                    "message_rejected",
                    {
                        "data": {
                            "reason": "INSUFFICIENT_BALANCE",
                            "fee": OUT_OF_SESSION_MESSAGE_FEE,
                            "client_balance": round(balance, 2),
                        }
                    },
                )
                return
            fee_charged = OUT_OF_SESSION_MESSAGE_FEE
            client_balance_after = round(get_spendable_stardust(self.db, user), 2)
            logger.info(
                "message_fee_charged",
                chat_id=self.chat_id,
                user_id=user.id,
                fee=fee_charged,
                balance_after=client_balance_after,
            )

        # Prepare message data
        message_data = {
            "content": content,
            "sender_id": user.id,  # Primary field for frontend
            "user_id": user.id,  # Backward compatibility
            "timestamp": datetime.now().isoformat(),
            "type": "message",
            "chat_id": self.chat_id,  # Add chat context
        }

        # Save message to database
        db_message = await save_message(self.db, message_data, user, chat)

        # Update message data with DB fields
        message_data["id"] = db_message.id
        message_data["created_at"] = (
            db_message.created_at.isoformat()
            if db_message.created_at
            else message_data["timestamp"]
        )

        # ── Read-receipt status from live presence ──
        # READ if the recipient currently has this conversation open, DELIVERED
        # if they're online (app open) but elsewhere, else SENT. Two-tier UI:
        # DELIVERED = single check, READ = double check.
        from app.notification_manager import notification_manager
        from app.enums.message_status import MessageStatus

        recipient_id = chat.psychic_id if user.id == chat.user_id else chat.user_id
        if recipient_id in manager.users_in_chat(str(self.chat_id)):
            status = MessageStatus.READ
        elif notification_manager.is_user_connected(recipient_id):
            status = MessageStatus.DELIVERED
        else:
            status = MessageStatus.SENT
        db_message.status = status
        self.db.commit()
        message_data["status"] = status.value

        logger.info(
            "message_broadcasting",
            chat_id=self.chat_id,
            message_id=db_message.id,
            sender_id=user.id,
            content_length=len(content),
        )

        # Broadcast to all chat participants (manager expects string chat_id)
        await manager.send_to_chat(message=message_data, chat_id=str(self.chat_id))

        # Tell the paying sender their balance moved (sender-only, so the
        # composer can show the 1-⭐ fee visibly decreasing the balance).
        if fee_charged is not None:
            await self.send_event(
                "message_fee_charged",
                {
                    "data": {
                        "message_id": db_message.id,
                        "fee": fee_charged,
                        "client_balance": client_balance_after,
                    }
                },
            )

        # Push when the CLIENT is unreachable live: status == SENT means the
        # recipient has no socket anywhere (app closed/backgrounded). Clients
        # only — psychics work from their own panel — and never for the
        # sender's own message (recipient_id is always the other party).
        # Fire-and-forget; a push failure never breaks the broadcast.
        if status == MessageStatus.SENT and recipient_id == chat.user_id:
            from app.services.push import notify_user_push

            preview = content if len(content) <= 120 else content[:117] + "…"
            notify_user_push(
                recipient_id,
                title=f"New message from {user.username}",
                body=preview,
                data={
                    "type": "new_message",
                    "chat_id": self.chat_id,
                    "psychic_name": user.username,
                },
            )

        logger.debug(
            "message_broadcast_complete",
            chat_id=self.chat_id,
            message_id=db_message.id,
        )

        # ── Session-scoped Valentina turn boundary ────────────────────────────
        # The canonical Message row above remains one row per client send. Active
        # reading messages only notify the durable burst coordinator: it waits for
        # six seconds of silence (and client typing to stop), fences concurrent
        # workers/restarts, then creates one Hybrid draft or one Automatic response.
        # A human reader message closes the client messages that preceded it so a
        # later mode switch cannot answer an already-manually-answered turn.
        from app.enums.chat_status import ChatStatus

        answered_client_turn = None
        automatic_turn_already_recorded = False
        if chat.status == ChatStatus.ACTIVE:
            try:
                from app.services.ai import reading_burst

                if sender_is_paying_client:
                    await reading_burst.note_client_message(
                        self.chat_id, db_message.chat_session_id, db_message.id
                    )
                elif user.id != chat.user_id:
                    answered = await reading_burst.note_reader_message(
                        self.chat_id, db_message.chat_session_id, db_message.id
                    )
                    if answered is not None:
                        (
                            answered_client_turn,
                            automatic_turn_already_recorded,
                        ) = answered
            except Exception:  # noqa: BLE001 — coordination never breaks storage
                logger.exception(
                    "reading_burst_notification_failed", chat_id=self.chat_id
                )

        # A manual reader response closes the same client turn as an approved
        # Hybrid draft. Record that ordered turn before the delivered reply so
        # later regeneration never loses the client messages it answered.
        if user.id != chat.user_id:
            try:
                from app.services.ai.reading_ledger import record_commitments
                from app.services.ai.reading_session import (
                    get_session_store,
                    record_client_message,
                    record_sent_message,
                )

                store = get_session_store()
                state = store.get(f"chat:{self.chat_id}")
                if state is None and answered_client_turn is not None:
                    state = store.get_or_create(
                        f"chat:{self.chat_id}",
                        client_id=chat.user_id,
                        chat_id=self.chat_id,
                    )
                if state is not None:
                    client_turn_is_present = (
                        automatic_turn_already_recorded
                        and any(
                            entry.get("role") == "client"
                            and entry.get("content") == answered_client_turn
                            for entry in reversed(state.chat_transcript)
                        )
                    )
                    if (
                        answered_client_turn is not None
                        and not client_turn_is_present
                    ):
                        record_client_message(state, answered_client_turn)
                    record_sent_message(state, content)
                    record_commitments(state, content)
                    store.put(state)
            except Exception:  # noqa: BLE001 — memory must never break a send
                logger.exception(
                    "manual_message_memory_record_failed", chat_id=self.chat_id
                )
