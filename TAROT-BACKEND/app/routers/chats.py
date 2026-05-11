from datetime import datetime
import json
from typing import Optional
from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    WebSocket,
    WebSocketDisconnect,
)
import jwt
import asyncio
from fastapi.responses import JSONResponse
from pydantic import ValidationError
from app.config import get_app_settings
from app.logging_config import bind_user_to_context, get_logger
from app.manager import manager
from app.database.client import get_db
from sqlalchemy.orm import Session
from app.dependencies.get_current_user import get_current_user

from app.models.chat import Chat
from app.models.user import User
from app.models.message import Message
from app.models.chat_session import ChatSession
from app.models.session_intervals import SessionInterval
from app.models.settings import Settings
from app.enums.chat_status import ChatStatus
from app.enums.chat_termination_reason import ChatTerminationReason
from app.schemas.chat import (
    ChatStart,
    ChatUpdate,
    SocketAuthData,
    SocketMessageData,
    MessageOut,
)
from app.services.chats import (
    get_chats,
    req_start_chat,
    save_message,
    update_chat_status,
)
from sqlalchemy import desc

router = APIRouter()
settings = get_app_settings()
logger = get_logger(__name__)


@router.post("/request")
async def requset_chat_endpoint(
    chat_data: ChatStart,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    # Check if user has any paused chats
    paused_chat = (
        db.query(Chat)
        .filter(Chat.user_id == user.id, Chat.status == ChatStatus.PAUSED)
        .first()
    )

    if paused_chat:
        return JSONResponse(
            content={
                "detail": "You have a paused chat session. Please resume or end it before starting a new chat.",
                "paused_chat_id": paused_chat.id,
            },
            status_code=400,
        )

    # Create/update chat and get chat_id
    chat_id = req_start_chat(db, user.id, chat_data)

    # Register this request with the session manager (for tracking pending requests)
    from app.services.session_manager import get_session_manager

    get_session_manager().register_request(chat_id)

    # Send notification to psychic about new chat request
    from app.notification_manager import notification_manager
    from app.models.notification import Notification
    from app.enums.notification_type import NotificationType
    from app.enums.role import Role

    # Get the psychic user
    psychic = db.query(User).filter(User.id == chat_data.psychic_id).first()

    # Get all admins and superadmins
    admins = db.query(User).filter(User.role.in_([Role.ADMIN, Role.SUPERADMIN])).all()

    # Build list of users to notify (psychic + all admins)
    users_to_notify = []
    if psychic:
        users_to_notify.append(psychic)
    users_to_notify.extend(admins)

    # Create database notifications for all recipients
    for recipient in users_to_notify:
        # Customize message based on recipient
        is_psychic = recipient.id == chat_data.psychic_id
        message = (
            f"{user.username} has requested a chat with you!"
            if is_psychic
            else f"{user.username} has requested a chat with {psychic.username if psychic else 'a psychic'}!"
        )

        notification = Notification(
            user_id=recipient.id,
            type=NotificationType.CHAT_REQUESTED,
            title="New Chat Request",
            message=message,
            data={
                "chat_id": chat_id,
                "psychic_id": psychic.id if psychic else None,
                "client_id": user.id,
                "client_name": user.username,
            },
        )
        db.add(notification)

    # Commit all notifications at once
    db.commit()

    # Send real-time WebSocket notifications to all recipients
    for recipient in users_to_notify:
        is_psychic = recipient.id == chat_data.psychic_id
        message = (
            f"{user.username} has requested a chat with you!"
            if is_psychic
            else f"{user.username} has requested a chat with {psychic.username if psychic else 'a psychic'}!"
        )

        notification_data = {
            "type": "notification",
            "notification_type": NotificationType.CHAT_REQUESTED,
            "title": "New Chat Request",
            "message": message,
            "data": {
                "chat_id": chat_id,
                "psychic_id": psychic.id if psychic else None,
                "client_id": user.id,
                "client_name": user.username,
            },
            "timestamp": datetime.now().isoformat(),
        }
        await notification_manager.send_to_user(notification_data, recipient.id)

    return JSONResponse(content=None, status_code=201)


@router.get("/")
def get_chats_endpoint(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):

    chats = get_chats(db, user.id)
    chats_json = [chat.model_dump() for chat in chats]

    return JSONResponse(content=chats_json, status_code=201)


@router.get("/my-chats")
def get_my_chats_endpoint(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get all chats for the current user with full user details"""
    from app.enums.role import Role

    # Query chats based on user role
    if user.role == Role.PSYCHIC:
        # Psychics see chats where they are the psychic
        chats_query = db.query(Chat).filter(Chat.psychic_id == user.id)
    else:
        # Regular users see chats where they are the client
        chats_query = db.query(Chat).filter(Chat.user_id == user.id)

    chats = chats_query.order_by(desc(Chat.updated_at)).all()

    # Build response with user details
    chats_with_details = []
    for chat in chats:
        # Get the client and psychic user objects
        client = db.query(User).filter(User.id == chat.user_id).first()
        psychic = db.query(User).filter(User.id == chat.psychic_id).first()

        chat_dict = {
            "id": chat.id,
            "user_id": chat.user_id,
            "psychic_id": chat.psychic_id,
            "status": chat.status.value,
            "created_at": chat.created_at.isoformat() if chat.created_at else None,
            "updated_at": chat.updated_at.isoformat() if chat.updated_at else None,
            # Client details
            "client_id": client.id if client else None,
            "client_username": client.username if client else None,
            "client_email": client.email if client else None,
            # Psychic details
            "psychic_username": psychic.username if psychic else None,
            "psychic_email": psychic.email if psychic else None,
        }
        chats_with_details.append(chat_dict)

    return JSONResponse(content=chats_with_details, status_code=200)


@router.get("/{chat_id}/details")
def get_chat_details_endpoint(
    chat_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get chat details including psychic information for admin access"""
    from app.enums.role import Role

    # Verify user has access to this chat
    chat = db.query(Chat).filter(Chat.id == chat_id).first()
    if not chat:
        return JSONResponse(content={"detail": "Chat not found"}, status_code=404)

    # Check if user is part of the chat (or is admin/superadmin)
    if user.role not in [Role.ADMIN, Role.SUPERADMIN]:
        if user.id not in (chat.user_id, chat.psychic_id):
            return JSONResponse(content={"detail": "Unauthorized"}, status_code=403)

    # Get psychic and client details
    psychic = db.query(User).filter(User.id == chat.psychic_id).first()
    client = db.query(User).filter(User.id == chat.user_id).first()

    # Generate JWT token for the psychic (for admin to connect as psychic)
    psychic_token = None
    if user.role in [Role.ADMIN, Role.SUPERADMIN] and psychic:
        import jwt
        from datetime import datetime, timedelta

        token_payload = {
            "sub": str(psychic.id),
            "exp": datetime.utcnow() + timedelta(hours=24),
        }
        psychic_token = jwt.encode(
            token_payload,
            settings.JWT_SECRET_KEY,
            algorithm=settings.JWT_ALGORITHM,
        )

    chat_details = {
        "id": chat.id,
        "status": chat.status.value,
        "user_id": chat.user_id,
        "psychic_id": chat.psychic_id,
        "created_at": chat.created_at.isoformat() if chat.created_at else None,
        "updated_at": chat.updated_at.isoformat() if chat.updated_at else None,
        "psychic": {
            "id": psychic.id,
            "username": psychic.username,
            "email": psychic.email,
            "price_per_second": psychic.price_per_second,
        }
        if psychic
        else None,
        "client": {
            "id": client.id,
            "username": client.username,
            "email": client.email,
        }
        if client
        else None,
        "psychic_token": psychic_token,
    }

    return JSONResponse(content=chat_details, status_code=200)


@router.get("/{chat_id}/messages")
def get_chat_messages_endpoint(
    chat_id: int,
    limit: int = 100,
    offset: int = 0,
    before_id: Optional[int] = None,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get messages for a chat with pagination support.

    - before_id: Cursor-based pagination — returns messages with id < before_id (oldest-first)
    - offset < 0: Returns the last abs(offset) messages (newest first, then reversed)
    - offset >= 0 (default): Standard pagination from the beginning
    """
    # Verify user has access to this chat
    chat = db.query(Chat).filter(Chat.id == chat_id).first()
    if not chat:
        return JSONResponse(content={"detail": "Chat not found"}, status_code=404)

    # Check if user is part of the chat (or is admin/superadmin)
    from app.enums.role import Role

    if user.role not in [Role.ADMIN, Role.SUPERADMIN]:
        if user.id not in (chat.user_id, chat.psychic_id):
            return JSONResponse(content={"detail": "Unauthorized"}, status_code=403)

    # Get total count
    total_count = db.query(Message).filter(Message.chat_id == chat_id).count()

    if before_id is not None:
        # Cursor-based: fetch messages BEFORE this ID (for "load older")
        messages = (
            db.query(Message)
            .filter(Message.chat_id == chat_id)
            .filter(Message.id < before_id)
            .order_by(Message.created_at.desc())
            .limit(limit)
            .all()
        )
        messages.reverse()
    elif offset < 0:
        # Negative offset: fetch the LAST abs(offset) messages (for initial latest view)
        messages = (
            db.query(Message)
            .filter(Message.chat_id == chat_id)
            .order_by(Message.created_at.desc())
            .limit(abs(offset))
            .all()
        )
        messages.reverse()
    else:
        # Standard offset-based pagination (oldest-first, backward compatible)
        messages = (
            db.query(Message)
            .filter(Message.chat_id == chat_id)
            .order_by(Message.created_at.asc())
            .offset(offset)
            .limit(limit)
            .all()
        )

    messages_json = [
        MessageOut.model_validate(msg).model_dump(mode="json") for msg in messages
    ]

    return JSONResponse(
        content={
            "messages": messages_json,
            "total": total_count,
            "offset": offset,
            "limit": limit,
        },
        status_code=200,
    )


@router.get("/{chat_id}/session-time")
def get_chat_session_time_endpoint(
    chat_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get the current session duration in seconds and estimated cost for an active chat"""
    from app.enums.role import Role
    from app.services.session_manager import get_session_manager

    # Verify user has access to this chat
    chat = db.query(Chat).filter(Chat.id == chat_id).first()
    if not chat:
        return JSONResponse(content={"detail": "Chat not found"}, status_code=404)

    # Check if user is part of the chat (or is admin/superadmin)
    if user.role not in [Role.ADMIN, Role.SUPERADMIN]:
        if user.id not in (chat.user_id, chat.psychic_id):
            return JSONResponse(content={"detail": "Unauthorized"}, status_code=403)

    # Get session info from SessionManager
    session_manager = get_session_manager()
    session_info = session_manager.get_session_info(chat_id)

    if not session_info:
        # No active session
        client_balance = float(chat.user.balance) if chat.user else 0.0
        return JSONResponse(
            content={
                "elapsed_seconds": 0,
                "estimated_cost": 0.0,
                "price_per_second": chat.psychic.price_per_second or 0.0,
                "client_balance": client_balance,
                "remaining_seconds": 0,
            },
            status_code=200,
        )

    # Return session info from SessionManager
    return JSONResponse(
        content={
            "elapsed_seconds": session_info.elapsed_seconds,
            "estimated_cost": session_info.estimated_cost,
            "price_per_second": session_info.rate_per_second,
            "client_balance": session_info.client_balance,
            "remaining_seconds": session_info.remaining_seconds,
            "total_seconds": session_info.elapsed_seconds,  # For backwards compatibility
        },
        status_code=200,
    )


# TODO: allow only psychic
@router.post("/{chat_id}/status")
async def update_chat_status_endpoint(
    chat: ChatUpdate,
    chat_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    from app.enums.role import Role
    from app.services.session_manager import (
        get_session_manager,
        InsufficientBalanceError,
    )

    # Get chat details first to verify access
    chat_obj = db.query(Chat).filter(Chat.id == chat_id).first()
    if not chat_obj:
        return JSONResponse(content={"detail": "Chat not found"}, status_code=404)

    # Check if user has permission to update this chat
    # Allow if: 1) User is the psychic, 2) User is the client, 3) User is admin/superadmin
    is_admin = user.role in [Role.ADMIN, Role.SUPERADMIN]
    is_participant = user.id in (chat_obj.user_id, chat_obj.psychic_id)

    if not is_admin and not is_participant:
        return JSONResponse(
            content={"detail": "You don't have permission to update this chat"},
            status_code=403,
        )

    session_manager = get_session_manager()

    # Handle status change to ACTIVE (psychic accepts chat)
    if chat.status == ChatStatus.ACTIVE and chat_obj:
        try:
            # Use SessionManager to start the session
            session_info = await session_manager.start_session(chat_id)

            # Send notification to client that psychic has accepted
            from app.notification_manager import notification_manager
            from app.models.notification import Notification
            from app.enums.notification_type import NotificationType

            psychic_user = db.query(User).filter(User.id == chat_obj.psychic_id).first()
            psychic_name = psychic_user.username if psychic_user else "Psychic"

            notification = Notification(
                user_id=chat_obj.user_id,
                type=NotificationType.CHAT_ACCEPTED,
                title="Chat Accepted",
                message=f"Your chat request has been accepted!",
                data={
                    "chat_id": chat_id,
                    "psychic_id": chat_obj.psychic_id,
                    "chat_status": ChatStatus.ACTIVE.value,
                    "psychic_rate_per_second": chat_obj.psychic.price_per_second,
                    "client_balance": session_info.client_balance,
                    "session_started_at": session_info.started_at,
                },
            )
            db.add(notification)
            db.commit()

            # Send real-time notification via WebSocket
            notification_data = {
                "type": "notification",
                "notification_type": NotificationType.CHAT_ACCEPTED,
                "title": "Chat Accepted",
                "message": f"{psychic_name} has accepted your chat request!",
                "data": {
                    "chat_id": chat_id,
                    "psychic_id": chat_obj.psychic_id,
                    "chat_status": ChatStatus.ACTIVE.value,
                    "session_started_at": session_info.started_at,
                    "psychic_rate_per_second": float(chat_obj.psychic.price_per_second),
                    "client_balance": float(session_info.client_balance),
                    "psychic_name": psychic_name,
                },
                "timestamp": datetime.now().isoformat(),
            }
            await notification_manager.send_to_user(notification_data, chat_obj.user_id)

            logger.info(
                "session_started_via_api",
                chat_id=chat_id,
                remaining_seconds=session_info.remaining_seconds,
            )

        except InsufficientBalanceError as e:
            logger.warning(
                "insufficient_balance_to_start_session", chat_id=chat_id, error=str(e)
            )
            return JSONResponse(content={"detail": str(e)}, status_code=400)

    # Handle status change to ENDED (user/psychic ends chat)
    elif chat.status == ChatStatus.ENDED and chat_obj:
        # Use SessionManager to end the session
        await session_manager.end_session(
            chat_id, ChatTerminationReason.MANUAL_EXIT, ended_by_user_id=user.id
        )

        # Get final session info for notifications
        session_info = session_manager.get_session_info(chat_id)
        elapsed_seconds = session_info.elapsed_seconds if session_info else 0
        estimated_cost = session_info.estimated_cost if session_info else 0.0

        # Create notifications for both users
        from app.notification_manager import notification_manager
        from app.models.notification import Notification
        from app.enums.notification_type import NotificationType

        client_notification = Notification(
            user_id=chat_obj.user_id,
            type=NotificationType.CHAT_ENDED,
            title="Chat Ended",
            message="Your chat session has ended.",
            data={
                "chat_id": chat_id,
                "ended_by": user.id,
                "reason": "user_initiated",
                "elapsed_seconds": elapsed_seconds,
                "estimated_cost": round(estimated_cost, 2),
            },
        )
        db.add(client_notification)

        psychic_notification = Notification(
            user_id=chat_obj.psychic_id,
            type=NotificationType.CHAT_ENDED,
            title="Chat Ended",
            message="The chat session has ended.",
            data={
                "chat_id": chat_id,
                "ended_by": user.id,
                "reason": "user_initiated",
                "elapsed_seconds": elapsed_seconds,
                "estimated_cost": round(estimated_cost, 2),
            },
        )
        db.add(psychic_notification)
        db.commit()

        # Send real-time notifications via WebSocket
        ended_notification_data = {
            "type": "notification",
            "notification_type": NotificationType.CHAT_ENDED,
            "title": "Chat Ended",
            "message": "The chat session has ended.",
            "data": {
                "chat_id": chat_id,
                "ended_by": user.id,
                "ended_by_name": user.username,
                "reason": "user_initiated",
                "elapsed_seconds": elapsed_seconds,
                "estimated_cost": round(estimated_cost, 2),
            },
            "timestamp": datetime.now().isoformat(),
        }
        await notification_manager.send_to_user(
            ended_notification_data, chat_obj.user_id
        )
        await notification_manager.send_to_user(
            ended_notification_data, chat_obj.psychic_id
        )

        # Send and store termination system message
        from app.services.chats import broadcast_system_message

        termination_message = get_termination_message(
            db, chat_id, ended_by_user_id=user.id, chat=chat_obj
        )
        await broadcast_system_message(db, chat_id, termination_message)

    elif chat.status == ChatStatus.ARCHIVED and chat_obj:
        # Only the client who made the request can cancel it
        if user.id != chat_obj.user_id:
            return JSONResponse(
                content={"detail": "Only the client can cancel their chat request"},
                status_code=403,
            )

        if chat_obj.status != ChatStatus.REQUESTED:
            return JSONResponse(
                content={"detail": "Only pending requests can be cancelled"},
                status_code=400,
            )

        # Unregister from session manager if tracked
        session_manager.unregister_request(chat_id)

        # Update chat status
        chat_obj.status = ChatStatus.ARCHIVED
        db.commit()

        logger.info("chat_request_cancelled", chat_id=chat_id, user_id=user.id)

        # Send notification to psychic
        from app.notification_manager import notification_manager
        from app.models.notification import Notification
        from app.enums.notification_type import NotificationType

        psychic_notification = Notification(
            user_id=chat_obj.psychic_id,
            type=NotificationType.CHAT_REQUEST_CANCELLED,
            title="Chat Request Cancelled",
            message=f"{user.username} has cancelled their chat request.",
            data={
                "chat_id": chat_id,
                "client_id": user.id,
            },
        )
        db.add(psychic_notification)
        db.commit()

        notification_data = {
            "type": "notification",
            "notification_type": NotificationType.CHAT_REQUEST_CANCELLED,
            "title": "Chat Request Cancelled",
            "message": f"{user.username} has cancelled their chat request.",
            "data": {
                "chat_id": chat_id,
                "client_id": user.id,
            },
            "timestamp": datetime.now().isoformat(),
        }
        await notification_manager.send_to_user(notification_data, chat_obj.psychic_id)

        # Broadcast and store system message
        from app.services.chats import broadcast_system_message

        await broadcast_system_message(db, chat_id, "Chat request cancelled by client.")

    return JSONResponse(content=None, status_code=201)


@router.post("/{chat_id}/topup")
async def topup_chat_balance(
    chat_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """
    Pause chat (via SessionManager) and create Stripe checkout session for top-up.
    Automatically calculates amount for 15 minutes based on psychic rate.
    Returns Stripe checkout URL.

    This is the ONLY way to pause a chat - prevents abuse.
    """
    from app.notification_manager import notification_manager
    from app.models.notification import Notification
    from app.enums.notification_type import NotificationType
    from app.services.session_manager import get_session_manager, SessionNotFoundError
    from app.schemas.chat import TopUpResponse
    import stripe

    # Get chat details
    chat = db.query(Chat).filter(Chat.id == chat_id).first()
    if not chat:
        return JSONResponse(content={"detail": "Chat not found"}, status_code=404)

    # Verify user is the client
    if user.id != chat.user_id:
        return JSONResponse(
            content={"detail": "Only client can top-up their chat"}, status_code=403
        )

    # Check if chat is ACTIVE or PAUSED (can't top-up ended chats)
    if chat.status not in [ChatStatus.ACTIVE, ChatStatus.PAUSED]:
        return JSONResponse(
            content={"detail": f"Cannot top-up chat with status {chat.status}"},
            status_code=400,
        )

    # Calculate top-up amount for 15 minutes
    psychic_rate_per_second = chat.psychic.price_per_second
    minutes_to_topup = 15
    points_needed = int(psychic_rate_per_second * 60 * minutes_to_topup)

    # Ensure minimum top-up of at least 100 points
    if points_needed < 100:
        points_needed = 100

    elapsed_seconds = 0
    estimated_cost = 0.0

    # Pause the chat if it's currently ACTIVE using SessionManager
    if chat.status == ChatStatus.ACTIVE:
        session_mgr = get_session_manager()
        try:
            # Use SessionManager to pause - this will broadcast WebSocket events
            result = await session_mgr.pause_session(chat_id)
            elapsed_seconds = result["elapsed_seconds"]
            estimated_cost = elapsed_seconds * psychic_rate_per_second

            logger.info(
                "chat_paused_for_topup_via_session_manager",
                chat_id=chat_id,
                elapsed_seconds=elapsed_seconds,
                estimated_cost=estimated_cost,
            )

        except SessionNotFoundError as e:
            logger.error(
                "session_not_found_for_topup",
                chat_id=chat_id,
                error=str(e),
            )
            return JSONResponse(
                content={"detail": "Active session not found"}, status_code=404
            )
        except Exception as e:
            logger.error(
                "error_pausing_for_topup",
                chat_id=chat_id,
                error=str(e),
                exc_info=True,
            )
            return JSONResponse(
                content={"detail": "Failed to pause session"}, status_code=500
            )

        # Send supplementary notifications (SessionManager already sent WebSocket events)
        client_notification = Notification(
            user_id=chat.user_id,
            type=NotificationType.CHAT_PAUSED,
            title="Chat Paused for Top-Up",
            message="Chat paused while you add balance. You'll be redirected to payment.",
            data={
                "chat_id": chat_id,
                "reason": "USER_TOPUP",
                "elapsed_seconds": int(elapsed_seconds),
                "estimated_cost": round(estimated_cost, 2),
            },
        )
        db.add(client_notification)

        psychic_notification = Notification(
            user_id=chat.psychic_id,
            type=NotificationType.CHAT_PAUSED,
            title="Chat Paused",
            message="Client is adding balance. Session will resume shortly.",
            data={
                "chat_id": chat_id,
                "reason": "CLIENT_TOPUP",
                "elapsed_seconds": int(elapsed_seconds),
                "estimated_cost": round(estimated_cost, 2),
            },
        )
        db.add(psychic_notification)

        db.commit()

        # Send notification toasts (WebSocket session events already sent by SessionManager)
        pause_notification = {
            "type": "notification",
            "notification_type": NotificationType.CHAT_PAUSED,
            "title": "Chat Paused for Top-Up",
            "message": "Chat paused while adding balance",
            "data": {
                "chat_id": chat_id,
                "reason": "USER_TOPUP",
                "elapsed_seconds": int(elapsed_seconds),
                "estimated_cost": round(estimated_cost, 2),
            },
            "timestamp": datetime.now().isoformat(),
        }

        await notification_manager.send_to_user(pause_notification, chat.user_id)
        await notification_manager.send_to_user(pause_notification, chat.psychic_id)

    # Create Stripe checkout session
    try:
        # Get Stripe API key from settings
        stripe_api_key_setting = (
            db.query(Settings).filter(Settings.key == "stripe_api_key").first()
        )
        if not stripe_api_key_setting or not stripe_api_key_setting.value:
            raise HTTPException(
                status_code=500, detail="Stripe API key not configured in settings"
            )

        stripe.api_key = stripe_api_key_setting.value

        # Get unit price
        unit_price_setting = (
            db.query(Settings).filter(Settings.key == "unit_price_cents").first()
        )
        if not unit_price_setting:
            raise HTTPException(
                status_code=500, detail="Unit price not configured in settings"
            )

        unit_price_cents = int(unit_price_setting.value)
        total_amount_cents = unit_price_cents * points_needed

        # Construct return URL
        return_url = f"/chats?chat_id={chat_id}&action=resume"
        success_url = f"{settings.FRONT_BASE_URL}{return_url}&status=success"

        # Create Stripe checkout session
        session = stripe.checkout.Session.create(
            payment_method_types=["card"],
            line_items=[
                {
                    "price_data": {
                        "currency": "usd",
                        "product_data": {
                            "name": f"{points_needed} Tarot Points (15 min top-up)",
                            "description": f"Top-up for {minutes_to_topup} minutes of chat time",
                        },
                        "unit_amount": unit_price_cents,
                    },
                    "quantity": points_needed,
                }
            ],
            mode="payment",
            metadata={
                "user_id": str(user.id),
                "points": str(points_needed),
                "chat_id": str(chat_id),
                "topup_minutes": str(minutes_to_topup),
            },
            success_url=success_url,
            cancel_url=f"{settings.FRONT_BASE_URL}/chats?chat_id={chat_id}&status=cancelled",
        )

        logger.info(
            "topup_checkout_session_created",
            user_id=user.id,
            chat_id=chat_id,
            points_amount=points_needed,
            total_amount_cents=total_amount_cents,
            estimated_minutes=minutes_to_topup,
            session_id=session.id,
        )

        return TopUpResponse(
            url=session.url,
            points_amount=points_needed,
            estimated_minutes=minutes_to_topup,
        )

    except HTTPException:
        raise
    except stripe.error.StripeError as e:
        logger.error(
            "stripe_error_topup",
            user_id=user.id,
            chat_id=chat_id,
            error=str(e),
            error_type=e.__class__.__name__,
        )
        raise HTTPException(
            status_code=500, detail=f"Payment processing error: {str(e)}"
        )
    except Exception as e:
        logger.error(
            "topup_error",
            user_id=user.id,
            chat_id=chat_id,
            error=str(e),
            error_type=e.__class__.__name__,
            exc_info=True,
        )
        raise HTTPException(status_code=500, detail="Failed to create top-up session")


@router.post("/{chat_id}/resume")
async def resume_paused_chat(
    chat_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """
    Resume a paused chat session if the user has sufficient balance.
    Called from the chat UI when user clicks "Resume" on a paused chat.
    """
    from app.services.session_manager import (
        get_session_manager,
        InsufficientBalanceError,
        SessionNotFoundError,
    )

    chat = db.query(Chat).filter(Chat.id == chat_id).first()
    if not chat:
        return JSONResponse(content={"detail": "Chat not found"}, status_code=404)

    if user.id != chat.user_id:
        return JSONResponse(
            content={"detail": "Only the client can resume this chat"},
            status_code=403,
        )

    if chat.status != ChatStatus.PAUSED:
        return JSONResponse(
            content={"detail": f"Cannot resume chat with status {chat.status}"},
            status_code=400,
        )

    session_mgr = get_session_manager()
    try:
        session_info = session_mgr.resume_session(chat_id)

        await session_mgr._broadcast_session_resumed(chat_id, session_info)

        from app.services.chats import broadcast_system_message

        await broadcast_system_message(db, chat_id, "Your session has resumed.")

        logger.info(
            "paused_chat_resumed_via_api",
            chat_id=chat_id,
            user_id=user.id,
            remaining_seconds=session_info.remaining_seconds,
        )

        return JSONResponse(
            content={
                "chat_id": session_info.chat_id,
                "elapsed_seconds": session_info.elapsed_seconds,
                "remaining_seconds": session_info.remaining_seconds,
                "client_balance": session_info.client_balance,
                "estimated_cost": session_info.estimated_cost,
                "rate_per_second": session_info.rate_per_second,
                "started_at": session_info.started_at,
                "chat_status": session_info.chat_status,
                "session_status": session_info.session_status,
            },
            status_code=200,
        )

    except InsufficientBalanceError as e:
        logger.warning(
            "insufficient_balance_to_resume",
            chat_id=chat_id,
            user_id=user.id,
            error=str(e),
        )
        return JSONResponse(
            content={"detail": "Insufficient balance to resume the session"},
            status_code=400,
        )

    except SessionNotFoundError as e:
        logger.error(
            "session_not_found_for_resume",
            chat_id=chat_id,
            user_id=user.id,
            error=str(e),
        )
        return JSONResponse(
            content={"detail": "Paused session not found"},
            status_code=404,
        )

    except Exception as e:
        logger.error(
            "error_resuming_chat",
            chat_id=chat_id,
            user_id=user.id,
            error=str(e),
            exc_info=True,
        )
        return JSONResponse(
            content={"detail": "Failed to resume session"},
            status_code=500,
        )


def get_termination_message(
    db: Session,
    chat_id: int,
    ended_by_user_id: int | None = None,
    chat: Chat | None = None,
) -> str:
    """Get appropriate termination message based on who ended the chat"""
    from app.enums.chat_termination_reason import ChatTerminationReason

    # If we know who ended it, show the correct identity
    if ended_by_user_id is not None and chat is not None:
        if ended_by_user_id == chat.user_id:
            return "The client has ended the conversation."
        elif ended_by_user_id == chat.psychic_id:
            return "The psychic has ended the conversation."

    # Fallback: look up from DB
    last_session = (
        db.query(ChatSession)
        .filter(ChatSession.chat_id == chat_id)
        .order_by(desc(ChatSession.id))
        .first()
    )

    if not last_session:
        return "The psychic has ended the conversation."

    last_interval = (
        db.query(SessionInterval)
        .filter(SessionInterval.session_id == last_session.id)
        .order_by(desc(SessionInterval.id))
        .first()
    )

    if not last_interval or not last_interval.termination_reason:
        return "The psychic has ended the conversation."

    reason_messages = {
        ChatTerminationReason.INSUFFICIENT_FUNDS: "The session has ended due to insufficient points.",
        ChatTerminationReason.MANUAL_EXIT: "The psychic has ended the conversation.",
        ChatTerminationReason.SOCKET_LOST: "The connection was lost.",
        ChatTerminationReason.TIMEOUT: "The session has ended due to inactivity.",
    }

    return reason_messages.get(
        last_interval.termination_reason, "The psychic has ended the conversation."
    )


# TODO: limit socket connections opened by users
@router.websocket("/ws/{chat_id}")
async def websocket_endpoint(
    websocket: WebSocket,
    chat_id: str,
    db: Session = Depends(get_db),
):
    """WebSocket endpoint for real-time chat - simplified without background monitors"""
    await websocket.accept()

    try:
        # 1. Authenticate user
        auth_data = await asyncio.wait_for(
            fut=websocket.receive_json(), timeout=settings.SOCKET_AUTH_TIMEOUT
        )

        SocketAuthData.model_validate(auth_data)

        if auth_data.get("type") != "auth":
            await websocket.close(code=4001, reason="Auth required")
            return

        user = await authenticate_websocket_user(auth_data.get("token"), db)
        bind_user_to_context(user.id)

        # 2. Verify chat access
        chat = await verify_chat_access(db, user_id=user.id, chat_id=int(chat_id))

        # 3. Send auth success
        await websocket.send_json({"type": "auth_success"})

        # 4. Connect to chat room
        await manager.connect(websocket, chat_id)

        # 5. Initialize event dispatcher
        from app.services.chat.event_dispatcher import EventDispatcher

        dispatcher = EventDispatcher(websocket, db, int(chat_id), user.id)

        logger.info(
            "websocket_connected",
            chat_id=int(chat_id),
            user_id=user.id,
            chat_status=chat.status.value,
        )

        # 5.5. Send initial session info if session is active
        if chat.status == ChatStatus.ACTIVE:
            from app.services.session_manager import get_session_manager

            session_mgr = get_session_manager()
            session_info = session_mgr.get_session_info(int(chat_id))

            if session_info:
                await websocket.send_json(
                    {
                        "event": "session_info",
                        "data": {
                            "chat_id": session_info.chat_id,
                            "elapsed_seconds": session_info.elapsed_seconds,
                            "estimated_cost": session_info.estimated_cost,
                            "remaining_seconds": session_info.remaining_seconds,
                            "client_balance": session_info.client_balance,
                            "chat_status": session_info.chat_status,
                            "session_status": session_info.session_status,
                            "started_at": session_info.started_at,
                            "rate_per_second": session_info.rate_per_second,
                        },
                    }
                )
                logger.info(
                    "sent_initial_session_info",
                    chat_id=int(chat_id),
                    user_id=user.id,
                    remaining_seconds=session_info.remaining_seconds,
                )

        # 6. Handle incoming messages using event dispatcher
        while True:
            try:
                data = await websocket.receive_json()
                event_type = data.get("type", "message")
                await dispatcher.dispatch(event_type, data)
            except ValidationError:
                await websocket.send_json(
                    {
                        "error": "true",
                        "message": "ERROR: malformed data, expected JSON with type and content keys",
                    }
                )
                continue
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
        manager.disconnect(websocket, chat_id)
    except jwt.PyJWTError:
        await websocket.close(code=4001, reason="Invalid token")
    except ValueError as e:
        await websocket.close(code=4003, reason=str(e))
    except TypeError:
        await websocket.close(code=4001, reason="Malformed data, expected JSON")


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
            exc_info=True,
        )
        raise


async def verify_chat_access(db: Session, user_id: int, chat_id: int):
    """
    Verify that a user has access to a specific chat.
    Raises ValueError if unauthorized or chat not found.
    Allows ADMIN and SUPERADMIN to access any chat.
    """
    try:
        from app.enums.role import Role

        chat = db.query(Chat).filter(Chat.id == chat_id).first()
        if chat is None:
            logger.warning(
                "chat_access_denied_not_found",
                chat_id=chat_id,
                user_id=user_id,
            )
            raise ValueError("Chat not found")

        # Get user to check role
        user = db.query(User).filter(User.id == user_id).first()

        # Allow admins and superadmins to access any chat
        if user and user.role in [Role.ADMIN, Role.SUPERADMIN]:
            logger.debug(
                "chat_access_granted_admin",
                chat_id=chat_id,
                user_id=user_id,
                role=user.role.value,
            )
            return chat

        if user_id not in (chat.user_id, chat.psychic_id):
            logger.warning(
                "chat_access_denied_unauthorized",
                chat_id=chat_id,
                user_id=user_id,
                chat_user_id=chat.user_id,
                chat_psychic_id=chat.psychic_id,
            )
            raise ValueError("Unauthorized")

        logger.debug(
            "chat_access_granted",
            chat_id=chat_id,
            user_id=user_id,
        )

        return chat
    except ValueError:
        raise
    except Exception as e:
        logger.error(
            "chat_access_verification_error",
            chat_id=chat_id,
            user_id=user_id,
            error=str(e),
            exc_info=True,
        )
        raise


async def monitor_user_balance(
    websocket: WebSocket,
    db: Session,
    chat_id: int,
    user_id: int,
    psychic_price_per_second: float,
):
    """
    DEPRECATED: This function is replaced by BalanceMonitor class.
    Use: app.services.chat.monitors.balance_monitor.BalanceMonitor

    Background task to monitor user balance with adaptive intervals.
    - Normal: 5-second checks when balance > 30 seconds
    - Critical: 1-second checks when balance < 30 seconds
    - Predictive: Exact timing when balance will deplete within check interval
    Sends warning when balance is low (< 5 minutes remaining).
    Ends chat when balance is insufficient for 10 seconds.
    """
    from app.services.balance_monitor import (
        pause_chat_insufficient_funds,
        send_balance_warning,
        should_send_warning,
        auto_end_expired_paused_chats,
        send_session_ending_soon,
        send_session_ended_no_balance,
    )

    # Configuration
    CHECK_INTERVAL_NORMAL = 5  # Check every 5 seconds normally
    CHECK_INTERVAL_CRITICAL = 1  # Check every 1 second when critical
    CRITICAL_THRESHOLD = 30  # Switch to fast checks at 30 seconds remaining

    warning_sent = False
    last_auto_end_check = 0  # Track time since last auto-end check

    # Track which countdown warnings have been sent to avoid duplicates
    countdown_warnings_sent = set()  # Will store threshold values (60, 30, 10)

    try:
        while True:
            # Get current user balance
            user = db.query(User).filter(User.id == user_id).first()
            if not user:
                print(f"[Balance Monitor] User {user_id} not found, exiting monitor")
                break

            current_balance = float(user.balance)

            # Calculate remaining time in seconds
            if psychic_price_per_second <= 0:
                print(
                    f"[Balance Monitor] Invalid rate {psychic_price_per_second}, exiting"
                )
                break

            remaining_seconds = current_balance / psychic_price_per_second
            remaining_points = int(remaining_seconds * psychic_price_per_second)

            print(
                f"[Balance Monitor] Chat {chat_id}: Balance={current_balance:.2f}, Remaining={remaining_seconds:.1f}s"
            )

            # CRITICAL: Check if balance insufficient for 10 seconds
            minimum_required_balance = psychic_price_per_second * 10
            if current_balance < minimum_required_balance:
                print(
                    f"[Balance Monitor] Balance insufficient for 10s! Ending chat {chat_id}"
                )
                print(
                    f"[Balance Monitor] Current: {current_balance:.2f}, Required: {minimum_required_balance:.2f}"
                )

                # Send session ended notification
                await send_session_ended_no_balance(websocket)

                # End the chat (not pause)
                from app.services.chats import end_chat_session
                from app.enums.chat_termination_reason import ChatTerminationReason

                end_chat_session(db, chat_id, ChatTerminationReason.INSUFFICIENT_FUNDS)

                # Commit to ensure DB is updated
                db.commit()

                print(
                    f"[Balance Monitor] Chat {chat_id} ended due to insufficient balance"
                )
                break  # Exit the monitoring loop

            # Send countdown warnings at 60s, 30s, and 10s thresholds
            for threshold in [60, 30, 10]:
                if (
                    remaining_seconds <= threshold
                    and threshold not in countdown_warnings_sent
                ):
                    await send_session_ending_soon(websocket, int(remaining_seconds))
                    countdown_warnings_sent.add(threshold)
                    print(
                        f"[Balance Monitor] Session ending soon warning sent for chat {chat_id} ({threshold}s threshold)"
                    )
                    break  # Only send one warning per iteration

            # Send warning if below threshold (5 minutes) and not already sent
            if (
                should_send_warning(remaining_seconds, threshold_seconds=300)
                and not warning_sent
            ):
                await send_balance_warning(
                    websocket, remaining_seconds, remaining_points
                )
                warning_sent = True
                print(f"[Balance Monitor] Low balance warning sent for chat {chat_id}")

            # Auto-end expired paused chats (check every 60 seconds)
            last_auto_end_check += CHECK_INTERVAL_NORMAL
            if last_auto_end_check >= 60:
                await auto_end_expired_paused_chats(db, timeout_minutes=30)
                last_auto_end_check = 0

            # ADAPTIVE SLEEP: Determine next check interval
            if remaining_seconds <= CHECK_INTERVAL_CRITICAL:
                # PREDICTIVE: Will deplete within 1 second - sleep exactly until depletion
                sleep_duration = max(
                    0.1, remaining_seconds - 0.1
                )  # Wake up 0.1s before
                print(
                    f"[Balance Monitor] Predictive mode: sleeping {sleep_duration:.2f}s until depletion"
                )
                await asyncio.sleep(sleep_duration)

            elif remaining_seconds <= CHECK_INTERVAL_NORMAL:
                # PREDICTIVE: Will deplete within 5 seconds - sleep exactly until depletion
                sleep_duration = max(
                    0.5, remaining_seconds - 0.5
                )  # Wake up 0.5s before
                print(
                    f"[Balance Monitor] Predictive mode: sleeping {sleep_duration:.2f}s until depletion"
                )
                await asyncio.sleep(sleep_duration)

            elif remaining_seconds < CRITICAL_THRESHOLD:
                # CRITICAL: Check every 1 second when < 30 seconds remaining
                print("[Balance Monitor] Critical mode: 1-second checks")
                await asyncio.sleep(CHECK_INTERVAL_CRITICAL)

            else:
                # NORMAL: Check every 5 seconds when plenty of time
                await asyncio.sleep(CHECK_INTERVAL_NORMAL)

    except asyncio.CancelledError:
        # Task was cancelled (user disconnected normally)
        print(f"Balance monitoring cancelled for chat {chat_id}")
    except Exception as e:
        print(f"Error in balance monitoring for chat {chat_id}: {e}")
