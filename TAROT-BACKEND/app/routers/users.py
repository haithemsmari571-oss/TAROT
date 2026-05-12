import math
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.config import get_app_settings
from app.database.client import get_db
from app.dependencies.authorization import (
    require_permission,
    require_superadmin,
    verify_admin_target_authority,
)
from app.enums.permissions import Permission
from app.enums.role import Role
from app.enums.user_status import UserStatus
from app.logging_config import bind_user_to_context, get_logger
from app.models.user import User
from app.schemas.user import (
    AdminBalanceAdjustment,
    AdminUserCreate,
    AdminUserDetail,
    AdminUserListItem,
    AdminUserListResponse,
    AdminUserUpdate,
    UserRoleUpdate,
)
from app.services.transactions import (
    create_credit_transaction,
    create_debit_transaction,
)
from app.services.users import (
    activate_user,
    create_user_admin,
    get_user_by_id,
    get_users_with_filters,
    suspend_user,
    update_user_admin,
    update_user_role,
    verify_user,
)

router = APIRouter()
settings = get_app_settings()
logger = get_logger(__name__)


def transform_user_profile_picture(user_detail: AdminUserDetail) -> AdminUserDetail:
    """Transform profile picture path to full URL"""
    if user_detail.profile_picture_path:
        if not user_detail.profile_picture_path.startswith(("http://", "https://")):
            user_detail.profile_picture_path = (
                f"{settings.APP_BASE_URL}/media{user_detail.profile_picture_path}"
            )
    return user_detail


def transform_user_list_profile_picture(
    user_item: AdminUserListItem,
) -> AdminUserListItem:
    """Transform profile picture path to full URL for list items"""
    # Note: AdminUserListItem doesn't have profile_picture_path, but adding for consistency
    return user_item


@router.get("/users", response_model=AdminUserListResponse)
def list_users(
    search: Optional[str] = Query(None, description="Search by username or email"),
    role: Optional[Role] = Query(None, description="Filter by role"),
    status: Optional[UserStatus] = Query(None, description="Filter by status"),
    is_verified: Optional[bool] = Query(
        None, description="Filter by verification status"
    ),
    page: int = Query(1, ge=1, description="Page number"),
    limit: int = Query(20, ge=1, le=100, description="Items per page"),
    sort_by: str = Query("created_at", description="Sort field"),
    sort_order: str = Query("desc", pattern="^(asc|desc)$", description="Sort order"),
    admin: User = Depends(require_permission(Permission.MANAGE_USERS)),
    db: Session = Depends(get_db),
):
    """
    List all users with filtering, searching, and pagination.

    **Permissions:** Admin, Superadmin

    **Query Parameters:**
    - search: Search by username or email (partial match)
    - role: Filter by role (USER, ADMIN, SUPERADMIN, PSYCHIC)
    - status: Filter by status (ACTIVE, SUSPENDED)
    - is_verified: Filter by verification status
    - page: Page number (1-indexed)
    - limit: Items per page (max 100)
    - sort_by: Field to sort by (created_at, username, email, balance)
    - sort_order: Sort order (asc, desc)
    """
    exclude_roles = [Role.ADMIN, Role.SUPERADMIN] if admin.role == Role.ADMIN else None

    users, total = get_users_with_filters(
        db=db,
        search=search,
        role=role,
        status=status,
        is_verified=is_verified,
        exclude_roles=exclude_roles,
        page=page,
        limit=limit,
        sort_by=sort_by,
        sort_order=sort_order,
    )

    # Convert to list items
    user_items = [AdminUserListItem.model_validate(user) for user in users]

    # Calculate total pages
    pages = math.ceil(total / limit) if total > 0 else 0

    return AdminUserListResponse(
        users=user_items,
        total=total,
        page=page,
        limit=limit,
        pages=pages,
    )


@router.get("/users/{user_id}", response_model=AdminUserDetail)
def get_user_detail(
    user_id: int,
    admin: User = Depends(require_permission(Permission.MANAGE_USERS)),
    db: Session = Depends(get_db),
):
    """
    Get detailed information about a specific user.

    **Permissions:** Admin, Superadmin

    **Note:** Profile picture URL is transformed to full URL.
    """
    user = get_user_by_id(db, user_id)
    verify_admin_target_authority(admin, user)
    user_detail = AdminUserDetail.model_validate(user)
    return transform_user_profile_picture(user_detail)


@router.post("/users", response_model=AdminUserDetail)
def create_user(
    user_data: AdminUserCreate,
    admin: User = Depends(require_permission(Permission.MANAGE_USERS)),
    db: Session = Depends(get_db),
):
    """
    Create a new user with role assignment.

    **Permissions:** Admin, Superadmin
    """
    if admin.role == Role.ADMIN and user_data.role in (Role.ADMIN, Role.SUPERADMIN):
        raise HTTPException(
            status_code=403,
            detail="Cannot create users with admin or superadmin role",
        )

    user = create_user_admin(db, user_data)
    user_detail = AdminUserDetail.model_validate(user)
    return transform_user_profile_picture(user_detail)


@router.patch("/users/{user_id}", response_model=AdminUserDetail)
def update_user(
    user_id: int,
    user_data: AdminUserUpdate,
    admin: User = Depends(require_permission(Permission.MANAGE_USERS)),
    db: Session = Depends(get_db),
):
    """
    Update user information.

    **Permissions:** Admin, Superadmin

    **Note:** Can update all user fields except password.
    To change role, use the dedicated /users/{user_id}/role endpoint.
    """
    target_user = get_user_by_id(db, user_id)
    verify_admin_target_authority(admin, target_user)

    # Only superadmin can change roles
    if user_data.role is not None and admin.role != Role.SUPERADMIN:
        raise HTTPException(
            status_code=403,
            detail="Only superadmin can change user roles",
        )

    user = update_user_admin(db, user_id, user_data)
    user_detail = AdminUserDetail.model_validate(user)
    return transform_user_profile_picture(user_detail)


@router.delete("/users/{user_id}")
def delete_user(
    user_id: int,
    admin: User = Depends(require_superadmin),
    db: Session = Depends(get_db),
):
    """
    Soft delete user (suspend permanently).

    **Permissions:** Superadmin only

    **Note:** This sets user status to SUSPENDED. User data is retained for audit purposes.
    """
    # Prevent deleting yourself
    if user_id == admin.id:
        raise HTTPException(status_code=400, detail="Cannot delete your own account")

    suspend_user(db, user_id)
    return {"message": "User suspended successfully", "user_id": user_id}


@router.patch("/users/{user_id}/suspend", response_model=AdminUserDetail)
def suspend_user_endpoint(
    user_id: int,
    admin: User = Depends(require_permission(Permission.MANAGE_USERS)),
    db: Session = Depends(get_db),
):
    """
    Suspend a user account.

    **Permissions:** Admin, Superadmin

    **Note:** Suspended users cannot log in or perform actions.
    """
    target_user = get_user_by_id(db, user_id)
    verify_admin_target_authority(admin, target_user)

    # Prevent suspending yourself
    if user_id == admin.id:
        raise HTTPException(status_code=400, detail="Cannot suspend your own account")

    user = suspend_user(db, user_id)
    user_detail = AdminUserDetail.model_validate(user)
    return transform_user_profile_picture(user_detail)


@router.patch("/users/{user_id}/activate", response_model=AdminUserDetail)
def activate_user_endpoint(
    user_id: int,
    admin: User = Depends(require_permission(Permission.MANAGE_USERS)),
    db: Session = Depends(get_db),
):
    """
    Activate a suspended user account.

    **Permissions:** Admin, Superadmin
    """
    target_user = get_user_by_id(db, user_id)
    verify_admin_target_authority(admin, target_user)

    user = activate_user(db, user_id)
    user_detail = AdminUserDetail.model_validate(user)
    return transform_user_profile_picture(user_detail)


@router.patch("/users/{user_id}/role", response_model=AdminUserDetail)
def change_user_role(
    user_id: int,
    role_data: UserRoleUpdate,
    admin: User = Depends(require_superadmin),
    db: Session = Depends(get_db),
):
    """
    Change user role.

    **Permissions:** Superadmin only

    **Note:** Only superadmins can change user roles for security reasons.
    """
    # Prevent changing your own role
    if user_id == admin.id:
        raise HTTPException(status_code=400, detail="Cannot change your own role")

    user = update_user_role(db, user_id, role_data.role)
    user_detail = AdminUserDetail.model_validate(user)
    return transform_user_profile_picture(user_detail)


@router.post("/users/{user_id}/balance/adjust")
def adjust_user_balance(
    user_id: int,
    adjustment: AdminBalanceAdjustment,
    admin: User = Depends(require_permission(Permission.MANAGE_TRANSACTIONS)),
    db: Session = Depends(get_db),
):
    """
    Adjust user balance (credit or debit).

    **Permissions:** Admin, Superadmin

    **Note:** Creates a transaction record for audit trail.
    - Positive amount = Credit (add points)
    - Negative amount = Debit (remove points)

    **Example:**
    ```json
    {
        "amount": 1000,
        "reason": "Promotional credit for new user"
    }
    ```
    """
    # Bind admin to context
    bind_user_to_context(admin.id)

    # Get user to verify exists
    user = get_user_by_id(db, user_id)
    verify_admin_target_authority(admin, user)

    adjustment_type = "credit" if adjustment.amount > 0 else "debit"

    logger.info(
        "admin_balance_adjustment_requested",
        admin_user_id=admin.id,
        admin_username=admin.username,
        admin_email=admin.email,
        target_user_id=user_id,
        target_username=user.username,
        target_email=user.email,
        adjustment_amount=adjustment.amount,
        adjustment_type=adjustment_type,
        current_balance=user.balance,
        reason=adjustment.reason,
    )

    # Create transaction based on amount
    if adjustment.amount > 0:
        # Credit transaction
        transaction = create_credit_transaction(
            db=db,
            user_id=user_id,
            amount=adjustment.amount,
            description=f"Admin adjustment: {adjustment.reason}",
            metadata={
                "admin_id": admin.id,
                "admin_username": admin.username,
                "adjustment_type": "credit",
            },
        )
    else:
        # Debit transaction
        from app.exceptions.transactions import InsufficientBalanceError

        try:
            transaction = create_debit_transaction(
                db=db,
                user_id=user_id,
                amount=abs(adjustment.amount),
                description=f"Admin adjustment: {adjustment.reason}",
                metadata={
                    "admin_id": admin.id,
                    "admin_username": admin.username,
                    "adjustment_type": "debit",
                },
            )
        except InsufficientBalanceError as e:
            logger.warning(
                "admin_balance_adjustment_insufficient_balance",
                admin_user_id=admin.id,
                target_user_id=user_id,
                adjustment_amount=adjustment.amount,
                current_balance=user.balance,
                required_balance=abs(adjustment.amount),
                deficit=abs(adjustment.amount) - user.balance,
            )
            raise HTTPException(
                status_code=400,
                detail=f"Insufficient balance: User has {user.balance} points, trying to deduct {abs(adjustment.amount)}",
            )

    # Refresh user to get updated balance
    db.refresh(user)

    logger.info(
        "admin_balance_adjustment_completed",
        transaction_id=transaction.id,
        admin_user_id=admin.id,
        admin_username=admin.username,
        target_user_id=user_id,
        target_username=user.username,
        adjustment_amount=adjustment.amount,
        adjustment_type=adjustment_type,
        balance_before=transaction.balance_before,
        balance_after=transaction.balance_after,
        reason=adjustment.reason,
    )

    return {
        "transaction_id": transaction.id,
        "user_id": user_id,
        "amount": adjustment.amount,
        "new_balance": user.balance,
        "reason": adjustment.reason,
        "status": "success",
    }


@router.post("/users/{user_id}/verify", response_model=AdminUserDetail)
def verify_user_endpoint(
    user_id: int,
    admin: User = Depends(require_permission(Permission.MANAGE_USERS)),
    db: Session = Depends(get_db),
):
    """
    Force verify a user account.

    **Permissions:** Admin, Superadmin

    **Note:** Bypasses normal email verification flow.
    """
    target_user = get_user_by_id(db, user_id)
    verify_admin_target_authority(admin, target_user)

    user = verify_user(db, user_id)
    user_detail = AdminUserDetail.model_validate(user)
    return transform_user_profile_picture(user_detail)
