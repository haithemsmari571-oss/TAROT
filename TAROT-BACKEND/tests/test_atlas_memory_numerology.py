from datetime import date

import pytest

from app.services.atlas_memory_numerology import calculate_atlas_memory_numerology
from app.services.numerology import CALCULATION_VERSION, NumerologyValidationError


@pytest.mark.parametrize(("birth_date", "sun_sign"), [
    ("2000-01-19", "Capricorn"),
    ("2000-01-20", "Aquarius"),
    ("2000-02-18", "Aquarius"),
    ("2000-02-19", "Pisces"),
    ("2000-03-20", "Pisces"),
    ("2000-03-21", "Aries"),
    ("2000-04-19", "Aries"),
    ("2000-04-20", "Taurus"),
    ("2000-05-20", "Taurus"),
    ("2000-05-21", "Gemini"),
    ("2000-06-20", "Gemini"),
    ("2000-06-21", "Cancer"),
    ("2000-07-22", "Cancer"),
    ("2000-07-23", "Leo"),
    ("2000-08-22", "Leo"),
    ("2000-08-23", "Virgo"),
    ("2000-09-22", "Virgo"),
    ("2000-09-23", "Libra"),
    ("2000-10-22", "Libra"),
    ("2000-10-23", "Scorpio"),
    ("2000-11-21", "Scorpio"),
    ("2000-11-22", "Sagittarius"),
    ("2000-12-21", "Sagittarius"),
    ("2000-12-22", "Capricorn"),
])
def test_all_sun_sign_boundaries(birth_date, sun_sign):
    assert calculate_atlas_memory_numerology(birth_date, "2026-08-12").sun_sign == sun_sign


@pytest.mark.parametrize(("birth_date", "life_path"), [
    (date(1998, 1, 1), 11),
    (date(1970, 4, 10), 22),
    (date(1903, 9, 29), 6),
])
def test_life_path_reuses_canonical_master_number_rules(birth_date, life_path):
    # The verified Astro-Seek parity engine preserves 11 and 22; a raw total of
    # 33 reduces to 6. Atlas deliberately reuses that rule instead of inventing one.
    assert calculate_atlas_memory_numerology(birth_date, "2026-08-12").life_path == life_path


@pytest.mark.parametrize(("birth_date", "current_date", "personal_year"), [
    ("1990-01-01", "2025-01-01", 11),
    ("1992-07-22", "2027-12-31", 4),
    ("1992-07-22", "2028-01-01", 5),
])
def test_personal_year_uses_the_current_calendar_year(
    birth_date,
    current_date,
    personal_year,
):
    assert calculate_atlas_memory_numerology(birth_date, current_date).personal_year == personal_year


def test_result_is_versioned_and_normalizes_both_dates():
    result = calculate_atlas_memory_numerology("22/07/1992", "12/08/2026")
    assert result.birth_date == "1992-07-22"
    assert result.as_of_date == "2026-08-12"
    assert result.calculation_version == CALCULATION_VERSION
    assert (result.sun_sign, result.life_path, result.personal_year) == ("Cancer", 5, 3)


@pytest.mark.parametrize("invalid", ["", "31/02/2000", "2000/02/01", "not-a-date"])
def test_invalid_dates_fail_closed(invalid):
    with pytest.raises(NumerologyValidationError):
        calculate_atlas_memory_numerology(invalid, "2026-08-12")
    with pytest.raises(NumerologyValidationError):
        calculate_atlas_memory_numerology("2000-02-01", invalid)
