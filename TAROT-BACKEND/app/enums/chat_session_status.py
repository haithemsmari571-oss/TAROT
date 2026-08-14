from enum import Enum


class ChatSessionStatus(str, Enum):
    REQUESTED = "REQUESTED"
    ACTIVE = "ACTIVE"
    DISCONNECTED = "DISCONNECTED"
    COMPLETED = "COMPLETED"
    CANCELLED = "CANCELLED"
