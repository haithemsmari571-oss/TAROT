"""Event type definitions for chat system"""

from enum import Enum


class ChatEventType(str, Enum):
    """Event types for chat WebSocket communication"""

    # Client -> Server events
    MESSAGE_SEND = "message_send"
    TYPING_START = "typing_start"
    TYPING_STOP = "typing_stop"

    # Server -> Client events
    MESSAGE_RECEIVED = "message_received"
    SESSION_STARTED = "session_started"
    SESSION_ENDING_SOON = "session_ending_soon"
    SESSION_ENDED = "session_ended"
    BALANCE_WARNING = "balance_warning"
    BALANCE_CRITICAL = "balance_critical"
    BALANCE_INSUFFICIENT = "balance_insufficient"

    # System events
    AUTH_SUCCESS = "auth_success"
    AUTH_FAILED = "auth_failed"
    ERROR = "error"
