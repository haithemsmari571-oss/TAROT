"""Deterministic astrology and numerology facts for Atlas client memory."""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date

from app.services.numerology import (
    CALCULATION_VERSION,
    life_path_method_a,
    parse_calendar_date,
    personal_year,
)
from app.utils.zodiac_calculator import get_zodiac_sign_from_date


@dataclass(frozen=True)
class AtlasMemoryNumerology:
    birth_date: str
    as_of_date: str
    sun_sign: str
    life_path: int
    personal_year: int
    calculation_version: str


def calculate_atlas_memory_numerology(
    birth_date: date | str,
    current_date: date | str,
) -> AtlasMemoryNumerology:
    """Return verified values for the current calendar year without model input."""
    born = parse_calendar_date(birth_date)
    as_of = parse_calendar_date(current_date)
    return AtlasMemoryNumerology(
        birth_date=born.isoformat(),
        as_of_date=as_of.isoformat(),
        sun_sign=get_zodiac_sign_from_date(born),
        life_path=life_path_method_a(born).value,
        personal_year=personal_year(born, as_of.year).value,
        calculation_version=CALCULATION_VERSION,
    )
