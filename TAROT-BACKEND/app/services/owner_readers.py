"""Readers from the owner's phone (ROUND54): every reader with her profile, a
new reader, and a change to one. No second way to create or change a reader:
a new one goes through services/psychics.py create_psychic, as POST
/api/psychic/ (the CRM) does, and a change through update_psychic, as PATCH
/api/psychic/{id} does. Her photo is stored where every reader's picture is
(services/medias.py save_media).

A new reader is given a random password nobody sees or keeps, as the bulk
onboarding's confirm does, and the site's reset email
(services/auth.py send_password_link), with which she sets her own."""

import secrets

from fastapi import UploadFile
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from app.enums.role import Role
from app.models.category import Category
from app.models.psychic_categories import PsychicCategory
from app.models.user import User
from app.schemas.owner_readers import OwnerReaderCreate, OwnerReaderRead, OwnerReaderUpdate
from app.schemas.psychic import PsychicCategoryRead, PsychicCreate, PsychicUpdate
from app.services import psychics as psychic_service
from app.services.auth import send_password_link

# The length of the random password a new reader is created with (never shown,
# never kept: only its hash is stored), as psychic_onboarding.confirm_batch.
_UNSEEN_PASSWORD_BYTES = 24
# Her profile's own columns, which the shared PsychicUpdate does not carry.
_PROFILE_FIELDS = ("ethnicity", "show_ethnicity", "years_experience", "zodiac_sign", "languages")
# The fields a change shares with PATCH /api/psychic/{id}.
_SHARED_FIELDS = ("bio", "price_per_message", "categories_ids", "is_listed")


class ReaderNotFound(Exception):
    pass


class NameTaken(Exception):
    pass


class EmailTaken(Exception):
    pass


class UnknownCategory(Exception):
    pass


def reader_out(reader: User) -> OwnerReaderRead:
    """Everything the owner may see of her, ethnicity included whatever her consent."""
    return OwnerReaderRead(
        id=reader.id,
        name=reader.username,
        email=reader.email,
        picture_url=psychic_service._pdp_path_to_url(reader.profile_picture_path),
        bio=reader.bio,
        price_per_message=reader.price_per_message,
        categories=[
            PsychicCategoryRead(id=link.category_id, title=link.category.title)
            for link in reader.categories
        ],
        is_listed=reader.is_listed,
        ethnicity=reader.ethnicity,
        show_ethnicity=bool(reader.show_ethnicity),
        years_experience=reader.years_experience,
        zodiac_sign=reader.zodiac_sign,
        languages=reader.languages or [],
    )


def list_readers(db: Session) -> list[User]:
    """Every reader, hidden ones too, in the site's display order (services/psychics.py get_psychics)."""
    return list(
        db.scalars(
            select(User)
            .where(User.role == Role.PSYCHIC)
            .options(selectinload(User.categories).selectinload(PsychicCategory.category))
            .order_by(User.order.asc(), User.id.desc())
        ).all()
    )


def get_reader(db: Session, reader_id: int) -> User:
    reader = db.scalar(select(User).where(User.id == reader_id, User.role == Role.PSYCHIC))
    if reader is None:
        raise ReaderNotFound()
    return reader


def _name_holder(db: Session, name: str):
    # Her name is her username, which is unique; "sophie" and "Sophie" would
    # read as one reader to clients, so the match ignores case.
    return db.scalar(select(User.id).where(func.lower(User.username) == name.lower()))


def _check_name_free(db: Session, name: str, reader_id: int | None = None) -> None:
    holder = _name_holder(db, name)
    if holder is not None and holder != reader_id:
        raise NameTaken()


def _check_email_free(db: Session, email: str) -> None:
    # As sign-up checks it (services/auth.py _validate_user).
    if db.scalar(select(User.id).where(User.email.ilike(email))) is not None:
        raise EmailTaken()


def _check_categories(db: Session, category_ids: list[int]) -> None:
    if not category_ids:
        return
    known = set(db.scalars(select(Category.id).where(Category.id.in_(category_ids))).all())
    if known != set(category_ids):
        raise UnknownCategory()


def _shown(ethnicity: str | None, show_ethnicity: bool | None) -> bool | None:
    """No agreement without something to show: with no ethnicity the tick is off,
    so an ethnicity written later is never shown on an old agreement."""
    return False if ethnicity is None and show_ethnicity else show_ethnicity


async def create_reader(db: Session, data: OwnerReaderCreate, photo: UploadFile) -> tuple[User, bool]:
    """The new reader, and whether her set-your-password email went out."""
    _check_name_free(db, data.name)
    _check_email_free(db, data.email)
    _check_categories(db, data.categories_ids)

    psychic_data = PsychicCreate(
        username=data.name,
        email=data.email,
        password=secrets.token_urlsafe(_UNSEEN_PASSWORD_BYTES),
        bio=data.bio,
        price_per_message=data.price_per_message,
        categories_ids=data.categories_ids,
        availability=[],
        # create_psychic does not read it; the column keeps its default.
        is_online=True,
    )
    profile = {field: getattr(data, field) for field in _PROFILE_FIELDS}
    profile["show_ethnicity"] = _shown(data.ethnicity, data.show_ethnicity)
    # The owner vouches for her, as the bulk onboarding's confirm does, so the
    # password she sets is one she can sign in with (services/auth.py sign_in).
    profile["is_verified"] = True
    try:
        created = psychic_service.create_psychic(db, psychic_data, photo, profile=profile)
    except IntegrityError:
        # Another account took the name or the email after the checks above.
        db.rollback()
        if _name_holder(db, data.name) is not None:
            raise NameTaken()
        raise EmailTaken()

    reader = get_reader(db, created.id)
    email_sent = await send_password_link(db, reader)
    return reader, email_sent


def update_reader(db: Session, reader_id: int, data: OwnerReaderUpdate | None, photo: UploadFile | None) -> User:
    reader = get_reader(db, reader_id)
    changes = data.model_dump(exclude_unset=True) if data is not None else {}

    if "name" in changes:
        _check_name_free(db, changes["name"], reader.id)
    if "categories_ids" in changes:
        _check_categories(db, changes["categories_ids"])

    if "name" in changes:
        reader.username = changes["name"]
    for field in _PROFILE_FIELDS:
        if field in changes:
            setattr(reader, field, changes[field])
    reader.show_ethnicity = _shown(reader.ethnicity, reader.show_ethnicity)

    shared = {field: changes[field] for field in _SHARED_FIELDS if field in changes}
    # The change PATCH /api/psychic/{id} makes, committed with the fields above.
    psychic_service.update_psychic(db, reader.id, PsychicUpdate(**shared) if shared else None, photo)
    db.refresh(reader)
    return reader
