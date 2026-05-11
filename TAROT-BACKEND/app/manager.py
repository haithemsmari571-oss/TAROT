from collections import defaultdict
from fastapi import WebSocket


class ConnectionManager:
    def __init__(self):
        self.active_chats: dict[str, list[WebSocket]] = defaultdict(list)

    async def connect(self, websocket: WebSocket, chat_id: str):
        self.active_chats[chat_id].append(websocket)

    def disconnect(self, websocket: WebSocket, chat_id: str):
        if websocket in self.active_chats[chat_id]:
            self.active_chats[chat_id].remove(websocket)
            if not self.active_chats[chat_id]:
                del self.active_chats[chat_id]

    async def send_to_chat(self, message: dict, chat_id: str):
        """Sends a message to everyone in a specific chat"""
        if chat_id in self.active_chats:
            for connection in self.active_chats[chat_id]:
                await connection.send_json(message)

    async def send_to_user(self, message: dict, user_id: str):
        raise NotImplementedError

    async def is_user_connected(self, message: dict, user_id: str):
        raise NotImplementedError


manager = ConnectionManager()
