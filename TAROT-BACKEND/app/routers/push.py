"""Phone notifications: the browsers that receive them (ROUND57).

GET    /api/push/public-key     the key a browser subscribes with; null = off
POST   /api/push/subscription   keep this browser for the signed-in user
DELETE /api/push/subscription   forget it

A client subscribes in the app (app "client"), the owner in his phone admin
(app "owner", SUPERADMIN only). POST and DELETE are idempotent on the
browser's push service address (services/web_push.py).
"""

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy.orm import Session

from app.database.client import get_db
from app.dependencies.get_current_user import get_current_user
from app.enums.role import Role
from app.models import User
from app.models.push_subscription import PUSH_APP_CLIENT, PUSH_APP_OWNER
from app.schemas.push import (
    PushPublicKey,
    PushSubscriptionDelete,
    PushSubscriptionIn,
    PushSubscriptionOut,
)
from app.services import web_push

router = APIRouter()

# Who may subscribe in which app.
APP_ROLE = {PUSH_APP_CLIENT: Role.USER, PUSH_APP_OWNER: Role.SUPERADMIN}


@router.get("/public-key", response_model=PushPublicKey)
def get_public_key():
    return {"public_key": web_push.public_key()}


@router.post(
    "/subscription",
    response_model=PushSubscriptionOut,
    status_code=status.HTTP_201_CREATED,
    responses={200: {"model": PushSubscriptionOut, "description": "Already kept; updated"}},
)
def subscribe(
    body: PushSubscriptionIn,
    request: Request,
    response: Response,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if user.role != APP_ROLE[body.app]:
        raise HTTPException(status_code=403, detail="PUSH_APP_NOT_ALLOWED")
    if web_push.vapid_keys() is None:
        raise HTTPException(status_code=409, detail="PUSH_OFF")
    try:
        created = web_push.save_subscription(
            db,
            user.id,
            body.endpoint,
            body.keys.p256dh,
            body.keys.auth,
            body.app,
            request.headers.get("user-agent"),
        )
    except web_push.SubscriptionRefused as refused:
        raise HTTPException(status_code=422, detail=str(refused)) from None
    if not created:
        response.status_code = status.HTTP_200_OK
    return {"app": body.app, "created": created}


@router.delete("/subscription", status_code=status.HTTP_204_NO_CONTENT)
def unsubscribe(
    body: PushSubscriptionDelete,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    web_push.delete_subscription(db, user.id, body.endpoint)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
