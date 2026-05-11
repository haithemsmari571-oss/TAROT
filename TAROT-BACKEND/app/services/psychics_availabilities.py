from typing import Optional

from sqlalchemy.orm import Session

from app.enums.role import Role
from app.exceptions.users import UserNotFoundError
from app.models.psychic_availability import PsychicAvailability
from app.models.user import User
from app.schemas.psychic_availability import PsychicAvailiabilityCreate


def get_psychic(db: Session, psychic_id: int):
    psychic = db.query(User).filter_by(role=Role.PSYCHIC, id=psychic_id).first()
    if not psychic:
        raise UserNotFoundError()

    return psychic


def sync_availability(
    db: Session,
    psychic_id: int,
    availabilities_create: Optional[list[PsychicAvailiabilityCreate]],
    availabilities_ids_to_remove: Optional[list[int]] = None,
):
    get_psychic(db, psychic_id)

    # 1. Remove availabilities
    if availabilities_ids_to_remove:
        for av_id in availabilities_ids_to_remove:
            remove_availability(db, av_id, psychic_id)

    # 2. Create new availabilities
    if availabilities_create:
        for availability in availabilities_create:
            create_availabilitiy(db, availability, psychic_id)

    db.commit()


def create_availabilitiy(
    db: Session, availability_data: PsychicAvailiabilityCreate, psychic_id: int
):
    db.add(
        PsychicAvailability(
            psychic_id=psychic_id,
            **availability_data.model_dump(),
        )
    )

    db.commit()


def remove_availability(db: Session, availability_id: int, psychic_id: int):
    db.query(PsychicAvailability).filter(
        PsychicAvailability.id == availability_id,
        PsychicAvailability.psychic_id == psychic_id,
    ).delete(synchronize_session=False)
    db.commit()
