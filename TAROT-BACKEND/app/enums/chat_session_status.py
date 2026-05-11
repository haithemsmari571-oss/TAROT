from enum import Enum


class ChatSessionStatus(str, Enum):
    ACTIVE = "ACTIVE"
    DISCONNECTED = "DISCONNECTED"
    COMPLETED = "COMPLETED"
