from typing import Optional

from fastapi import APIRouter, Body, Depends, File, Form, HTTPException, UploadFile, Response
from sqlalchemy.orm import Session

import app.services.psychics as psychic_service
from app.database.client import get_db
from app.dependencies.authorization import require_permission
from app.dependencies.get_current_user import get_current_user, get_optional_current_user
from app.enums.permissions import Permission
from app.enums.role import ROLE_PERMISSIONS, Role
from app.filters.psychic import build_psychics_filters
from app.models.user import User
from app.schemas.psychic import (
    PsychicCreate,
    PsychicFilter,
    PsychicUpdate,
    PaginatedResponse,
    PsychicRead,
)

router = APIRouter()


def require_psychic_update_access(
    psychic_id: int, user: User = Depends(get_current_user)
) -> User:
    """Write access to a psychic profile: admins with MANAGE_PSYCHICS may
    update any psychic; a PSYCHIC may update only their own profile (the
    self-service My Profile page). The GET endpoints stay public — customers
    browse psychics without an account."""
    if Permission.MANAGE_PSYCHICS in ROLE_PERMISSIONS.get(user.role, []):
        return user
    if user.role == Role.PSYCHIC and user.id == psychic_id:
        return user
    raise HTTPException(
        status_code=403, detail="Not authorized to modify psychic profiles"
    )


@router.get("/", response_model=PaginatedResponse[PsychicRead])
def get_psychic_endpoint(
    filters: PsychicFilter = Depends(),
    db: Session = Depends(get_db),
    viewer: User | None = Depends(get_optional_current_user),
):
    sql_filters = build_psychics_filters(filters)
    result = psychic_service.get_psychics(
        db, sql_filters, skip=filters.skip, limit=filters.limit, viewer=viewer
    )
    return result


@router.post("/")
def create_psychic_endpoint(
    psychic_data: PsychicCreate = Body(...),
    profile_picture: UploadFile = File(...),
    db: Session = Depends(get_db),
    _admin: User = Depends(require_permission(Permission.MANAGE_PSYCHICS)),
):
    psychic = psychic_service.create_psychic(
        db, psychic_data, profile_picture, viewer=_admin
    )
    return psychic


# Fields a psychic may NOT change on their own profile: marketplace ranking
# and login email stay admin-only. Rate (price_per_second) is intentionally
# self-service — the My Profile page has a rate control.
SELF_SERVICE_EXCLUDED_FIELDS = {"order", "email"}


@router.patch("/{psychic_id}")
def update_psychic_endpoint(
    psychic_id: int,
    db: Session = Depends(get_db),
    psychic_data: Optional[PsychicUpdate] = Form(None),
    profile_picture: Optional[UploadFile] = File(None),
    actor: User = Depends(require_psychic_update_access),
):
    if psychic_data is not None and Permission.MANAGE_PSYCHICS not in ROLE_PERMISSIONS.get(
        actor.role, []
    ):
        # Rebuild the payload so stripped fields drop out of fields_set —
        # the service applies every exclude_unset field verbatim, so a None
        # assignment here would null real columns instead of skipping them.
        psychic_data = PsychicUpdate(
            **psychic_data.model_dump(
                exclude_unset=True, exclude=SELF_SERVICE_EXCLUDED_FIELDS
            )
        )
    psychic = psychic_service.update_psychic(
        db, psychic_id, psychic_data, profile_picture, viewer=actor
    )
    return psychic


@router.get("/{psychic_id}")
def read_psychic_endpoint(
    psychic_id: int,
    db: Session = Depends(get_db),
    viewer: User | None = Depends(get_optional_current_user),
):
    psychic = psychic_service.read_psychic(db, psychic_id, viewer=viewer)
    return psychic


@router.delete("/{psychic_id}", status_code=204)
def delete_psychic_endpoint(
    psychic_id: int,
    db: Session = Depends(get_db),
    _admin: User = Depends(require_permission(Permission.MANAGE_PSYCHICS)),
):
    psychic_service.delete_psychic(db, psychic_id)
    return Response(status_code=204)
