"""Client-facing Constellation page API (Steps 4 & 5).

One GET assembles the whole page; POST /pull performs the daily card pull. All
rewards are computed and credited server-side (Step 1 ledger). DOB is a
mandatory signup field, so the birthdate endpoint here is only a quiet fallback
for a rare legacy account.
"""

import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.encoders import jsonable_encoder
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from app.config import get_app_settings
from app.database.client import get_db
from app.dependencies.get_current_user import get_current_user
from app.enums.notification_type import NotificationType
from app.enums.verification_type import VerificationType
from app.exceptions.tasks import TaskNotClaimableError
from app.models import Notification
from app.models.user import User
from app.schemas.constellation import BirthdateRequest
from app.services.daily_content import get_daily_content
from app.services.daily_pull import (
    get_pull_for_date,
    get_streak_status,
    perform_daily_pull,
)
from app.services.image_compression import compress_image
from app.services.rituals_rotation import get_rotation
from app.services.stardust_rewards import get_stardust_breakdown
from app.services.tasks import check_can_be_paid, create_claim, get_task
from app.utils.zodiac_calculator import get_zodiac_sign_from_date

router = APIRouter()

# Central upsell copy (Section 3). Kept here so it's edited in one place.
UPSELL = {
    "headline": "Today's card touches something specific in your situation.",
    "subline": "Ask Valentina what it means for you.",
    "cta_label": "Ask Valentina about this card",
}


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _pending_celebrations(db: Session, user_id: int) -> list:
    """Unseen rewards to celebrate — approved claims and personal gifts from
    Valentina. NON-destructive: reading does not mark them seen (the client
    acknowledges via the ack endpoint once actually shown), so a double fetch or
    a page reload never loses a celebration."""
    notifs = (
        db.query(Notification)
        .filter(
            Notification.user_id == user_id,
            Notification.type.in_(
                [
                    NotificationType.CLAIM_APPROVED,
                    NotificationType.GIFT_BALANCE_RECEIVED,
                ]
            ),
            Notification.is_read.is_(False),
        )
        .order_by(Notification.id.asc())
        .all()
    )
    celebrations = []
    for n in notifs:
        data = n.data or {}
        if n.type == NotificationType.GIFT_BALANCE_RECEIVED:
            celebrations.append(
                {
                    "id": n.id,
                    "kind": "gift",
                    "amount": data.get("amount", 0),
                    "title": "A gift from Valentina",
                    "message": data.get("message"),  # the personal note
                }
            )
        else:  # CLAIM_APPROVED
            celebrations.append(
                {
                    "id": n.id,
                    "kind": "claim",
                    "amount": data.get("reward", 0),
                    "title": "The stars accepted your offering",
                    "message": n.message,
                }
            )
    return celebrations


@router.get("/constellation")
def get_constellation(
    user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    """Everything the Constellation page needs in one call."""
    now = _utcnow()
    on_date = now.date()

    dob_set = user.date_of_birth is not None
    sign = get_zodiac_sign_from_date(user.date_of_birth) if dob_set else None

    today_card = None
    pulled = False
    reward = None
    if dob_set:
        content = get_daily_content(db, sign, on_date)
        today_card = {
            "card_key": content.card_key,
            "card_name": content.card_name,
            "interpretation": content.interpretation,
            "manifestation": content.manifestation,
            "ritual": content.ritual,
            "quote_line": content.quote_line,
        }
        pull = get_pull_for_date(db, user.id, on_date)
        if pull:
            pulled = True
            reward = float(pull.reward)

    payload = {
        "dob_set": dob_set,
        "zodiac_sign": sign,
        "today": {
            "date": on_date.isoformat(),
            "pulled": pulled,
            "reward": reward,
            "card": today_card,
        },
        "streak": get_streak_status(db, user.id, on_date),
        "balance": get_stardust_breakdown(db, user.id, now=now),
        "rituals": get_rotation(db, user.id, now=now),
        "upsell": UPSELL,
    }
    return JSONResponse(content=jsonable_encoder(payload))


@router.get("/constellation/celebrations")
def get_celebrations(
    user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    """Rewards the client hasn't celebrated yet (approved claims + gifts). The
    global celebration host polls this from anywhere in the app, so a
    gift/approval is celebrated wherever the client is, not only on Profile.
    Non-destructive — the client calls ``/ack`` once a celebration is shown."""
    return JSONResponse(
        content=jsonable_encoder({"celebrations": _pending_celebrations(db, user.id)})
    )


@router.post("/constellation/celebrations/ack")
def ack_celebrations(
    payload: dict,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Mark celebrations (by notification id) as seen, so they never fire again."""
    ids = [int(i) for i in (payload.get("ids") or []) if i is not None]
    if ids:
        (
            db.query(Notification)
            .filter(Notification.user_id == user.id, Notification.id.in_(ids))
            .update({Notification.is_read: True}, synchronize_session=False)
        )
        db.commit()
    return JSONResponse(content={"acknowledged": ids})


@router.post("/constellation/pull")
def pull_daily_card(
    user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    """Reveal today's card — rolls the reward and credits it. Once per day."""
    result = perform_daily_pull(db, user, now=_utcnow())
    return JSONResponse(content=jsonable_encoder(result))


MAX_CLAIM_IMAGES = 4


@router.post("/constellation/rituals/{task_id}/claim")
async def submit_ritual_claim(
    task_id: int,
    screenshots: Optional[list[UploadFile]] = File(None),
    handle: Optional[str] = Form(None),
    message: Optional[str] = Form(None),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Submit a manual ritual: up to 4 screenshots (each compressed server-side
    as a fallback) plus an optional short message, or a social handle. Creates a
    PENDING claim for the admin queue. Reuses the 24h double-pay guard +
    frequency rules via ``create_claim``."""
    now = _utcnow()
    task = get_task(db, task_id)

    # Eligibility first — so a guard failure never leaves orphan upload files.
    ok, reason = check_can_be_paid(db, user.id, task, now=now)
    if not ok:
        raise TaskNotClaimableError(reason)

    # Ignore empty file slots the browser can send.
    files = [f for f in (screenshots or []) if f and f.filename]

    evidence_paths: list[str] = []
    evidence_handle = None

    if task.verification_type == VerificationType.SCREENSHOT:
        if not files:
            raise HTTPException(status_code=400, detail="Please add a screenshot.")
        media_dir = get_app_settings().MEDIA_DIR
        media_dir.mkdir(parents=True, exist_ok=True)
        for f in files[:MAX_CLAIM_IMAGES]:
            raw = await f.read()
            # Server-side fallback compression (client already compresses).
            compressed, ext = compress_image(raw)
            filename = f"claim_{uuid.uuid4().hex}{ext}"
            (media_dir / filename).write_bytes(compressed)
            evidence_paths.append(f"/uploads/{filename}")
    elif task.verification_type == VerificationType.HANDLE:
        if not handle or not handle.strip():
            raise HTTPException(status_code=400, detail="Please add your handle.")
        evidence_handle = handle.strip()
    else:
        raise HTTPException(
            status_code=400, detail="This ritual is completed automatically."
        )

    claim = create_claim(
        db,
        user.id,
        task_id,
        evidence_paths=evidence_paths,
        evidence_handle=evidence_handle,
        message=message,
        now=now,
    )
    return JSONResponse(
        content=jsonable_encoder(
            {
                "id": claim.id,
                "task_id": claim.task_id,
                "status": claim.status,
                "message": "The stars are confirming your offering ✨",
            }
        )
    )


@router.post("/constellation/birthdate")
def set_birthdate(
    payload: BirthdateRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Quiet fallback: set DOB for a legacy account that somehow lacks one."""
    from app.schemas.user import UserProfileUpdate
    from app.services.users import update_user_profile

    update_user_profile(
        db, user.id, UserProfileUpdate(date_of_birth=payload.date_of_birth)
    )
    return JSONResponse(content={"message": "Saved", "dob_set": True})
