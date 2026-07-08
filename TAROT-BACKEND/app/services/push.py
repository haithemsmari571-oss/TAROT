"""Expo push notifications — fire-and-forget delivery to a user's devices.

The single entry point is ``notify_user_push``: it schedules the send as an
asyncio task with its own DB session and swallows every error, so a push
failure can NEVER break the calling flow (chat accept, message broadcast).

Receipt handling is minimal by design: a ticket that comes back with
``DeviceNotRegistered`` deletes that token; everything else is just logged.
"""

import asyncio
from typing import Optional

import httpx

from app.logging_config import get_logger

logger = get_logger(__name__)

EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send"
_SEND_TIMEOUT_SECONDS = 10


async def _send_push(
    user_id: int, title: str, body: str, data: Optional[dict]
) -> None:
    """Deliver one push to all of a user's registered devices.

    Runs in its own task with its own DB session — never raises.
    """
    # Local imports keep module import order simple (this module is imported
    # from request handlers and websocket handlers alike).
    from app.database.client import SessionLocal
    from app.models.push_token import PushToken

    db = SessionLocal()
    try:
        tokens = db.query(PushToken).filter(PushToken.user_id == user_id).all()
        if not tokens:
            return

        messages = [
            {
                "to": t.token,
                "sound": "default",
                "title": title,
                "body": body,
                "data": data or {},
                "priority": "high",
                # Must match ANDROID_CHANNEL_ID in the app (src/lib/notifications.ts).
                # Android picks the channel from the payload; without this the push
                # lands on a cached low-importance fallback channel (no heads-up
                # banner, hidden on the lock screen).
                "channelId": "readings-v2",
            }
            for t in tokens
        ]

        async with httpx.AsyncClient(timeout=_SEND_TIMEOUT_SECONDS) as client:
            resp = await client.post(EXPO_PUSH_URL, json=messages)
            payload = resp.json()

        # Expo answers with one ticket per message, in order.
        tickets = payload.get("data", [])
        stale = 0
        for token_row, ticket in zip(tokens, tickets):
            if not isinstance(ticket, dict) or ticket.get("status") != "error":
                continue
            details = ticket.get("details") or {}
            if details.get("error") == "DeviceNotRegistered":
                db.delete(token_row)
                stale += 1
            else:
                logger.warning(
                    "expo_push_ticket_error",
                    user_id=user_id,
                    error=details.get("error"),
                    message=ticket.get("message"),
                )
        if stale:
            db.commit()
            logger.info(
                "expo_push_stale_tokens_deleted", user_id=user_id, count=stale
            )

        logger.info(
            "expo_push_sent",
            user_id=user_id,
            devices=len(messages),
            title=title,
        )
    except Exception as e:
        logger.warning("expo_push_send_failed", user_id=user_id, error=str(e))
    finally:
        db.close()


def notify_user_push(
    user_id: int, title: str, body: str, data: Optional[dict] = None
) -> None:
    """Fire-and-forget push to every device the user registered.

    Safe to call from any async request/websocket handler: schedules a task on
    the running loop and returns immediately. Never raises — if there is no
    running loop (sync context) the push is skipped with a log line.
    """
    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        logger.warning("expo_push_skipped_no_event_loop", user_id=user_id)
        return
    loop.create_task(_send_push(user_id, title, body, data))
