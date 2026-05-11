from enum import Enum


class ChatTerminationReason(str, Enum):
    MANUAL_EXIT = "MANUAL_EXIT"
    SOCKET_LOST = "SOCKET_LOST"
    TIMEOUT = "TIMEOUT"  # heartbeat failed
    INSUFFICIENT_FUNDS = "INSUFFICIENT_FUNDS"
    USER_INITIATED = "USER_INITIATED"  # User paused for top-up
    PAUSE_FOR_TOPUP = "PAUSE_FOR_TOPUP"  # Session paused for top-up
    PAUSE_TIMEOUT = "PAUSE_TIMEOUT"  # Paused session exceeded 30 minute timeout
    CLIENT_DISCONNECTED = "CLIENT_DISCONNECTED"  # Client disconnected for too long
