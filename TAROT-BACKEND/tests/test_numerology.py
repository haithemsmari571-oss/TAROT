"""Deterministic numerology — Life Path + Personal Year — with known-correct values.

These pin the numbers the single-agent Reader is handed as given facts so it never
computes them live (a smoke test read Life Path 6 for 22 Jul 1992; correct is 5).
"""

from datetime import date

from app.utils.life_path_calculator import (
    calculate_life_path_number,
    calculate_personal_year,
    numerology_facts,
    reduce_to_single_digit,
)


# ── Life Path (existing function; the regression case is the whole point) ─────
def test_life_path_22_july_1992_is_5():
    # 1+9+9+2+0+7+2+2 = 32 -> 3+2 = 5. The smoke test wrongly said 6.
    assert calculate_life_path_number(date(1992, 7, 22)) == 5


def test_life_path_accepts_iso_string_like_the_dossier():
    # The dossier stores DOB as date.isoformat() ('YYYY-MM-DD').
    assert calculate_life_path_number(date(1992, 7, 22).isoformat()) == 5


def test_life_path_accepts_ddmmyyyy_string_like_oracle_utils():
    assert calculate_life_path_number("22/07/1992") == 5


def test_life_path_preserves_master_number_11():
    # 1 Jan 1998 -> 1+9+9+8+0+1+0+1 = 29 -> 2+9 = 11 (master, not reduced to 2).
    assert calculate_life_path_number(date(1998, 1, 1)) == 11


def test_life_path_known_example_from_docstring():
    # 15/05/1990 -> 1+5+0+5+1+9+9+0 = 30 -> 3.
    assert calculate_life_path_number(date(1990, 5, 15)) == 3


# ── Personal Year (new) ───────────────────────────────────────────────────────
def test_personal_year_22_july_1992_in_2026_is_3():
    # month 7 + day 22 + year 2026 digits: 7 + (2+2) + (2+0+2+6) = 21 -> 3.
    assert calculate_personal_year(date(1992, 7, 22), 2026) == 3


def test_personal_year_changes_with_the_year():
    # Same DOB, 2027: 7 + (2+2) + (2+0+2+7) = 22 -> stays 22 (master) under the
    # same reduction rule as Life Path (11/22/33 kept).
    assert calculate_personal_year(date(1992, 7, 22), 2027) == 22
    # 2028: 7 + 4 + (2+0+2+8=12) = 23 -> 2+3 = 5.
    assert calculate_personal_year(date(1992, 7, 22), 2028) == 5


def test_personal_year_accepts_iso_string():
    assert calculate_personal_year("1992-07-22", 2026) == 3


def test_personal_year_reduces_to_single_digit_range():
    # 1 Jan born, 2025: month 1 + day 1 + (2+0+2+5=9) = 11 -> master 11.
    assert calculate_personal_year(date(1990, 1, 1), 2025) == 11
    # 1 Jan born, 2024: 1 + 1 + (2+0+2+4=8) = 10 -> 1.
    assert calculate_personal_year(date(1990, 1, 1), 2024) == 1


# ── combined facts helper ─────────────────────────────────────────────────────
def test_numerology_facts_returns_both():
    facts = numerology_facts(date(1992, 7, 22), 2026)
    assert facts == {"life_path": 5, "personal_year": 3}


def test_numerology_facts_from_iso_string():
    assert numerology_facts("1992-07-22", 2026) == {"life_path": 5, "personal_year": 3}


# ── reduce rule sanity (master numbers preserved) ─────────────────────────────
def test_reduce_keeps_master_numbers():
    assert reduce_to_single_digit(11) == 11
    assert reduce_to_single_digit(22) == 22
    assert reduce_to_single_digit(33) == 33
    assert reduce_to_single_digit(38) == 11  # 3+8 = 11, kept
    assert reduce_to_single_digit(19) == 1   # 1+9=10 -> 1
