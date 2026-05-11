from enum import Enum


class ChatStatus(str, Enum):
    REQUESTED = "REQUESTED"
    ACTIVE = "ACTIVE"
    ENDED = "ENDED"
    PAUSED = "PAUSED"
    ARCHIVED = "ARCHIVED"
    BLOCKED = "BLOCKED"
