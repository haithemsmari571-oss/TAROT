from app.exceptions.domain import DomainError


class ChatNotFound(DomainError):
    status_code = 404
    message = "Chat not found"


class ChatSessionNotFound(DomainError):
    status_code = 404
    message = "Chat session not found"


class SessionIntervalNotFound(DomainError):
    status_code = 404
    message = "Chat session interval not found"
