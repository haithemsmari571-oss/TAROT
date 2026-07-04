from collections import defaultdict
from typing import Optional

from fastapi import WebSocket


class ConnectionManager:
    def __init__(self):
        # chat_id -> list of (websocket, user_id). The user_id lets us answer
        # "who currently has this conversation open" for read-receipts.
        self.active_chats: dict[str, list[tuple[WebSocket, Optional[int]]]] = defaultdict(
            list
        )

    async def connect(
        self, websocket: WebSocket, chat_id: str, user_id: Optional[int] = None
    ):
        self.active_chats[chat_id].append((websocket, user_id))

    def disconnect(self, websocket: WebSocket, chat_id: str):
        conns = self.active_chats.get(chat_id)
        if not conns:
            return
        self.active_chats[chat_id] = [
            (ws, uid) for (ws, uid) in conns if ws is not websocket
        ]
        if not self.active_chats[chat_id]:
            del self.active_chats[chat_id]

    def users_in_chat(self, chat_id: str) -> set[int]:
        """User ids that currently have this conversation open (viewing)."""
        return {
            uid for (_, uid) in self.active_chats.get(chat_id, []) if uid is not None
        }

    async def send_to_chat(self, message: dict, chat_id: str):
        """Sends a message to everyone in a specific chat"""
        if chat_id in self.active_chats:
            disconnected_sockets = []
            for connection, _uid in list(self.active_chats[chat_id]):
                try:
                    await connection.send_json(message)
                except Exception as e:
                    from app.logging_config import get_logger

                    logger = get_logger(__name__)
                    logger.warning(
                        "failed_to_send_chat_message",
                        chat_id=chat_id,
                        error=str(e),
                    )
                    disconnected_sockets.append(connection)

            # Clean up disconnected sockets
            for socket in disconnected_sockets:
                self.disconnect(socket, chat_id)

    async def send_to_user(self, message: dict, user_id: str):
        raise NotImplementedError

    async def is_user_connected(self, message: dict, user_id: str):
        raise NotImplementedError


manager = ConnectionManager()
