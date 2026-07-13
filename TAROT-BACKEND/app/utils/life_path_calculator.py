from datetime import datetime, date


def reduce_to_single_digit(number: int, allow_master_numbers: bool = True) -> int:
    """
    Reduce a number to a single digit (or master number 11, 22, 33).

    Args:
        number: Number to reduce
        allow_master_numbers: If True, preserve 11, 22, 33

    Returns:
        Reduced number (1-9, or 11, 22, 33 if master number)
    """
    # Check for master numbers
    if allow_master_numbers and number in [11, 22, 33]:
        return number

    # Keep reducing until single digit
    while number > 9:
        number = sum(int(digit) for digit in str(number))
        # Check for master numbers after each reduction
        if allow_master_numbers and number in [11, 22, 33]:
            return number

    return number


def _coerce_date(birth_date: date | str) -> date:
    """Accept a date/datetime or a 'YYYY-MM-DD' (dossier ISO) / 'DD/MM/YYYY'
    string and return a plain date. The dossier stores DOB as an ISO string
    (date.isoformat()), while the /oracle utils historically pass 'DD/MM/YYYY'."""
    if isinstance(birth_date, datetime):
        return birth_date.date()
    if isinstance(birth_date, date):
        return birth_date
    s = str(birth_date).strip()
    try:
        return date.fromisoformat(s[:10])  # 'YYYY-MM-DD' (also strips a time suffix)
    except ValueError:
        return datetime.strptime(s, "%d/%m/%Y").date()


def calculate_life_path_number(birth_date: date | str) -> int:
    """
    Calculate life path number from birth date.

    Method: Add all digits of birth date, then reduce to single digit.
    Example: 15/05/1990 -> 1+5+0+5+1+9+9+0 = 30 -> 3+0 = 3

    Args:
        birth_date: Date object, or 'YYYY-MM-DD' / 'DD/MM/YYYY' string

    Returns:
        Life path number (1-9, 11, 22, or 33)
    """
    birth_date = _coerce_date(birth_date)

    # Convert date to string without separators: YYYYMMDD
    date_string = birth_date.strftime("%Y%m%d")

    # Sum all digits
    total = sum(int(digit) for digit in date_string)

    # Reduce to single digit or master number
    return reduce_to_single_digit(total)


def calculate_personal_year(birth_date: date | str, current_year: int) -> int:
    """Personal Year number: sum the digits of (birth month + birth day + the
    current calendar year), reduced the same way as the Life Path (11/22/33 kept).

    Example: 22 July 1992 in 2026 -> digits of 7 + 22 + 2026
             = 7 + (2+2) + (2+0+2+6) = 21 -> 3.

    Uses the concatenation of month, day and year, so summing its digits equals
    summing month-digits + day-digits + year-digits (leading zeros contribute 0);
    the single final reduction (keeping master numbers) matches the Life Path rule.
    """
    d = _coerce_date(birth_date)
    total = sum(int(ch) for ch in f"{d.month}{d.day}{current_year}")
    return reduce_to_single_digit(total)


def numerology_facts(birth_date: date | str, current_year: int) -> dict:
    """Both authoritative numerology numbers for a DOB, computed deterministically
    so the reading model is handed the correct values instead of computing them
    live (which it gets wrong). Returns {"life_path", "personal_year"}."""
    d = _coerce_date(birth_date)
    return {
        "life_path": calculate_life_path_number(d),
        "personal_year": calculate_personal_year(d, current_year),
    }


def get_life_path_compatibility_score(number1: int, number2: int) -> int:
    """
    Calculate compatibility score between two life path numbers.

    Args:
        number1: First life path number
        number2: Second life path number

    Returns:
        Compatibility score (0-100)
    """
    # Compatible number pairings (highly harmonious)
    highly_compatible = [
        (1, 5),
        (5, 1),  # Adventure & leadership
        (2, 6),
        (6, 2),  # Harmony & nurturing
        (2, 8),
        (8, 2),  # Balance & power
        (3, 5),
        (5, 3),  # Creativity & freedom
        (3, 9),
        (9, 3),  # Expression & compassion
        (4, 8),
        (8, 4),  # Structure & success
        (6, 9),
        (9, 6),  # Service & compassion
        (1, 1),  # Same number - deep understanding
        (2, 2),
        (3, 3),
        (4, 4),
        (5, 5),
        (6, 6),
        (7, 7),
        (8, 8),
        (9, 9),
        (11, 11),
        (22, 22),
        (33, 33),
    ]

    # Moderately compatible (workable with effort)
    moderately_compatible = [
        (1, 2),
        (2, 1),  # Leader & mediator
        (1, 3),
        (3, 1),  # Leader & creator
        (1, 9),
        (9, 1),  # Leader & humanitarian
        (2, 4),
        (4, 2),  # Harmony & builder
        (2, 7),
        (7, 2),  # Peacemaker & seeker
        (3, 6),
        (6, 3),  # Creator & nurturer
        (4, 6),
        (6, 4),  # Builder & caretaker
        (4, 7),
        (7, 4),  # Practical & spiritual
        (5, 7),
        (7, 5),  # Freedom & wisdom
        (7, 9),
        (9, 7),  # Seeker & humanitarian
    ]

    # Challenging (requires significant understanding)
    challenging = [
        (1, 4),
        (4, 1),  # Impulsive vs cautious
        (1, 6),
        (6, 1),  # Independence vs responsibility
        (1, 7),
        (7, 1),  # Action vs contemplation
        (1, 8),
        (8, 1),  # Ego clashes
        (3, 4),
        (4, 3),  # Spontaneous vs structured
        (3, 7),
        (7, 3),  # Social vs solitary
        (3, 8),
        (8, 3),  # Playful vs serious
        (4, 5),
        (5, 4),  # Routine vs freedom
        (4, 9),
        (9, 4),  # Practical vs idealistic
        (5, 6),
        (6, 5),  # Freedom vs commitment
        (5, 8),
        (8, 5),  # Chaos vs control
        (5, 9),
        (9, 5),  # Restless vs grounded
        (6, 7),
        (7, 6),  # Social vs reclusive
        (6, 8),
        (8, 6),  # Emotion vs ambition
        (7, 8),
        (8, 7),  # Spiritual vs material
        (8, 9),
        (9, 8),  # Power vs surrender
    ]

    # Master numbers have special compatibility
    if number1 in [11, 22, 33] or number2 in [11, 22, 33]:
        # Master numbers are highly compatible with their root numbers
        root1 = reduce_to_single_digit(number1, allow_master_numbers=False)
        root2 = reduce_to_single_digit(number2, allow_master_numbers=False)

        if number1 == number2:
            return 95  # Same master number
        if root1 == number2 or root2 == number1:
            return 85  # Master with its root

    pair = (number1, number2)

    if pair in highly_compatible:
        return 85 + (15 - abs(number1 - number2))  # 85-100
    elif pair in moderately_compatible:
        return 60 + (15 - abs(number1 - number2))  # 60-75
    elif pair in challenging:
        return 30 + (15 - abs(number1 - number2))  # 30-45
    else:
        # Default moderate compatibility
        return 55


def get_compatible_life_paths(life_path_number: int, min_score: int = 70) -> list[int]:
    """
    Get list of compatible life path numbers for a given number.

    Args:
        life_path_number: The life path number to find matches for
        min_score: Minimum compatibility score threshold

    Returns:
        List of compatible life path numbers
    """
    all_numbers = [1, 2, 3, 4, 5, 6, 7, 8, 9, 11, 22, 33]
    compatible = []

    for num in all_numbers:
        if num != life_path_number:
            score = get_life_path_compatibility_score(life_path_number, num)
            if score >= min_score:
                compatible.append(num)

    return compatible
