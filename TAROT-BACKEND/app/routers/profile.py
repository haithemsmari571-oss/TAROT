import uuid

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from app.config import get_app_settings
from app.database.client import get_db
from app.dependencies.get_current_user import get_current_user
from app.models.user import User
from app.schemas.auth import ChangePasswordReq
from app.logging_config import get_logger
from app.schemas.user import PushTokenReq, UserProfileRead, UserProfileUpdate
from app.services.auth import change_password
from app.services.medias import MAX_PICTURE_BYTES, PICTURE_FORMAT_EXTENSIONS, picture_format
from app.services.psychics import _pdp_path_to_url
from app.services.users import set_profile_picture_path, update_user_profile

router = APIRouter()
settings = get_app_settings()
logger = get_logger(__name__)


def transform_profile_picture_url(user: User) -> UserProfileRead:
    """
    Transform user object to UserProfileRead with full URL for profile picture.

    Args:
        user: User object from database

    Returns:
        UserProfileRead with transformed profile_picture_path
    """
    profile_data = UserProfileRead.model_validate(user)

    # Transform profile picture path to full URL
    if profile_data.profile_picture_path:
        # If it's already a full URL, leave it
        if profile_data.profile_picture_path.startswith(("http://", "https://")):
            return profile_data

        # Otherwise, the same URL the reader listing builds for the stored path
        profile_data.profile_picture_path = _pdp_path_to_url(
            profile_data.profile_picture_path
        )

    return profile_data


@router.get("/me", response_model=UserProfileRead)
def get_my_profile(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Get current user's profile.

    **Permissions:** Authenticated user

    Returns complete profile information including balance, role, and bio.
    Profile picture URL is transformed to full URL.
    """
    # Refresh to get latest data
    db.refresh(user)
    return transform_profile_picture_url(user)


@router.patch("/me", response_model=UserProfileRead)
def update_my_profile(
    profile_data: UserProfileUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Update current user's profile.

    **Permissions:** Authenticated user

    **Allowed fields:**
    - username (min 3 characters)
    - email (valid email format)
    - bio (max 500 characters)

    **Not allowed:**
    - profile_picture_path (set only by POST /me/picture; ignored here)
    - role (admin only)
    - balance (use payment system)
    - status (admin only)
    - is_verified (admin only)

    **Example:**
    ```json
    {
        "username": "new_username",
        "bio": "This is my updated bio"
    }
    ```
    """
    updated_user = update_user_profile(db, user.id, profile_data)
    return transform_profile_picture_url(updated_user)


@router.post("/me/picture", response_model=UserProfileRead)
async def upload_profile_picture(
    file: UploadFile = File(..., description="Profile picture image file"),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Upload profile picture.

    **Permissions:** Authenticated user

    **Accepts:** Image files (JPEG, PNG, GIF, WebP)

    **Max size:** 5MB

    **Returns:** Updated profile with full URL to profile picture

    **Note:** Old profile picture is not automatically deleted.
    """
    # Validate file type
    allowed_types = ["image/jpeg", "image/png", "image/gif", "image/webp"]
    if file.content_type not in allowed_types:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid file type. Allowed: {', '.join(allowed_types)}",
        )

    # Validate file size (5MB max)
    file_content = await file.read()
    if len(file_content) > MAX_PICTURE_BYTES:
        raise HTTPException(status_code=400, detail="File too large. Maximum size: 5MB")

    # Reset file pointer
    await file.seek(0)

    # The declared content-type is client-controlled, so confirm the bytes are a
    # real raster image and take the extension from what Pillow actually decodes,
    # never from the client's filename (services/medias.py picture_format).
    detected_format = picture_format(file_content)
    if detected_format is None:
        raise HTTPException(
            status_code=400,
            detail="The selected file is not a valid JPEG, PNG, GIF or WebP image.",
        )
    if detected_format not in PICTURE_FORMAT_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail="Invalid file type. Allowed: JPEG, PNG, GIF, WebP",
        )
    file_extension = PICTURE_FORMAT_EXTENSIONS[detected_format]

    # Generate unique filename
    unique_filename = f"profile_{user.id}_{uuid.uuid4().hex}{file_extension}"

    # Ensure media directory exists
    media_dir = settings.MEDIA_DIR
    media_dir.mkdir(parents=True, exist_ok=True)

    # Save file
    file_path = media_dir / unique_filename
    try:
        with open(file_path, "wb") as f:
            f.write(file_content)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save file: {str(e)}")

    # Store the path in the shape save_media writes for reader pictures
    # ("media/uploads/<file>"), which every reader of the column turns into a URL.
    updated_user = set_profile_picture_path(db, user.id, file_path.as_posix())

    return transform_profile_picture_url(updated_user)


@router.post("/me/change-password")
def change_user_password(
    password_data: ChangePasswordReq,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Change current user's password.

    **Permissions:** Authenticated user

    **Required fields:**
    - current_password: User's current password
    - new_password: New password to set

    **Example:**
    ```json
    {
        "current_password": "old_password123",
        "new_password": "new_password456"
    }
    ```

    **Returns:** 204 No Content on success

    **Raises:**
    - 401: If current password is incorrect
    """
    change_password(
        db, user, password_data.current_password, password_data.new_password
    )
    return JSONResponse(
        content={"message": "Password changed successfully"}, status_code=200
    )


@router.get("/me/favorites")
def list_my_favorites(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    List the signed-in user's favourited psychics.

    **Permissions:** Authenticated user

    Returns just the ids — clients join them against the psychic list they
    already load (photos, rates, online status come from there).
    """
    from app.models.favorite import FavoritePsychic

    rows = (
        db.query(FavoritePsychic.psychic_id)
        .filter(FavoritePsychic.user_id == user.id)
        .order_by(FavoritePsychic.created_at.desc())
        .all()
    )
    return JSONResponse(
        content={"psychic_ids": [r.psychic_id for r in rows]}, status_code=200
    )


@router.post("/me/favorites/{psychic_id}")
def add_favorite(
    psychic_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Favourite a psychic. Idempotent — re-adding an existing favourite is a
    no-op success.

    **Permissions:** Authenticated user
    """
    from app.enums.role import Role
    from app.models.favorite import FavoritePsychic

    psychic = (
        db.query(User)
        .filter(User.id == psychic_id, User.role == Role.PSYCHIC)
        .first()
    )
    if not psychic:
        raise HTTPException(status_code=404, detail="Psychic not found")

    existing = (
        db.query(FavoritePsychic)
        .filter(
            FavoritePsychic.user_id == user.id,
            FavoritePsychic.psychic_id == psychic_id,
        )
        .first()
    )
    if not existing:
        db.add(FavoritePsychic(user_id=user.id, psychic_id=psychic_id))
        db.commit()
        logger.info("favorite_added", user_id=user.id, psychic_id=psychic_id)
    return JSONResponse(content={"message": "Favourited"}, status_code=200)


@router.delete("/me/favorites/{psychic_id}")
def remove_favorite(
    psychic_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Unfavourite a psychic. Idempotent — removing a non-favourite is a no-op
    success.

    **Permissions:** Authenticated user
    """
    from app.models.favorite import FavoritePsychic

    deleted = (
        db.query(FavoritePsychic)
        .filter(
            FavoritePsychic.user_id == user.id,
            FavoritePsychic.psychic_id == psychic_id,
        )
        .delete()
    )
    if deleted:
        db.commit()
        logger.info("favorite_removed", user_id=user.id, psychic_id=psychic_id)
    return JSONResponse(content={"message": "Removed"}, status_code=200)


@router.delete("/me")
def delete_my_account(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Self-service account deletion (soft delete + anonymize).

    **Permissions:** Authenticated CLIENT accounts only — psychic/admin
    accounts must go through support (deleting a reader would strand their
    live marketplace presence).

    **Blocked** while a reading is in progress (ACTIVE or PAUSED per-minute
    chat). A per-message thread never blocks: it is created ACTIVE and never
    closes, and it is kept as it is under the anonymized identity.

    Anonymizes the user row (frees the email for reuse), removes push tokens,
    forfeits any remaining Stardust, and suspends the account — which also
    invalidates every existing access/refresh token via get_current_user.
    Chat and transaction history are preserved under the anonymized identity.
    """
    from app.enums.chat_status import ChatStatus
    from app.enums.role import Role
    from app.models.chat import Chat
    from app.services.owner_messaging import MODES as CONVERSATION_MODES
    from app.services.users import soft_delete_own_account

    if user.role != Role.USER:
        raise HTTPException(
            status_code=403,
            detail="This account type can't be deleted from the app — please contact support.",
        )

    reading_filters = [
        Chat.user_id == user.id,
        Chat.status.in_([ChatStatus.ACTIVE, ChatStatus.PAUSED]),
    ]
    if settings.BILLING_MODE == "per_message":
        # Per-message threads open Automatic (SABRI, per_message_start.py) and
        # the owner switches them between Automatic and Hybrid in AV Admin
        # (owner_messaging.MODES). They never close, so neither mode is a
        # reading in progress. A HUMAN chat left from before per-message
        # billing still counts, and in per_minute billing every chat is a
        # per-minute reading, SABRI included, so all of them still count.
        reading_filters.append(Chat.response_mode.notin_(list(CONVERSATION_MODES.values())))
    in_progress = db.query(Chat.id).filter(*reading_filters).first()
    if in_progress:
        raise HTTPException(
            status_code=409,
            detail="You have a reading in progress. End it (or let it finish) before deleting your account.",
        )

    logger.info("account_delete_requested", user_id=user.id)
    soft_delete_own_account(db, user)
    return JSONResponse(content={"message": "Account deleted"}, status_code=200)


@router.post("/me/push-token")
def register_push_token(
    body: PushTokenReq,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Register (or reassign) this device's Expo push token to the signed-in user.

    **Permissions:** Authenticated user

    Upserts by token: a device that switches accounts moves its token to the
    new account instead of creating a duplicate. Called by the mobile app after
    the user grants notification permission, and again on every sign-in
    (tokens are per-device, accounts are not).
    """
    from app.models.push_token import PushToken

    token = (body.token or "").strip()
    if not token or len(token) > 255:
        raise HTTPException(status_code=422, detail="Invalid push token")

    existing = db.query(PushToken).filter(PushToken.token == token).first()
    if existing:
        existing.user_id = user.id
        existing.platform = body.platform or existing.platform
    else:
        db.add(PushToken(user_id=user.id, token=token, platform=body.platform))
    db.commit()

    logger.info("push_token_registered", user_id=user.id, platform=body.platform)
    return JSONResponse(content={"message": "Push token registered"}, status_code=200)
