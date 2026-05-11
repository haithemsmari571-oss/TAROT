"""Base event handler interface"""

from abc import ABC, abstractmethod
from typing import Any, Dict
from fastapi import WebSocket
from sqlalchemy.orm import Session


class BaseEventHandler(ABC):
    """Base class for all event handlers"""

    def __init__(self, websocket: WebSocket, db: Session, chat_id: int, user_id: int):
        self.websocket = websocket
        self.db = db
        self.chat_id = chat_id
        self.user_id = user_id

    @abstractmethod
    async def handle(self, event_data: Dict[str, Any]) -> None:
        """Handle the event - must be implemented by subclasses"""
        pass

    async def send_event(self, event_type: str, data: Dict[str, Any]) -> None:
        """Helper to send events to client"""
        await self.websocket.send_json({"event": event_type, **data})

    async def send_error(self, message: str) -> None:
        """Helper to send error messages"""
        await self.send_event("error", {"message": message})
