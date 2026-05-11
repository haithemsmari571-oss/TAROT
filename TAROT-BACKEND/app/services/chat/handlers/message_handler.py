"""Handler for message sending and receiving"""

from typing import Any, Dict
from datetime import datetime
from app.services.chat.handlers.base import BaseEventHandler
from app.events.types import ChatEventType
from app.models import User, Chat
from app.services.chats import save_message
from app.logging_config import get_logger

logger = get_logger(__name__)


class MessageHandler(BaseEventHandler):
    """Handles message sending/receiving"""

    async def handle(self, event_data: Dict[str, Any]) -> None:
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

        logger.info(
            "message_broadcasting",
            chat_id=self.chat_id,
            message_id=db_message.id,
            sender_id=user.id,
            content_length=len(content),
        )

        # Broadcast to all chat participants (manager expects string chat_id)
        await manager.send_to_chat(message=message_data, chat_id=str(self.chat_id))

        logger.debug(
            "message_broadcast_complete",
            chat_id=self.chat_id,
            message_id=db_message.id,
        )
