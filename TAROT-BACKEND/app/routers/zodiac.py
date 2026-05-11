from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
from fastapi.encoders import jsonable_encoder
from sqlalchemy.orm import Session
from typing import List

from app.services.zodiac import (
    get_zodiac_signs,
    get_zodiac_sign,
    calculate_birthday_compatibility,
    calculate_sign_compatibility,
    get_full_chart,
)
from app.services.life_path import get_life_path_reading, get_life_path_number_by_number
from app.schemas.zodiac import (
    ZodiacSignResponse,
    BirthdayCompatibilityRequest,
    SignCompatibilityRequest,
    CosmicBondResponse,
    FullChartResponse,
)
from app.schemas.life_path import (
    LifePathReadingRequest,
    LifePathReadingResponse,
    LifePathNumberResponse,
)
from app.database.client import get_db

router = APIRouter()


# Zodiac Sign Endpoints


@router.get("/signs", response_model=List[ZodiacSignResponse])
def list_zodiac_signs(skip: int = 0, limit: int = 12, db: Session = Depends(get_db)):
    """Get all zodiac signs."""
    signs = get_zodiac_signs(db, skip=skip, limit=limit)
    return JSONResponse(content=jsonable_encoder(signs))


@router.get("/signs/{sign_id}", response_model=ZodiacSignResponse)
def get_zodiac_sign_detail(sign_id: int, db: Session = Depends(get_db)):
    """Get a specific zodiac sign by ID."""
    sign = get_zodiac_sign(db, sign_id)
    return JSONResponse(content=jsonable_encoder(sign))


@router.get("/signs/{sign_id}/full-chart", response_model=FullChartResponse)
def get_zodiac_full_chart(sign_id: int, db: Session = Depends(get_db)):
    """
    Get full compatibility chart for a zodiac sign.

    Shows compatibility with all other signs, categorized as:
    - Best matches (75-100%)
    - Good matches (50-74%)
    - Challenging matches (<50%)
    """
    chart = get_full_chart(db, sign_id)
    return JSONResponse(content=jsonable_encoder(chart))


# Compatibility Endpoints


@router.post("/birthday-compatibility", response_model=CosmicBondResponse)
def calculate_birthday_cosmic_bond(
    request: BirthdayCompatibilityRequest, db: Session = Depends(get_db)
):
    """
    Calculate cosmic bond compatibility between two birthdays.

    Returns love, communication, emotional bond, and overall harmony percentages,
    plus an elemental insight based on the zodiac signs.
    """
    compatibility = calculate_birthday_compatibility(db, request)
    return JSONResponse(content=jsonable_encoder(compatibility))


@router.post("/sign-compatibility", response_model=CosmicBondResponse)
def calculate_zodiac_sign_cosmic_bond(
    request: SignCompatibilityRequest, db: Session = Depends(get_db)
):
    """
    Calculate cosmic bond compatibility between two zodiac signs.

    Returns love, communication, emotional bond, and overall harmony percentages,
    plus an elemental insight.
    """
    compatibility = calculate_sign_compatibility(db, request)
    return JSONResponse(content=jsonable_encoder(compatibility))


# Life Path Endpoints


@router.post("/life-path", response_model=LifePathReadingResponse)
def get_life_path_from_birthdate(
    request: LifePathReadingRequest, db: Session = Depends(get_db)
):
    """
    Calculate life path number from birthdate and return full reading.

    Includes:
    - Life path number and title
    - Description and core strengths
    - Growth areas
    - Compatible life path numbers
    """
    reading = get_life_path_reading(db, request)
    return JSONResponse(content=jsonable_encoder(reading))


@router.get("/life-path/{number}", response_model=LifePathNumberResponse)
def get_life_path_by_number(number: int, db: Session = Depends(get_db)):
    """Get details for a specific life path number (1-9, 11, 22, 33)."""
    life_path = get_life_path_number_by_number(db, number)
    return JSONResponse(content=jsonable_encoder(life_path))
