from typing import List
from sqlalchemy import select, or_, and_
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError

from app.exceptions.zodiac import (
    LifePathNumberNotFoundError,
    LifePathCompatibilityNotFoundError,
    InvalidBirthdateError,
    DuplicateLifePathNumberError,
)
from app.models.life_path_number import LifePathNumber
from app.models.life_path_compatibility import LifePathCompatibility
from app.schemas.life_path import (
    LifePathNumberCreate,
    LifePathNumberUpdate,
    LifePathCompatibilityCreate,
    LifePathCompatibilityUpdate,
    LifePathReadingRequest,
    LifePathReadingResponse,
    CompatibleLifePath,
)
from app.utils.life_path_calculator import (
    calculate_life_path_number,
    get_life_path_compatibility_score,
)


#  Life Path Number CRUD


def get_life_path_number(db: Session, life_path_id: int) -> LifePathNumber:
    """Get a life path number by ID."""
    life_path = db.get(LifePathNumber, life_path_id)
    if life_path is None:
        raise LifePathNumberNotFoundError(life_path_id=life_path_id)
    return life_path


def get_life_path_number_by_number(db: Session, number: int) -> LifePathNumber:
    """Get a life path number by its number value."""
    stmt = select(LifePathNumber).where(LifePathNumber.number == number)
    life_path = db.scalar(stmt)
    if life_path is None:
        raise LifePathNumberNotFoundError(number=number)
    return life_path


def get_all_life_path_numbers(
    db: Session, skip: int = 0, limit: int = 100
) -> List[LifePathNumber]:
    """Get all life path numbers."""
    stmt = select(LifePathNumber).offset(skip).limit(limit)
    return list(db.scalars(stmt))


def create_life_path_number(
    db: Session, life_path_data: LifePathNumberCreate
) -> LifePathNumber:
    """Create a new life path number."""
    life_path = LifePathNumber(**life_path_data.model_dump())
    db.add(life_path)
    try:
        db.commit()
        db.refresh(life_path)
    except IntegrityError:
        db.rollback()
        raise DuplicateLifePathNumberError(number=life_path_data.number)
    return life_path


def update_life_path_number(
    db: Session, life_path_id: int, life_path_data: LifePathNumberUpdate
) -> LifePathNumber:
    """Update a life path number."""
    life_path = get_life_path_number(db, life_path_id)
    for field, value in life_path_data.model_dump(exclude_unset=True).items():
        setattr(life_path, field, value)
    db.commit()
    db.refresh(life_path)
    return life_path


def delete_life_path_number(db: Session, life_path_id: int) -> None:
    """Delete a life path number."""
    life_path = get_life_path_number(db, life_path_id)
    db.delete(life_path)
    db.commit()


#  Life Path Compatibility CRUD


def get_life_path_compatibility(
    db: Session, compatibility_id: int
) -> LifePathCompatibility:
    """Get a life path compatibility record by ID."""
    compatibility = db.get(LifePathCompatibility, compatibility_id)
    if compatibility is None:
        raise LifePathCompatibilityNotFoundError(compatibility_id=compatibility_id)
    return compatibility


def get_compatibility_between_life_paths(
    db: Session, life_path_id_1: int, life_path_id_2: int
) -> LifePathCompatibility | None:
    """Get compatibility between two life path numbers (checks both directions)."""
    stmt = select(LifePathCompatibility).where(
        or_(
            and_(
                LifePathCompatibility.life_path_id_1 == life_path_id_1,
                LifePathCompatibility.life_path_id_2 == life_path_id_2,
            ),
            and_(
                LifePathCompatibility.life_path_id_1 == life_path_id_2,
                LifePathCompatibility.life_path_id_2 == life_path_id_1,
            ),
        )
    )
    return db.scalar(stmt)


def get_all_life_path_compatibilities(
    db: Session, skip: int = 0, limit: int = 500
) -> List[LifePathCompatibility]:
    """Get all life path compatibility records."""
    stmt = select(LifePathCompatibility).offset(skip).limit(limit)
    return list(db.scalars(stmt))


def create_life_path_compatibility(
    db: Session, compatibility_data: LifePathCompatibilityCreate
) -> LifePathCompatibility:
    """Create a new life path compatibility record."""
    compatibility = LifePathCompatibility(**compatibility_data.model_dump())
    db.add(compatibility)
    try:
        db.commit()
        db.refresh(compatibility)
    except IntegrityError:
        db.rollback()
        raise
    return compatibility


def update_life_path_compatibility(
    db: Session, compatibility_id: int, compatibility_data: LifePathCompatibilityUpdate
) -> LifePathCompatibility:
    """Update a life path compatibility record."""
    compatibility = get_life_path_compatibility(db, compatibility_id)
    for field, value in compatibility_data.model_dump(exclude_unset=True).items():
        setattr(compatibility, field, value)
    db.commit()
    db.refresh(compatibility)
    return compatibility


def delete_life_path_compatibility(db: Session, compatibility_id: int) -> None:
    """Delete a life path compatibility record."""
    compatibility = get_life_path_compatibility(db, compatibility_id)
    db.delete(compatibility)
    db.commit()


#  Business Logic Functions


def get_life_path_reading(
    db: Session, request: LifePathReadingRequest
) -> LifePathReadingResponse:
    """Get a complete life path reading from a birthdate."""
    try:
        # Calculate life path number
        life_path_num = calculate_life_path_number(request.birthdate)

        # Get life path data from database
        life_path = get_life_path_number_by_number(db, life_path_num)

        # Get all life path numbers for compatibility calculation
        all_life_paths = get_all_life_path_numbers(db, limit=20)

        # Calculate compatible life paths
        compatible_paths = []
        for other_path in all_life_paths:
            if other_path.number == life_path_num:
                continue

            # Check database first
            compatibility = get_compatibility_between_life_paths(
                db, life_path.id, other_path.id
            )

            if compatibility:
                score = compatibility.compatibility_score
            else:
                # Calculate on-the-fly
                score = get_life_path_compatibility_score(
                    life_path_num, other_path.number
                )

            # Only include high compatibility matches (70+)
            if score >= 70:
                compatible_paths.append(
                    CompatibleLifePath(
                        number=other_path.number,
                        title=other_path.title,
                        compatibility_score=score,
                    )
                )

        # Sort by compatibility score
        compatible_paths.sort(key=lambda x: x.compatibility_score, reverse=True)

        # Extract strengths and growth areas from JSON
        core_strengths = life_path.core_strengths.get("strengths", [])
        growth_areas = life_path.growth_areas.get("areas", [])

        return LifePathReadingResponse(
            life_path_number=life_path.number,
            title=life_path.title,
            description=life_path.description,
            core_strengths=core_strengths,
            growth_areas=growth_areas,
            compatible_life_paths=compatible_paths,
        )

    except ValueError as e:
        raise InvalidBirthdateError(request.birthdate)
