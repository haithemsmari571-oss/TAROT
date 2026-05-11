from enum import Enum


class ChatSessionTrigger(str, Enum):
    INITIAL_START = "INITIAL_START"
    RECONNECT = "RECONNECT"
    RESUME_AFTER_TOPUP = "RESUME_AFTER_TOPUP"
