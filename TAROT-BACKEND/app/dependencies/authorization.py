from typing import List

from fastapi import Depends, HTTPException

from app.dependencies.get_current_user import get_current_user
from app.enums.permissions import Permission
from app.enums.role import ROLE_PERMISSIONS, Role
from app.models.user import User


def require_admin(user: User = Depends(get_current_user)) -> User:
    """
    Dependency to require admin or superadmin role.

    Args:
        user: Current authenticated user

    Returns:
        User object if authorized

    Raises:
        HTTPException: 403 if user is not admin or superadmin
    """
    if user.role not in [Role.ADMIN, Role.SUPERADMIN]:
        raise HTTPException(
            status_code=403, detail="Admin access required for this endpoint"
        )
    return user


def require_superadmin(user: User = Depends(get_current_user)) -> User:
    """
    Dependency to require superadmin role only.

    Args:
        user: Current authenticated user

    Returns:
        User object if authorized

    Raises:
        HTTPException: 403 if user is not superadmin
    """
    if user.role != Role.SUPERADMIN:
        raise HTTPException(
            status_code=403, detail="Superadmin access required for this endpoint"
        )
    return user


def require_roles(allowed_roles: List[Role]):
    """
    Dependency factory to require specific roles.

    Usage:
        @router.get("/endpoint")
        def my_endpoint(user: User = Depends(require_roles([Role.ADMIN, Role.PSYCHIC]))):
            ...

    Args:
        allowed_roles: List of allowed roles

    Returns:
        Dependency function
    """

    def _check_role(user: User = Depends(get_current_user)) -> User:
        if user.role not in allowed_roles:
            raise HTTPException(
                status_code=403,
                detail=f"Access denied. Allowed roles: {[r.value for r in allowed_roles]}",
            )
        return user

    return _check_role


def require_permission(permission: Permission):
    """
    Dependency factory to require a specific permission.

    Checks the user's role against ROLE_PERMISSIONS to determine if
    the user has the required permission.

    Usage:
        @router.get("/endpoint")
        def my_endpoint(user: User = Depends(require_permission(Permission.MANAGE_USERS))):
            ...

    Args:
        permission: The required Permission enum value

    Returns:
        Dependency function
    """

    def _check_permission(user: User = Depends(get_current_user)) -> User:
        allowed = ROLE_PERMISSIONS.get(user.role, [])
        if permission not in allowed:
            raise HTTPException(
                status_code=403,
                detail=f"Access denied. Requires permission: {permission.value}",
            )
        return user

    return _check_permission
