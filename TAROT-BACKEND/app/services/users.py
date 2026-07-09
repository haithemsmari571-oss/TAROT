import math
from typing import List, Optional, Tuple

from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.enums.role import Role
from app.enums.user_status import UserStatus
from app.exceptions.users import UserAlreadyExistsError, UserNotFoundError
from app.models.user import User
from app.schemas.user import (
    AdminUserCreate,
    AdminUserUpdate,
    UserCreate,
    UserProfileUpdate,
    UserUpdate,
)
from app.utils.security import hash_password


def get_user(db: Session, user_id: int) -> User:
    """Get user by ID (legacy function name, kept for compatibility)"""
    return get_user_by_id(db, user_id)


def get_user_by_id(db: Session, user_id: int) -> User:
    """Get user by ID"""
    user = db.get(User, user_id)
    if user is None:
        raise UserNotFoundError(f"User with id {user_id} not found")
    return user


def get_users(db: Session, skip: int = 0, limit: int = 100) -> List[User]:
    """Get users with basic pagination (legacy, use get_users_with_filters for admin)"""
    stmt = select(User).offset(skip).limit(limit)
    return list(db.scalars(stmt))


def get_users_with_filters(
    db: Session,
    search: Optional[str] = None,
    role: Optional[Role] = None,
    status: Optional[UserStatus] = None,
    is_verified: Optional[bool] = None,
    exclude_roles: Optional[List[Role]] = None,
    page: int = 1,
    limit: int = 20,
    sort_by: str = "created_at",
    sort_order: str = "desc",
) -> Tuple[List[User], int]:
    """
    Get users with advanced filtering, searching, sorting, and pagination.

    Args:
        db: Database session
        search: Search term for username or email
        role: Filter by role
        status: Filter by status
        is_verified: Filter by verification status
        page: Page number (1-indexed)
        limit: Items per page
        sort_by: Field to sort by (created_at, username, email, balance)
        sort_order: Sort order (asc, desc)

    Returns:
        Tuple of (users_list, total_count)
    """
    # Build query
    query = select(User)

    # Apply filters
    if search:
        search_term = f"%{search}%"
        query = query.where(
            or_(User.username.ilike(search_term), User.email.ilike(search_term))
        )

    if role is not None:
        query = query.where(User.role == role)

    if status is not None:
        query = query.where(User.status == status)

    if is_verified is not None:
        query = query.where(User.is_verified == is_verified)

    if exclude_roles:
        query = query.where(User.role.notin_(exclude_roles))

    # Get total count
    count_query = select(func.count()).select_from(query.subquery())
    total = db.scalar(count_query)

    # Apply sorting
    sort_field = getattr(User, sort_by, User.created_at)
    if sort_order.lower() == "desc":
        query = query.order_by(sort_field.desc())
    else:
        query = query.order_by(sort_field.asc())

    # Apply pagination
    offset = (page - 1) * limit
    query = query.offset(offset).limit(limit)

    # Execute query
    users = list(db.scalars(query))

    return users, total


def create_user(db: Session, user_data: UserCreate) -> User:
    """Create user (regular registration, kept for compatibility)"""
    user = User(**user_data.model_dump())
    db.add(user)
    try:
        db.commit()
        db.refresh(user)
    except IntegrityError:
        db.rollback()
        raise UserAlreadyExistsError("User already exists with unique fields")
    return user


def create_user_admin(db: Session, user_data: AdminUserCreate) -> User:
    """
    Create user via admin panel with role assignment.

    Args:
        db: Database session
        user_data: User creation data including role

    Returns:
        Created User object

    Raises:
        UserAlreadyExistsError: If username or email already exists
    """
    # Hash password
    password_hash = hash_password(user_data.password)

    # Create user dict without password
    user_dict = user_data.model_dump(exclude={"password"})
    user_dict["password_hash"] = password_hash

    user = User(**user_dict)
    db.add(user)

    try:
        db.commit()
        db.refresh(user)
    except IntegrityError:
        db.rollback()
        raise UserAlreadyExistsError("User already exists with that username or email")

    return user


def update_user(db: Session, user_id: int, user_data: UserUpdate) -> User:
    """Update user (legacy, kept for compatibility)"""
    user = get_user_by_id(db, user_id)
    for field, value in user_data.model_dump(exclude_unset=True).items():
        setattr(user, field, value)
    db.commit()
    db.refresh(user)
    return user


def update_user_admin(db: Session, user_id: int, user_data: AdminUserUpdate) -> User:
    """
    Update user via admin panel (can update all fields).

    Args:
        db: Database session
        user_id: User ID to update
        user_data: Update data

    Returns:
        Updated User object

    Raises:
        UserNotFoundError: If user doesn't exist
        UserAlreadyExistsError: If username/email conflicts
    """
    user = get_user_by_id(db, user_id)

    # Handle password separately
    update_data = user_data.model_dump(exclude_unset=True)
    password = update_data.pop("password", None)
    if password:
        user.password_hash = hash_password(password)

    # NEVER set balance directly here — every balance change must go through the
    # ledger (a CREDIT/DEBIT transaction recording which admin did it) so the
    # ledger always reconciles with balances. The router writes that transaction.
    update_data.pop("balance", None)

    # Update remaining fields
    for field, value in update_data.items():
        setattr(user, field, value)

    try:
        db.commit()
        db.refresh(user)
    except IntegrityError:
        db.rollback()
        raise UserAlreadyExistsError("User already exists with that username or email")

    return user


def soft_delete_own_account(db: Session, user: User) -> None:
    """Self-service account deletion: soft delete + anonymize.

    Personal data is stripped (email, username, DOB, bio, photo path, push
    tokens) and login is made impossible (random password, SUSPENDED status —
    which get_current_user rejects, killing existing tokens everywhere). Chats,
    messages and the transaction ledger are kept intact under the anonymized
    identity: psychics keep their history and financial records stay auditable.
    Renaming the email frees the real address for a future fresh signup.
    Remaining Stardust is forfeited (the app warns before calling this).
    """
    import secrets

    from app.enums.chat_status import ChatStatus
    from app.logging_config import get_logger
    from app.models.chat import Chat
    from app.models.push_token import PushToken

    logger = get_logger(__name__)

    forfeited = float(user.credit_balance or 0) + float(user.balance or 0)

    # Pending (never-accepted) requests would sit as ghost rows in psychic
    # queues forever — close them. ACTIVE/PAUSED chats are blocked by the
    # router before we get here.
    db.query(Chat).filter(
        Chat.user_id == user.id, Chat.status == ChatStatus.REQUESTED
    ).update({Chat.status: ChatStatus.ENDED})

    user.email = f"deleted-{user.id}@deleted.askvalentina.co.uk"
    user.username = f"deleted-user-{user.id}"
    user.password_hash = hash_password(secrets.token_urlsafe(32))
    user.date_of_birth = None
    user.bio = None
    user.profile_picture_path = None
    user.is_verified = False
    user.is_online = False
    user.balance = 0
    user.credit_balance = 0
    user.status = UserStatus.SUSPENDED

    db.query(PushToken).filter(PushToken.user_id == user.id).delete()

    db.commit()
    logger.info(
        "account_self_deleted",
        user_id=user.id,
        forfeited_balance=round(forfeited, 2),
    )


def suspend_user(db: Session, user_id: int) -> User:
    """
    Suspend user (soft delete).

    Args:
        db: Database session
        user_id: User ID to suspend

    Returns:
        Updated User object

    Raises:
        UserNotFoundError: If user doesn't exist
    """
    user = get_user_by_id(db, user_id)
    user.status = UserStatus.SUSPENDED
    db.commit()
    db.refresh(user)
    return user


def activate_user(db: Session, user_id: int) -> User:
    """
    Activate user.

    Args:
        db: Database session
        user_id: User ID to activate

    Returns:
        Updated User object

    Raises:
        UserNotFoundError: If user doesn't exist
    """
    user = get_user_by_id(db, user_id)
    user.status = UserStatus.ACTIVE
    db.commit()
    db.refresh(user)
    return user


def update_user_role(db: Session, user_id: int, new_role: Role) -> User:
    """
    Update user role.

    Args:
        db: Database session
        user_id: User ID
        new_role: New role to assign

    Returns:
        Updated User object

    Raises:
        UserNotFoundError: If user doesn't exist
    """
    user = get_user_by_id(db, user_id)
    user.role = new_role
    db.commit()
    db.refresh(user)
    return user


def verify_user(db: Session, user_id: int) -> User:
    """
    Force verify user (admin action).

    Args:
        db: Database session
        user_id: User ID to verify

    Returns:
        Updated User object

    Raises:
        UserNotFoundError: If user doesn't exist
    """
    user = get_user_by_id(db, user_id)
    user.is_verified = True
    db.commit()
    db.refresh(user)
    return user


def delete_user(db: Session, user_id: int) -> None:
    """
    Soft delete user (set status to SUSPENDED).
    For hard delete, use hard_delete_user.

    Args:
        db: Database session
        user_id: User ID to delete

    Raises:
        UserNotFoundError: If user doesn't exist
    """
    suspend_user(db, user_id)


def update_user_profile(
    db: Session, user_id: int, profile_data: UserProfileUpdate
) -> User:
    """
    Update user's own profile (limited fields).

    Args:
        db: Database session
        user_id: User ID (from authenticated user)
        profile_data: Profile update data

    Returns:
        Updated User object

    Raises:
        UserNotFoundError: If user doesn't exist
        UserAlreadyExistsError: If username/email conflicts
    """
    user = get_user_by_id(db, user_id)

    # Update only provided fields
    for field, value in profile_data.model_dump(exclude_unset=True).items():
        setattr(user, field, value)

    try:
        db.commit()
        db.refresh(user)
    except IntegrityError:
        db.rollback()
        raise UserAlreadyExistsError("Username or email already exists")

    return user
