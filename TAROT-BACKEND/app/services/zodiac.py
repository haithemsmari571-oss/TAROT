from typing import List
from datetime import datetime
from sqlalchemy import select, or_, and_
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError

from app.exceptions.zodiac import (
    ZodiacSignNotFoundError,
    ZodiacCompatibilityNotFoundError,
    InvalidBirthdateError,
)
from app.models.zodiac_sign import ZodiacSign
from app.models.zodiac_compatibility import ZodiacCompatibility
from app.schemas.zodiac import (
    ZodiacSignCreate,
    ZodiacSignUpdate,
    ZodiacCompatibilityCreate,
    ZodiacCompatibilityUpdate,
    BirthdayCompatibilityRequest,
    SignCompatibilityRequest,
    CosmicBondResponse,
    FullChartResponse,
    SignCompatibilityDetail,
)
from app.utils.zodiac_calculator import (
    get_zodiac_sign_from_date,
    get_elemental_insight,
    calculate_compatibility_percentages,
)


#  Zodiac Sign CRUD


def get_zodiac_sign(db: Session, sign_id: int) -> ZodiacSign:
    """Get a zodiac sign by ID."""
    sign = db.get(ZodiacSign, sign_id)
    if sign is None:
        raise ZodiacSignNotFoundError(sign_id=sign_id)
    return sign


def get_zodiac_sign_by_name(db: Session, name: str) -> ZodiacSign:
    """Get a zodiac sign by name."""
    stmt = select(ZodiacSign).where(ZodiacSign.name == name)
    sign = db.scalar(stmt)
    if sign is None:
        raise ZodiacSignNotFoundError(sign_name=name)
    return sign


def get_zodiac_signs(db: Session, skip: int = 0, limit: int = 100) -> List[ZodiacSign]:
    """Get all zodiac signs."""
    stmt = select(ZodiacSign).offset(skip).limit(limit)
    return list(db.scalars(stmt))


def create_zodiac_sign(db: Session, sign_data: ZodiacSignCreate) -> ZodiacSign:
    """Create a new zodiac sign."""
    sign = ZodiacSign(**sign_data.model_dump())
    db.add(sign)
    try:
        db.commit()
        db.refresh(sign)
    except IntegrityError:
        db.rollback()
        raise
    return sign


def update_zodiac_sign(
    db: Session, sign_id: int, sign_data: ZodiacSignUpdate
) -> ZodiacSign:
    """Update a zodiac sign."""
    sign = get_zodiac_sign(db, sign_id)
    for field, value in sign_data.model_dump(exclude_unset=True).items():
        setattr(sign, field, value)
    db.commit()
    db.refresh(sign)
    return sign


def delete_zodiac_sign(db: Session, sign_id: int) -> None:
    """Delete a zodiac sign."""
    sign = get_zodiac_sign(db, sign_id)
    db.delete(sign)
    db.commit()


#  Zodiac Compatibility CRUD


def get_zodiac_compatibility(db: Session, compatibility_id: int) -> ZodiacCompatibility:
    """Get a zodiac compatibility record by ID."""
    compatibility = db.get(ZodiacCompatibility, compatibility_id)
    if compatibility is None:
        raise ZodiacCompatibilityNotFoundError(compatibility_id=compatibility_id)
    return compatibility


def get_compatibility_between_signs(
    db: Session, sign_id_1: int, sign_id_2: int
) -> ZodiacCompatibility | None:
    """Get compatibility between two zodiac signs (checks both directions)."""
    stmt = select(ZodiacCompatibility).where(
        or_(
            and_(
                ZodiacCompatibility.sign_id_1 == sign_id_1,
                ZodiacCompatibility.sign_id_2 == sign_id_2,
            ),
            and_(
                ZodiacCompatibility.sign_id_1 == sign_id_2,
                ZodiacCompatibility.sign_id_2 == sign_id_1,
            ),
        )
    )
    return db.scalar(stmt)


def get_all_zodiac_compatibilities(
    db: Session, skip: int = 0, limit: int = 500
) -> List[ZodiacCompatibility]:
    """Get all zodiac compatibility records."""
    stmt = select(ZodiacCompatibility).offset(skip).limit(limit)
    return list(db.scalars(stmt))


def create_zodiac_compatibility(
    db: Session, compatibility_data: ZodiacCompatibilityCreate
) -> ZodiacCompatibility:
    """Create a new zodiac compatibility record."""
    compatibility = ZodiacCompatibility(**compatibility_data.model_dump())
    db.add(compatibility)
    try:
        db.commit()
        db.refresh(compatibility)
    except IntegrityError:
        db.rollback()
        raise
    return compatibility


def update_zodiac_compatibility(
    db: Session, compatibility_id: int, compatibility_data: ZodiacCompatibilityUpdate
) -> ZodiacCompatibility:
    """Update a zodiac compatibility record."""
    compatibility = get_zodiac_compatibility(db, compatibility_id)
    for field, value in compatibility_data.model_dump(exclude_unset=True).items():
        setattr(compatibility, field, value)
    db.commit()
    db.refresh(compatibility)
    return compatibility


def delete_zodiac_compatibility(db: Session, compatibility_id: int) -> None:
    """Delete a zodiac compatibility record."""
    compatibility = get_zodiac_compatibility(db, compatibility_id)
    db.delete(compatibility)
    db.commit()


#  Business Logic Functions


def calculate_birthday_compatibility(
    db: Session, request: BirthdayCompatibilityRequest
) -> CosmicBondResponse:
    """Calculate compatibility between two birthdays."""
    try:
        # Parse dates and get zodiac signs
        user_sign_name = get_zodiac_sign_from_date(request.user_birthday)
        partner_sign_name = get_zodiac_sign_from_date(request.partner_birthday)

        # Get sign data from database
        user_sign = get_zodiac_sign_by_name(db, user_sign_name)
        partner_sign = get_zodiac_sign_by_name(db, partner_sign_name)

        # Check if compatibility exists in database
        compatibility = get_compatibility_between_signs(
            db, user_sign.id, partner_sign.id
        )

        if compatibility:
            # Return stored compatibility data
            return CosmicBondResponse(
                user_sign=user_sign.name,
                partner_sign=partner_sign.name,
                love_percentage=compatibility.love_percentage,
                communication_percentage=compatibility.communication_percentage,
                emotional_bond_percentage=compatibility.emotional_bond_percentage,
                overall_harmony_percentage=compatibility.overall_harmony_percentage,
                elemental_insight=compatibility.elemental_insight,
                compatibility_description=compatibility.compatibility_description,
            )
        else:
            # Calculate compatibility on-the-fly
            percentages = calculate_compatibility_percentages(
                user_sign.element,
                partner_sign.element,
                user_sign.modality,
                partner_sign.modality,
                user_sign.ruling_planet,
                partner_sign.ruling_planet,
            )

            insight = get_elemental_insight(user_sign.element, partner_sign.element)

            return CosmicBondResponse(
                user_sign=user_sign.name,
                partner_sign=partner_sign.name,
                love_percentage=percentages["love_percentage"],
                communication_percentage=percentages["communication_percentage"],
                emotional_bond_percentage=percentages["emotional_bond_percentage"],
                overall_harmony_percentage=percentages["overall_harmony_percentage"],
                elemental_insight=insight,
                compatibility_description=None,
            )

    except ValueError as e:
        raise InvalidBirthdateError(
            f"{request.user_birthday} or {request.partner_birthday}"
        )


def calculate_sign_compatibility(
    db: Session, request: SignCompatibilityRequest
) -> CosmicBondResponse:
    """Calculate compatibility between two zodiac signs."""
    user_sign = get_zodiac_sign(db, request.sign_id_1)
    partner_sign = get_zodiac_sign(db, request.sign_id_2)

    # Check if compatibility exists in database
    compatibility = get_compatibility_between_signs(db, user_sign.id, partner_sign.id)

    if compatibility:
        return CosmicBondResponse(
            user_sign=user_sign.name,
            partner_sign=partner_sign.name,
            love_percentage=compatibility.love_percentage,
            communication_percentage=compatibility.communication_percentage,
            emotional_bond_percentage=compatibility.emotional_bond_percentage,
            overall_harmony_percentage=compatibility.overall_harmony_percentage,
            elemental_insight=compatibility.elemental_insight,
            compatibility_description=compatibility.compatibility_description,
        )
    else:
        # Calculate compatibility on-the-fly
        percentages = calculate_compatibility_percentages(
            user_sign.element,
            partner_sign.element,
            user_sign.modality,
            partner_sign.modality,
            user_sign.ruling_planet,
            partner_sign.ruling_planet,
        )

        insight = get_elemental_insight(user_sign.element, partner_sign.element)

        return CosmicBondResponse(
            user_sign=user_sign.name,
            partner_sign=partner_sign.name,
            love_percentage=percentages["love_percentage"],
            communication_percentage=percentages["communication_percentage"],
            emotional_bond_percentage=percentages["emotional_bond_percentage"],
            overall_harmony_percentage=percentages["overall_harmony_percentage"],
            elemental_insight=insight,
            compatibility_description=None,
        )


def get_full_chart(db: Session, sign_id: int) -> FullChartResponse:
    """Get full compatibility chart for a zodiac sign."""
    sign = get_zodiac_sign(db, sign_id)
    all_signs = get_zodiac_signs(db, limit=12)

    # Calculate compatibility with all other signs
    compatibilities = []
    for other_sign in all_signs:
        if other_sign.id == sign.id:
            continue

        # Check database first
        compatibility = get_compatibility_between_signs(db, sign.id, other_sign.id)

        if compatibility:
            overall = compatibility.overall_harmony_percentage
            insight = compatibility.elemental_insight
        else:
            # Calculate on-the-fly
            percentages = calculate_compatibility_percentages(
                sign.element,
                other_sign.element,
                sign.modality,
                other_sign.modality,
                sign.ruling_planet,
                other_sign.ruling_planet,
            )
            overall = percentages["overall_harmony_percentage"]
            insight = get_elemental_insight(sign.element, other_sign.element)

        compatibilities.append(
            SignCompatibilityDetail(
                sign_name=other_sign.name,
                sign_id=other_sign.id,
                compatibility_percentage=overall,
                elemental_insight=insight,
            )
        )

    # Sort by compatibility percentage
    compatibilities.sort(key=lambda x: x.compatibility_percentage, reverse=True)

    # Categorize matches
    best_matches = [c for c in compatibilities if c.compatibility_percentage >= 75]
    good_matches = [c for c in compatibilities if 50 <= c.compatibility_percentage < 75]
    challenging_matches = [
        c for c in compatibilities if c.compatibility_percentage < 50
    ]

    return FullChartResponse(
        sign_name=sign.name,
        element=sign.element,
        modality=sign.modality,
        ruling_planet=sign.ruling_planet,
        date_range=f"{sign.date_range_start} to {sign.date_range_end}",
        core_trait=sign.core_trait,
        signature_trait=sign.signature_trait,
        description=sign.description,
        best_matches=best_matches,
        good_matches=good_matches,
        challenging_matches=challenging_matches,
    )
