import asyncio
import json
from datetime import datetime
from typing import Optional
from fastapi import APIRouter, Depends, Query, WebSocket, WebSocketDisconnect
from sqlalchemy import or_
from sqlalchemy.orm import Session
import jwt
from pydantic import ValidationError

from app.config import get_app_settings
from app.logging_config import bind_user_to_context, get_logger
from app.notification_manager import notification_manager
from app.database.client import get_db
from app.dependencies.get_current_user import get_current_user
from app.models.user import User
from app.models.notification import Notification
from app.schemas.notification import NotificationOut, PaginatedNotifications
from app.enums.notification_type import NotificationType

router = APIRouter()
settings = get_app_settings()
logger = get_logger(__name__)


CHAT_NOTIFICATION_TYPES = {
    NotificationType.CHAT_ACCEPTED,
    NotificationType.CHAT_ENDED,
    NotificationType.CHAT_REQUESTED,
    NotificationType.CHAT_REQUEST_CANCELLED,
    NotificationType.CHAT_PAUSED,
    NotificationType.CHAT_PAUSED_INSUFFICIENT_FUNDS,
    NotificationType.CHAT_RESUMED,
}

PAYMENT_NOTIFICATION_TYPES = {
    NotificationType.TOPUP_SUCCESS,
    NotificationType.INSUFFICIENT_BALANCE_AFTER_PAYMENT,
    NotificationType.PAYMENT_SUCCESS_CHAT_NEEDS_MANUAL_RESUME,
    NotificationType.RESUME_ERROR_AFTER_PAYMENT,
    NotificationType.BALANCE_LOW,
}


@router.get("/")
def get_notifications_endpoint(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    type: Optional[str] = Query(None, description="Filter by notification type"),
    is_read: Optional[bool] = Query(None, description="Filter by read status"),
    tab: Optional[str] = Query(None, description="Filter tab: unread, chats, payments"),
):
    """Get paginated notifications for the current user with filters"""
    query = db.query(Notification).filter(Notification.user_id == user.id)

    # Apply type filter
    if type:
        query = query.filter(Notification.type == type)

    # Apply read status filter
    if is_read is not None:
        query = query.filter(Notification.is_read == is_read)

    # Apply tab filter
    if tab == "unread":
        query = query.filter(Notification.is_read == False)
    elif tab == "chats":
        query = query.filter(Notification.type.in_(CHAT_NOTIFICATION_TYPES))
    elif tab == "payments":
        query = query.filter(Notification.type.in_(PAYMENT_NOTIFICATION_TYPES))

    # Get total count before pagination
    total = query.count()

    # Get unread count (always against full user scope)
    unread_count = (
        db.query(Notification)
        .filter(Notification.user_id == user.id, Notification.is_read == False)
        .count()
    )

    # Apply pagination
    total_pages = max(1, (total + limit - 1) // limit)
    offset = (page - 1) * limit

    notifications = (
        query.order_by(Notification.created_at.desc()).offset(offset).limit(limit).all()
    )

    notifications_list = [NotificationOut.model_validate(n) for n in notifications]

    return PaginatedNotifications(
        notifications=notifications_list,
        total=total,
        page=page,
        limit=limit,
        total_pages=total_pages,
        unread_count=unread_count,
    ).model_dump()


@router.post("/read-all")
def mark_all_notifications_read_endpoint(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Mark all notifications as read for the current user"""
    result = (
        db.query(Notification)
        .filter(
            Notification.user_id == user.id,
            Notification.is_read == False,
        )
        .update({"is_read": True})
    )
    db.commit()

    return {"success": True, "marked_count": result}


@router.post("/{notification_id}/read")
def mark_notification_read_endpoint(
    notification_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Mark a notification as read"""
    notification = (
        db.query(Notification)
        .filter(
            Notification.id == notification_id,
            Notification.user_id == user.id,
        )
        .first()
    )

    if not notification:
        return {"error": "Notification not found"}, 404

    notification.is_read = True
    db.commit()

    return {"success": True}


@router.websocket("/ws")
async def notification_websocket(
    websocket: WebSocket,
    db: Session = Depends(get_db),
):
    """WebSocket endpoint for real-time notifications"""
    await websocket.accept()

    try:
        # Authentication
        auth_data = await asyncio.wait_for(
            fut=websocket.receive_json(),
            timeout=settings.SOCKET_AUTH_TIMEOUT,
        )

        if auth_data.get("type") != "auth":
            await websocket.close(code=4001, reason="Auth required")
            return

        user = await authenticate_websocket_user(auth_data.get("token"), db)

        # Bind user to request context for logging
        bind_user_to_context(user.id)

        await websocket.send_json({"type": "auth_success"})
        await notification_manager.connect(websocket, user.id)

        logger.info(
            "notification_websocket_connected",
            user_id=user.id,
            email=user.email,
        )

        # Keep connection alive and listen for ping/pong
        while True:
            try:
                data = await websocket.receive_json()

                # Handle ping/pong to keep connection alive
                if data.get("type") == "ping":
                    await websocket.send_json({"type": "pong"})

            except json.JSONDecodeError:
                await websocket.send_json(
                    {
                        "error": "true",
                        "message": "ERROR: malformed data, expected JSON",
                    }
                )
                continue
            except TypeError:
                await websocket.send_json(
                    {
                        "error": "true",
                        "message": "ERROR: malformed data, expected JSON",
                    }
                )
                continue

    except ValidationError:
        await websocket.close(code=4002, reason="Malformed auth data")
    except asyncio.TimeoutError:
        await websocket.close(code=4001, reason="Auth timeout")
    except WebSocketDisconnect:
        if 'user' in locals():
            notification_manager.disconnect(user.id)
            logger.info(
                "notification_websocket_disconnected",
                user_id=user.id,
            )
    except jwt.PyJWTError:
        await websocket.close(code=4001, reason="Invalid token")
    except ValueError as e:
        await websocket.close(code=4003, reason=str(e))
    except Exception as e:
        logger.error(
            "notification_websocket_error",
            error=str(e),
            error_type=e.__class__.__name__,
        )
        await websocket.close(code=1011, reason="Internal server error")


async def authenticate_websocket_user(token, db):
    """
    Authenticate WebSocket connection using JWT token.
    Raises various jwt exceptions that should be caught by caller.
    """
    try:
        payload = jwt.decode(
            token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM]
        )
        user_id: str = payload.get("sub")

        if not user_id:
            logger.warning("websocket_auth_failed_missing_user_id")
            raise ValueError("Invalid token: missing user ID")

        user = db.query(User).filter(User.id == user_id).first()

        if not user:
            logger.warning(
                "websocket_auth_failed_user_not_found",
                user_id=user_id,
            )
            raise ValueError("User not found")

        logger.debug(
            "websocket_auth_success",
            user_id=user.id,
            email=user.email,
        )

        return user

    except jwt.ExpiredSignatureError:
        logger.warning("websocket_auth_failed_token_expired")
        raise
    except jwt.InvalidTokenError as e:
        logger.warning(
            "websocket_auth_failed_invalid_token",
            error=str(e),
        )
        raise
    except ValueError:
        raise
    except Exception as e:
        logger.error(
            "websocket_auth_unexpected_error",
            error=str(e),
            error_type=e.__class__.__name__,
        )
        raise ValueError("Authentication error")
