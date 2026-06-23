from typing import Optional

from fastapi import UploadFile
from sqlalchemy import select, func
from sqlalchemy.orm import Session, joinedload

from app.config import get_app_settings
from app.enums.role import Role
from app.enums.user_status import UserStatus
from app.exceptions.users import UserNotFoundError
from app.models.psychic_categories import PsychicCategory
from app.models.user import User
from app.schemas.psychic import (
    PsychicAvailabilityRead,
    PsychicCategoryRead,
    PsychicCreate,
    PsychicRead,
    PsychicUpdate,
)
from app.services.medias import delete_media, save_media, update_media
from app.services.psychics_availabilities import sync_availability
from app.utils.security import hash_password

settings = get_app_settings()


def get_psychics(db: Session, filters: list, skip: int = 0, limit: int = 0):
    # 💡 Ordered explicitly by display priority sequence ascending, then by newest practitioner ID descending
    stmt = select(User).where(User.role == Role.PSYCHIC).order_by(User.order.asc(), User.id.desc())

    if filters:
        stmt = stmt.where(*filters)

    # Get total count
    count_stmt = select(func.count()).select_from(User).where(User.role == Role.PSYCHIC)
    if filters:
        count_stmt = count_stmt.where(*filters)
    total = db.scalar(count_stmt)

    if skip:
        stmt = stmt.offset(skip)
    if limit:
        stmt = stmt.limit(limit)

    psychics = db.scalars(stmt).all()
    return {
        "items": [_psychic_to_out(p) for p in psychics],
        "total": total,
        "skip": skip,
        "limit": limit,
    }


def create_psychic(
    db: Session, psychic_data: PsychicCreate, profile_picture: UploadFile
):
    profile_picture_path = _upload_profile_picture(profile_picture)

    password_hash = hash_password(psychic_data.password)
    psychic = User(
        role=Role.PSYCHIC,
        email=psychic_data.email,
        username=psychic_data.username,
        price_per_second=psychic_data.price_per_second,
        password_hash=password_hash,
        bio=psychic_data.bio,
        profile_picture_path=profile_picture_path,
        order=psychic_data.order if psychic_data.order is not None else 9999,
    )

    db.add(psychic)
    db.flush()

    sync_categories(db, psychic.id, psychic_data.categories_ids)

    sync_availability(db, psychic.id, availabilities_create=psychic_data.availability)

    db.commit()

    return _psychic_to_out(psychic)


def _psychic_to_out(psychic: User) -> PsychicRead:
    categories_mapped = [
        PsychicCategoryRead(
            id=psychic_category.category_id,
            title=psychic_category.category.title,
        )
        for psychic_category in psychic.categories
    ]

    availability_mapped = [
        PsychicAvailabilityRead(
            id=aval.id,
            day_of_the_week=aval.day_of_the_week,
            start_at=aval.start_at,
            end_at=aval.end_at,
        )
        for aval in psychic.availability
    ]

    return PsychicRead(
        id=psychic.id,
        username=psychic.username,
        email=psychic.email,
        is_verified=psychic.is_verified,
        price_per_second=psychic.price_per_second,
        categories=categories_mapped,
        availability=availability_mapped,
        bio=psychic.bio,
        profile_picture_url=_pdp_path_to_url(psychic.profile_picture_path),
        is_online=psychic.is_online,
        order=psychic.order,
    )


def _pdp_path_to_url(profile_picture_path: str | None):
    if profile_picture_path is None:
        return None
    return f"{settings.APP_BASE_URL}/{profile_picture_path}"


def get_psychic(db: Session, psychic_id: int):
    psychic = db.query(User).filter_by(role=Role.PSYCHIC, id=psychic_id).first()
    if not psychic:
        raise UserNotFoundError()

    return psychic


def sync_categories(db: Session, psychic_id: int, category_ids: list[int]):
    # 1. Remove existing links not in the new list
    db.query(PsychicCategory).filter(
        PsychicCategory.psychic_id == psychic_id,
        ~PsychicCategory.category_id.in_(category_ids),
    ).delete(synchronize_session=False)

    # 2. Find existing category links
    existing_ids = {
        pc.category_id
        for pc in db.query(PsychicCategory)
        .filter(PsychicCategory.psychic_id == psychic_id)
        .all()
    }

    # 3. Add missing ones
    for cat_id in category_ids:
        if cat_id not in existing_ids:
            db.add(PsychicCategory(psychic_id=psychic_id, category_id=cat_id))

    db.commit()


def update_psychic(
    db: Session,
    psychic_id: int,
    psychic_data: Optional[PsychicUpdate] = None,
    profile_picture: Optional[UploadFile] = None,
):
    psychic = get_psychic(db, psychic_id)

    if profile_picture:
        profile_picture_path = _update_profile_picture(
            psychic.profile_picture_path, profile_picture
        )
        psychic.profile_picture_path = profile_picture_path

    if psychic_data:
        if psychic_data.categories_ids is not None:
            sync_categories(
                db=db, psychic_id=psychic_id, category_ids=psychic_data.categories_ids
            )

        if (
            psychic_data.availabilities_create is not None
            or psychic_data.availabilities_ids_to_remove is not None
        ):
            sync_availability(
                db=db,
                psychic_id=psychic_id,
                availabilities_create=psychic_data.availabilities_create,
                availabilities_ids_to_remove=psychic_data.availabilities_ids_to_remove,
            )

        # ✅ FIX: Extract properties into a clean dictionary
        update_dict = psychic_data.model_dump(exclude_unset=True)
        
        # ✅ FIX: Strip out the list relationship structures before mapping scalar fields onto the model
        update_dict.pop("categories_ids", None)
        update_dict.pop("availabilities_create", None)
        update_dict.pop("availabilities_ids_to_remove", None)

        # Apply remaining safe data fields (including 'order') straight into model tracking fields
        for field, value in update_dict.items():
            setattr(psychic, field, value)

    db.commit()
    db.refresh(psychic)

    return _psychic_to_out(psychic)


def read_psychic(db: Session, psychic_id: int):
    psychic = (
        db.query(User)
        .options(
            joinedload(User.categories).joinedload(PsychicCategory.category),
            joinedload(User.availability),
        )
        .filter_by(id=psychic_id)
        .first()
    )
    if not psychic:
        raise UserNotFoundError()

    return _psychic_to_out(psychic)


def delete_psychic(db: Session, psychic_id: int):
    psychic = get_psychic(db, psychic_id)
    psychic.status = UserStatus.SUSPENDED
    db.commit()
    db.refresh(psychic)
    return _psychic_to_out(psychic)


def _upload_profile_picture(picture: UploadFile):
    return save_media(picture)


def _update_profile_picture(old_media_path: str, picture: UploadFile):
    return update_media(old_media_path, picture)


def _delete_profile_picture(profile_picture_path: str):
    return delete_media(profile_picture_path)