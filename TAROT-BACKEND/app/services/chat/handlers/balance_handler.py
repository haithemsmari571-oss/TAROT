"""Handler for balance-related events"""

from typing import Any, Dict
from app.services.chat.handlers.base import BaseEventHandler
from app.events.types import ChatEventType
from app.services.chats import end_chat_session
from app.enums.chat_termination_reason import ChatTerminationReason
from app.logging_config import get_logger

logger = get_logger(__name__)


class BalanceHandler(BaseEventHandler):
    """Handles balance-related events"""

    async def handle_low_balance(self, remaining_seconds: int) -> None:
        """Send low balance warning to client"""
        logger.info(
            "balance_warning_sent",
            chat_id=self.chat_id,
            user_id=self.user_id,
            remaining_seconds=remaining_seconds,
        )

        await self.send_event(
            "low_balance_warning",
            {
                "remaining_seconds": remaining_seconds,
                "remaining_points": int(remaining_seconds * self._get_psychic_rate()),
                "message": f"Low balance warning: You have approximately {remaining_seconds} seconds remaining.",
            },
        )

    async def handle_critical_balance(self, remaining_seconds: int) -> None:
        """Send critical balance warning to client"""
        logger.warning(
            "critical_balance_warning",
            chat_id=self.chat_id,
            user_id=self.user_id,
            remaining_seconds=remaining_seconds,
        )

        await self.send_event(
            "balance_critical",
            {
                "remaining_seconds": remaining_seconds,
                "message": f"Critical: {remaining_seconds} seconds remaining",
            },
        )

    async def handle_insufficient_balance(self) -> None:
        """Handle insufficient balance - end the session"""
        from app.models import Chat
        from app.notification_manager import notification_manager
        from app.models.notification import Notification
        from app.enums.notification_type import NotificationType
        from datetime import datetime

        logger.warning(
            "insufficient_balance_ending_session",
            chat_id=self.chat_id,
            user_id=self.user_id,
        )

        # Get chat details for notification
        chat = self.db.query(Chat).filter(Chat.id == self.chat_id).first()
        if not chat:
            logger.error(
                "chat_not_found_during_insufficient_balance",
                chat_id=self.chat_id,
            )
            return

        # Calculate session stats BEFORE ending the session
        from app.models.chat_session import ChatSession
        from app.models.session_intervals import SessionInterval
        from sqlalchemy import desc

        session = (
            self.db.query(ChatSession)
            .filter(ChatSession.chat_id == self.chat_id)
            .order_by(desc(ChatSession.id))
            .first()
        )

        elapsed_seconds = 0
        estimated_cost = 0.0

        if session:
            # Calculate elapsed time from active intervals
            all_intervals = (
                self.db.query(SessionInterval)
                .filter(SessionInterval.session_id == session.id)
                .all()
            )

            from datetime import datetime

            for interval in all_intervals:
                # For the current active interval, calculate up to now
                end_time = interval.ended_at if interval.ended_at else datetime.now()
                duration = (end_time - interval.started_at).total_seconds()
                elapsed_seconds += int(duration)

            estimated_cost = elapsed_seconds * self._get_psychic_rate()

        # Send WebSocket event to current connection
        await self.send_event(
            "session_ended_no_balance",
            {"message": "Session ended - insufficient balance"},
        )

        # Broadcast to entire chat room (both client and psychic)
        from app.manager import manager

        logger.info(
            "broadcasting_session_ended_to_chat_room",
            chat_id=self.chat_id,
            elapsed_seconds=elapsed_seconds,
            estimated_cost=estimated_cost,
        )

        await manager.send_to_chat(
            message={
                "event": "session_ended",
                "reason": "insufficient_balance",
                "message": "Session ended - insufficient balance",
            },
            chat_id=str(self.chat_id),
        )

        # End the chat session (this will commit the database changes)
        end_chat_session(
            self.db, self.chat_id, ChatTerminationReason.INSUFFICIENT_FUNDS
        )

        # Refresh chat object to get updated status
        self.db.refresh(chat)

        logger.info(
            "chat_session_ended_and_committed",
            chat_id=self.chat_id,
            new_status=chat.status.value if chat.status else None,
            elapsed_seconds=elapsed_seconds,
            estimated_cost=estimated_cost,
        )

        # Send final confirmed broadcast with DB status after commit
        logger.info(
            "broadcasting_session_ended_confirmed_to_chat_room",
            chat_id=self.chat_id,
            db_status=chat.status.value if chat.status else None,
        )

        await manager.send_to_chat(
            message={
                "event": "session_ended_confirmed",
                "chat_id": self.chat_id,
                "chat_status": chat.status.value if chat.status else None,
                "reason": "insufficient_balance",
                "elapsed_seconds": elapsed_seconds,
                "estimated_cost": round(estimated_cost, 2),
                "message": "Session ended - insufficient balance",
            },
            chat_id=str(self.chat_id),
        )

        # Store and broadcast system message
        from app.services.chats import save_system_message

        system_msg = save_system_message(
            self.db, self.chat_id, "Session ended due to insufficient points."
        )
        await manager.send_to_chat(
            message={
                "type": "system",
                "id": system_msg.id,
                "content": system_msg.content,
                "is_system": True,
                "chat_id": self.chat_id,
                "sender_id": None,
                "created_at": system_msg.created_at.isoformat()
                if system_msg.created_at
                else datetime.now().isoformat(),
            },
            chat_id=str(self.chat_id),
        )

        # Create notifications in database for both client and psychic
        client_notification = Notification(
            user_id=chat.user_id,
            type=NotificationType.CHAT_ENDED,
            title="Session Ended",
            message="Your session has ended due to insufficient balance.",
            data={
                "chat_id": self.chat_id,
                "reason": "insufficient_balance",
                "elapsed_seconds": elapsed_seconds,
                "estimated_cost": round(estimated_cost, 2),
            },
        )
        self.db.add(client_notification)

        psychic_notification = Notification(
            user_id=chat.psychic_id,
            type=NotificationType.CHAT_ENDED,
            title="Session Ended",
            message="Client session ended due to insufficient balance.",
            data={
                "chat_id": self.chat_id,
                "reason": "insufficient_balance",
                "elapsed_seconds": elapsed_seconds,
                "estimated_cost": round(estimated_cost, 2),
            },
        )
        self.db.add(psychic_notification)

        self.db.commit()
        self.db.refresh(client_notification)
        self.db.refresh(psychic_notification)

        # Send real-time notifications via WebSocket to both users
        notification_data = {
            "type": "notification",
            "notification_type": NotificationType.CHAT_ENDED,
            "title": "Session Ended",
            "message": "Session ended due to insufficient balance.",
            "data": {
                "chat_id": self.chat_id,
                "reason": "insufficient_balance",
                "elapsed_seconds": elapsed_seconds,
                "estimated_cost": round(estimated_cost, 2),
            },
            "timestamp": datetime.now().isoformat(),
        }

        await notification_manager.send_to_user(notification_data, chat.user_id)
        await notification_manager.send_to_user(notification_data, chat.psychic_id)

        logger.info(
            "session_ended_insufficient_balance_notifications_sent",
            chat_id=self.chat_id,
            user_id=self.user_id,
            elapsed_seconds=elapsed_seconds,
            estimated_cost=estimated_cost,
        )

    def _get_psychic_rate(self) -> float:
        """Helper to get psychic rate from chat"""
        from app.models import Chat

        chat = self.db.query(Chat).filter(Chat.id == self.chat_id).first()
        if chat and chat.psychic:
            return chat.psychic.price_per_second
        return 0.0

    async def handle(self, event_data: Dict[str, Any]) -> None:
        """Not used directly - this handler has specific methods"""
        pass
