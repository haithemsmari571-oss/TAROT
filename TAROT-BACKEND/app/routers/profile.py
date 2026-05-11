import os
import uuid

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from app.config import get_app_settings
from app.database.client import get_db
from app.dependencies.get_current_user import get_current_user
from app.models.user import User
from app.schemas.auth import ChangePasswordReq
from app.schemas.user import UserProfileRead, UserProfileUpdate
from app.services.auth import change_password
from app.services.users import update_user_profile

router = APIRouter()
settings = get_app_settings()


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

        # Otherwise, prepend base URL
        profile_data.profile_picture_path = (
            f"{settings.APP_BASE_URL}/media{profile_data.profile_picture_path}"
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
    - profile_picture_path

    **Not allowed:**
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
    max_size = 5 * 1024 * 1024  # 5MB in bytes
    file_content = await file.read()
    if len(file_content) > max_size:
        raise HTTPException(status_code=400, detail="File too large. Maximum size: 5MB")

    # Reset file pointer
    await file.seek(0)

    # Generate unique filename
    file_extension = os.path.splitext(file.filename)[1] if file.filename else ".jpg"
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

    # Update user profile with new picture path
    # Store relative path without /media prefix (will be added on retrieval)
    relative_path = f"/uploads/{unique_filename}"

    from app.schemas.user import UserProfileUpdate

    profile_update = UserProfileUpdate(profile_picture_path=relative_path)
    updated_user = update_user_profile(db, user.id, profile_update)

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
