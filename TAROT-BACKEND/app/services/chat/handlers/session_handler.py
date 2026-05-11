"""Handler for session lifecycle events"""

from typing import Any, Dict
from app.services.chat.handlers.base import BaseEventHandler
from app.events.types import ChatEventType
from app.logging_config import get_logger

logger = get_logger(__name__)


class SessionHandler(BaseEventHandler):
    """Handles session lifecycle events"""

    async def handle_session_start(self, session_data: Dict[str, Any]) -> None:
        """Notify client that session has started"""
        logger.info("session_started", chat_id=self.chat_id, user_id=self.user_id)

        await self.send_event(
            "session_started",
            {
                "chat_id": self.chat_id,
                "psychic_rate": session_data.get("psychic_rate"),
                "client_balance": session_data.get("client_balance"),
                "started_at": session_data.get("started_at"),
            },
        )

    async def handle_session_ending_soon(self, remaining_seconds: int) -> None:
        """Notify client that session is ending soon"""
        logger.info(
            "session_ending_soon",
            chat_id=self.chat_id,
            user_id=self.user_id,
            remaining_seconds=remaining_seconds,
        )

        await self.send_event(
            "session_ending_soon",
            {
                "remaining_seconds": remaining_seconds,
                "message": f"Session will end in {remaining_seconds} seconds due to insufficient balance.",
            },
        )

    async def handle_session_ended(self, reason: str = "Session ended") -> None:
        """Notify client that session has ended"""
        logger.info(
            "session_ended_notification_sent",
            chat_id=self.chat_id,
            user_id=self.user_id,
            reason=reason,
        )

        await self.send_event(
            "session_ended", {"reason": reason, "message": "Session has ended"}
        )

    async def handle(self, event_data: Dict[str, Any]) -> None:
        """Not used directly - this handler has specific methods"""
        pass
