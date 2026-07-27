"""Ask Valentina's deterministic numerology engine.

No model/provider calls, persistence, timezone conversion, or locale guessing
belong in this module.  Calculation changes require a new public version.
"""
from __future__ import annotations

from dataclasses import asdict, dataclass
from datetime import date, timedelta
import re
import unicodedata

CALCULATION_VERSION = "astro-seek-parity-1.0.0"
LETTER_VALUES = {letter: (index % 9) + 1 for index, letter in enumerate("ABCDEFGHIJKLMNOPQRSTUVWXYZ")}
VOWELS = frozenset("AEIOUY")


class NumerologyValidationError(ValueError):
    pass


@dataclass(frozen=True)
class Calculation:
    value: int
    trace: list[str]


def parse_calendar_date(value: date | str) -> date:
    if isinstance(value, date):
        return value
    raw = str(value).strip()
    for pattern in (r"(\d{4})-(\d{1,2})-(\d{1,2})", r"(\d{1,2})/(\d{1,2})/(\d{4})"):
        match = re.fullmatch(pattern, raw)
        if not match:
            continue
        parts = [int(part) for part in match.groups()]
        year, month, day = parts if pattern.startswith(r"(\d{4})") else (parts[2], parts[1], parts[0])
        try:
            return date(year, month, day)
        except ValueError as error:
            raise NumerologyValidationError("Enter a real calendar date.") from error
    raise NumerologyValidationError("Use YYYY-MM-DD or DD/MM/YYYY.")


def _reduce(value: int, preserve: frozenset[int]) -> Calculation:
    trace = [str(value)]
    while value > 9 and value not in preserve:
        digits = [int(character) for character in str(value)]
        value = sum(digits)
        trace.append(f"{'+'.join(map(str, digits))}={value}")
    return Calculation(value, trace)


def reduce_life_path(value: int) -> Calculation:
    return _reduce(value, frozenset({11, 22}))


def reduce_personal_year(value: int) -> Calculation:
    return _reduce(value, frozenset({11}))


def life_path_method_a(value: date | str) -> Calculation:
    parsed = parse_calendar_date(value)
    digits = [int(character) for character in parsed.strftime("%d%m%Y")]
    total = sum(digits)
    reduced = reduce_life_path(total)
    return Calculation(reduced.value, [f"{'+'.join(map(str, digits))}={total}", *reduced.trace[1:]])


def life_path_method_b(value: date | str) -> Calculation:
    parsed = parse_calendar_date(value)
    day = reduce_life_path(sum(map(int, str(parsed.day))))
    month = reduce_life_path(sum(map(int, str(parsed.month))))
    year_digits = list(map(int, str(parsed.year)))
    year = reduce_life_path(sum(year_digits))
    combined = day.value + month.value + year.value
    result = reduce_life_path(combined)
    trace = [
        f"day {parsed.day}→{day.value}",
        f"month {parsed.month}→{month.value}",
        f"year {'+'.join(map(str, year_digits))}={sum(year_digits)}→{year.value}",
        f"{day.value}+{month.value}+{year.value}={combined}",
        *result.trace[1:],
    ]
    return Calculation(result.value, trace)


def birthday_number(value: date | str) -> Calculation:
    parsed = parse_calendar_date(value)
    return Calculation(parsed.day, [f"calendar day={parsed.day} (not reduced)"])


def _normalise_name(name: str) -> tuple[str, list[dict]]:
    original = str(name)
    if not original.strip():
        raise NumerologyValidationError("Enter a full birth name or leave the name field blank.")
    if any(ord(character) > 127 for character in original):
        raise NumerologyValidationError(
            "Name-number parity is verified for Latin A–Z only. Please enter a Latin transliteration; it will be shown back to you."
        )
    invalid = [c for c in original if not (c.isalpha() or c in " -'’")]
    if invalid:
        raise NumerologyValidationError("Names may contain letters, spaces, hyphens and apostrophes.")
    normalized = "".join(c for c in unicodedata.normalize("NFKC", original).upper() if "A" <= c <= "Z")
    if not normalized:
        raise NumerologyValidationError("Enter at least one Latin letter.")
    letters = [{"index": i, "letter": letter, "value": LETTER_VALUES[letter]} for i, letter in enumerate(normalized)]
    return normalized, letters


def name_numbers(name: str, y_consonant_indexes: set[int] | None = None) -> dict:
    normalized, letters = _normalise_name(name)
    selected = y_consonant_indexes or set()
    possible = {item["index"] for item in letters if item["letter"] == "Y"}
    if not selected.issubset(possible):
        raise NumerologyValidationError("A Y selection referred to a character that is not Y.")
    expression_total = sum(item["value"] for item in letters)
    vowel_letters = [
        item for item in letters
        if item["letter"] in VOWELS and not (item["letter"] == "Y" and item["index"] in selected)
    ]
    consonant_letters = [item for item in letters if item not in vowel_letters]
    expression = reduce_life_path(expression_total)
    soul_total = sum(item["value"] for item in vowel_letters)
    personality_total = sum(item["value"] for item in consonant_letters)
    soul = reduce_life_path(soul_total)
    personality = reduce_life_path(personality_total)
    for item in letters:
        item["kind"] = "vowel" if item in vowel_letters else "consonant"
    return {
        "normalized": normalized,
        "letters": letters,
        "expression": asdict(Calculation(expression.value, [f"all letters={expression_total}", *expression.trace[1:]])),
        "soul_urge": asdict(Calculation(soul.value, [f"vowels={soul_total}", *soul.trace[1:]])),
        "personality": asdict(Calculation(personality.value, [f"consonants={personality_total}", *personality.trace[1:]])),
    }


def _birthday_in_year(born: date, year: int) -> date:
    if born.month == 2 and born.day == 29:
        try:
            return date(year, 2, 29)
        except ValueError:
            return date(year, 2, 28)
    return date(year, born.month, born.day)


def personal_year(value: date | str, selected_year: int) -> Calculation:
    born = parse_calendar_date(value)
    digits = list(map(int, f"{born.day}{born.month}{selected_year}"))
    total = sum(digits)
    reduced = reduce_personal_year(total)
    return Calculation(reduced.value, [f"{'+'.join(map(str, digits))}={total}", *reduced.trace[1:]])


def personal_year_views(value: date | str, as_of: date | str) -> dict:
    born, current = parse_calendar_date(value), parse_calendar_date(as_of)
    this_birthday = _birthday_in_year(born, current.year)
    cycle_year = current.year if current >= this_birthday else current.year - 1
    cycle_start = _birthday_in_year(born, cycle_year)
    cycle_end = _birthday_in_year(born, cycle_year + 1) - timedelta(days=1)
    birthday_result = personal_year(born, cycle_year)
    calendar_result = personal_year(born, current.year)
    return {
        "default_mode": "birthday_to_birthday",
        "birthday_to_birthday": {
            **asdict(birthday_result),
            "selected_year": cycle_year,
            "starts_on": cycle_start.isoformat(),
            "ends_on": cycle_end.isoformat(),
        },
        "calendar_year": {
            **asdict(calendar_result),
            "selected_year": current.year,
            "starts_on": date(current.year, 1, 1).isoformat(),
            "ends_on": date(current.year, 12, 31).isoformat(),
        },
    }


def build_profile(
    birth_date: date | str,
    *,
    as_of: date | str,
    full_name: str | None = None,
    y_consonant_indexes: set[int] | None = None,
) -> dict:
    born = parse_calendar_date(birth_date)
    method_a, method_b = life_path_method_a(born), life_path_method_b(born)
    name_result = name_numbers(full_name, y_consonant_indexes) if full_name and full_name.strip() else None
    return {
        "calculation_version": CALCULATION_VERSION,
        "inputs": {"birth_date": born.isoformat(), "full_name": full_name},
        "normalized": {"birth_date": born.isoformat(), "full_name": name_result["normalized"] if name_result else None},
        "life_path": {"headline": asdict(method_a), "alternate": asdict(method_b)},
        "birthday_number": asdict(birthday_number(born)),
        "name": name_result,
        "personal_year": personal_year_views(born, as_of),
    }
