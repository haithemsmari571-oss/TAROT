from datetime import datetime
from typing import Optional
from pydantic import BaseModel, ConfigDict

from app.enums.notification_type import NotificationType


class NotificationBase(BaseModel):
    type: NotificationType
    title: str
    message: str
    data: Optional[dict] = None


class NotificationCreate(NotificationBase):
    user_id: int


class NotificationOut(NotificationBase):
    id: int
    user_id: int
    is_read: bool
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class PaginatedNotifications(BaseModel):
    notifications: list[NotificationOut]
    total: int
    page: int
    limit: int
    total_pages: int
    unread_count: int
