"""Event dispatcher for routing chat events to handlers"""

from typing import Dict, Any
from fastapi import WebSocket
from sqlalchemy.orm import Session
from app.services.chat.handlers.message_handler import MessageHandler
from app.services.chat.handlers.balance_handler import BalanceHandler
from app.services.chat.handlers.session_handler import SessionHandler
from app.events.types import ChatEventType
from app.logging_config import get_logger

logger = get_logger(__name__)


class EventDispatcher:
    """Dispatches events to appropriate handlers"""

    def __init__(self, websocket: WebSocket, db: Session, chat_id: int, user_id: int):
        self.websocket = websocket
        self.db = db
        self.chat_id = chat_id
        self.user_id = user_id

        # Initialize handlers
        self.message_handler = MessageHandler(websocket, db, chat_id, user_id)
        self.balance_handler = BalanceHandler(websocket, db, chat_id, user_id)
        self.session_handler = SessionHandler(websocket, db, chat_id, user_id)

    async def dispatch(self, event_type: str, event_data: Dict[str, Any]) -> None:
        """Route event to appropriate handler"""

        logger.debug(
            "dispatching_event",
            event_type=event_type,
            chat_id=self.chat_id,
            user_id=self.user_id,
        )

        try:
            # Map event types to handler methods
            if event_type == ChatEventType.MESSAGE_SEND or event_type == "message":
                await self.message_handler.handle(event_data)

            elif (
                event_type == ChatEventType.BALANCE_WARNING
                or event_type == "balance_warning"
            ):
                remaining_seconds = event_data.get("remaining_seconds", 0)
                await self.balance_handler.handle_low_balance(remaining_seconds)

            elif (
                event_type == ChatEventType.BALANCE_CRITICAL
                or event_type == "balance_critical"
            ):
                remaining_seconds = event_data.get("remaining_seconds", 0)
                await self.balance_handler.handle_critical_balance(remaining_seconds)

            elif (
                event_type == ChatEventType.BALANCE_INSUFFICIENT
                or event_type == "balance_insufficient"
            ):
                await self.balance_handler.handle_insufficient_balance()

            elif (
                event_type == ChatEventType.SESSION_ENDING_SOON
                or event_type == "session_ending_soon"
            ):
                remaining_seconds = event_data.get("remaining_seconds", 0)
                await self.session_handler.handle_session_ending_soon(remaining_seconds)

            elif (
                event_type == ChatEventType.SESSION_ENDED
                or event_type == "session_ended"
            ):
                reason = event_data.get("reason", "Session ended")
                await self.session_handler.handle_session_ended(reason)

            elif (
                event_type == ChatEventType.SESSION_STARTED
                or event_type == "session_started"
            ):
                await self.session_handler.handle_session_start(event_data)

            else:
                logger.warning(
                    "unknown_event_type", event_type=event_type, chat_id=self.chat_id
                )
                print(f"[EventDispatcher] No handler for event type: {event_type}")

        except Exception as e:
            logger.error(
                "event_dispatch_error",
                event_type=event_type,
                chat_id=self.chat_id,
                error=str(e),
                exc_info=True,
            )
            # Send error to client
            await self.websocket.send_json(
                {"event": "error", "message": f"Failed to process event: {str(e)}"}
            )
