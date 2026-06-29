from collections import defaultdict
from fastapi import WebSocket


class NotificationManager:
    def __init__(self):
        # Maps user_id to their WebSocket connection
        self.active_connections: dict[int, WebSocket] = {}

    async def connect(self, websocket: WebSocket, user_id: int):
        """Connect a user's WebSocket for notifications"""
        self.active_connections[user_id] = websocket

    def disconnect(self, user_id: int):
        """Disconnect a user's WebSocket"""
        if user_id in self.active_connections:
            del self.active_connections[user_id]

    async def send_to_user(self, message: dict, user_id: int):
        """Send a notification message to a specific user"""
        if user_id in self.active_connections:
            try:
                await self.active_connections[user_id].send_json(message)
            except Exception as e:
                from app.logging_config import get_logger
                logger = get_logger(__name__)
                logger.warning(
                    "failed_to_send_websocket_notification",
                    user_id=user_id,
                    error=str(e),
                )
                self.disconnect(user_id)

    def is_user_connected(self, user_id: int) -> bool:
        """Check if a user is connected"""
        return user_id in self.active_connections


notification_manager = NotificationManager()
