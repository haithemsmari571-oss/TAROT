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
        # Sockets whose page said it is out of sight (ROUND57): the app's
        # thread sends {"type": "viewing", "visible": false} when its tab or
        # phone goes to the background, and true when it comes back. Keyed by
        # id(): a Starlette WebSocket is a Mapping, so it cannot be hashed. A
        # socket that never says anything counts as in sight.
        self.hidden_sockets: set[int] = set()

    async def connect(
        self, websocket: WebSocket, chat_id: str, user_id: Optional[int] = None
    ):
        self.active_chats[chat_id].append((websocket, user_id))

    def disconnect(self, websocket: WebSocket, chat_id: str):
        self.hidden_sockets.discard(id(websocket))
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

    def set_visible(self, websocket: WebSocket, visible: bool) -> None:
        if visible:
            self.hidden_sockets.discard(id(websocket))
        else:
            self.hidden_sockets.add(id(websocket))

    def is_viewing(self, chat_id: str, user_id: int) -> bool:
        """Whether ``user_id`` has this conversation open in sight: one of her
        sockets in the room whose page has not said it went out of sight. No
        phone notification is sent for it then (services/web_push.py)."""
        return any(
            uid == user_id and id(ws) not in self.hidden_sockets
            for (ws, uid) in self.active_chats.get(chat_id, [])
        )

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

    async def send_to_user_in_chat(
        self, message: dict, chat_id: str, user_id: int
    ) -> bool:
        """Send to ONE participant's open sockets in a room, not the whole room.
        Returns True if at least one socket received it. Lets a client learn her
        balance moved without the reader's socket seeing the figure."""
        delivered = False
        dead = []
        for connection, uid in list(self.active_chats.get(chat_id, [])):
            if uid != user_id:
                continue
            try:
                await connection.send_json(message)
                delivered = True
            except Exception as e:  # noqa: BLE001 - one dead socket must not stop the rest
                from app.logging_config import get_logger

                get_logger(__name__).warning(
                    "failed_to_send_to_user_in_chat",
                    chat_id=chat_id,
                    user_id=user_id,
                    error=str(e),
                )
                dead.append(connection)
        for socket in dead:
            self.disconnect(socket, chat_id)
        return delivered

    async def send_to_user(self, message: dict, user_id: str):
        raise NotImplementedError

    async def is_user_connected(self, message: dict, user_id: str):
        raise NotImplementedError


manager = ConnectionManager()
