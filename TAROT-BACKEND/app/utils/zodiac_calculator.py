from datetime import datetime, date


def get_zodiac_sign_from_date(birth_date: date | str) -> str:
    """
    Get zodiac sign name from a birth date.

    Args:
        birth_date: Date object or string in format 'DD/MM/YYYY'

    Returns:
        Zodiac sign name (e.g., 'Aries', 'Gemini')
    """
    if isinstance(birth_date, str):
        birth_date = datetime.strptime(birth_date, "%d/%m/%Y").date()

    month = birth_date.month
    day = birth_date.day

    # Zodiac date ranges (month, start_day, end_day, sign_name)
    zodiac_ranges = [
        (1, 1, 19, "Capricorn"),
        (1, 20, 31, "Aquarius"),
        (2, 1, 18, "Aquarius"),
        (2, 19, 29, "Pisces"),
        (3, 1, 20, "Pisces"),
        (3, 21, 31, "Aries"),
        (4, 1, 19, "Aries"),
        (4, 20, 30, "Taurus"),
        (5, 1, 20, "Taurus"),
        (5, 21, 31, "Gemini"),
        (6, 1, 20, "Gemini"),
        (6, 21, 30, "Cancer"),
        (7, 1, 22, "Cancer"),
        (7, 23, 31, "Leo"),
        (8, 1, 22, "Leo"),
        (8, 23, 31, "Virgo"),
        (9, 1, 22, "Virgo"),
        (9, 23, 30, "Libra"),
        (10, 1, 22, "Libra"),
        (10, 23, 31, "Scorpio"),
        (11, 1, 21, "Scorpio"),
        (11, 22, 30, "Sagittarius"),
        (12, 1, 21, "Sagittarius"),
        (12, 22, 31, "Capricorn"),
    ]

    for range_month, start_day, end_day, sign in zodiac_ranges:
        if month == range_month and start_day <= day <= end_day:
            return sign

    return "Unknown"


def calculate_element_compatibility_base(element1: str, element2: str) -> int:
    """
    Calculate base compatibility score based on elemental pairing.

    Args:
        element1: First element (Fire, Earth, Air, Water)
        element2: Second element

    Returns:
        Base compatibility score (0-40)
    """
    # Same element - deeply harmonious
    if element1 == element2:
        return 40

    # Compatible elements
    compatible_pairs = [
        ("Fire", "Air"),
        ("Air", "Fire"),
        ("Earth", "Water"),
        ("Water", "Earth"),
    ]

    if (element1, element2) in compatible_pairs:
        return 30

    # Challenging but workable
    challenging_pairs = [
        ("Fire", "Water"),
        ("Water", "Fire"),
        ("Earth", "Air"),
        ("Air", "Earth"),
    ]

    if (element1, element2) in challenging_pairs:
        return 15

    # Opposing (Fire-Earth, Air-Water)
    return 10


def calculate_modality_bonus(modality1: str, modality2: str) -> int:
    """
    Calculate compatibility bonus based on modality pairing.

    Args:
        modality1: First modality (Cardinal, Fixed, Mutable)
        modality2: Second modality

    Returns:
        Bonus score (5-10)
    """
    if modality1 == modality2:
        return 10  # Same pace and approach
    return 5  # Complementary differences


def get_elemental_insight(element1: str, element2: str) -> str:
    """
    Get elemental insight description based on element pairing.

    Args:
        element1: First element
        element2: Second element

    Returns:
        Descriptive text about the elemental pairing
    """
    if element1 == element2:
        return f"Same-element pairing — deeply intuitive and naturally harmonious. You speak the same cosmic language."

    insights = {
        (
            "Fire",
            "Air",
        ): "Fire and air feed each other — passionate and intellectually stimulating. Your connection ignites new possibilities.",
        (
            "Air",
            "Fire",
        ): "Air and fire create sparks — mentally stimulating and full of energy. Together you fuel each other's passions.",
        (
            "Earth",
            "Water",
        ): "Earth and water nurture — stable, supportive, and emotionally fulfilling. A grounding, flowing connection.",
        (
            "Water",
            "Earth",
        ): "Water and earth blend beautifully — emotional depth meets practical stability. You grow together naturally.",
        (
            "Fire",
            "Water",
        ): "Fire and water challenge each other — intense and transformative. Steam rises when you meet.",
        (
            "Water",
            "Fire",
        ): "Water and fire create steam — passionate yet turbulent. Your connection transforms both of you.",
        (
            "Earth",
            "Air",
        ): "Earth and air have different rhythms — practical meets intellectual. Growth comes through understanding differences.",
        (
            "Air",
            "Earth",
        ): "Air and earth teach each other — ideas meet reality. Your connection requires patience and appreciation.",
        (
            "Fire",
            "Earth",
        ): "Fire and earth move differently — passion meets pragmatism. Balance is key to harmony.",
        (
            "Earth",
            "Fire",
        ): "Earth and fire blend action with stability — grounding meets enthusiasm. You complement through contrast.",
        (
            "Air",
            "Water",
        ): "Air and water flow differently — thought meets feeling. Understanding each other's nature brings connection.",
        (
            "Water",
            "Air",
        ): "Water and air swirl together — emotion meets intellect. Your depths and heights create unique harmony.",
    }

    return insights.get(
        (element1, element2),
        "A unique cosmic pairing with lessons to teach each other.",
    )


def calculate_compatibility_percentages(
    element1: str,
    element2: str,
    modality1: str,
    modality2: str,
    planet1: str,
    planet2: str,
) -> dict:
    """
    Calculate all compatibility percentages based on astrological factors.

    Args:
        element1, element2: Elements of the two signs
        modality1, modality2: Modalities of the two signs
        planet1, planet2: Ruling planets of the two signs

    Returns:
        Dictionary with love, communication, emotional_bond, and overall percentages
    """
    # Base compatibility from elements
    base_score = calculate_element_compatibility_base(element1, element2)
    modality_bonus = calculate_modality_bonus(modality1, modality2)

    # Love percentage - emotion-focused, boosted by element harmony
    love = base_score + modality_bonus
    if element1 in ["Fire", "Water"]:
        love += 5  # Passionate/emotional signs
    if element2 in ["Fire", "Water"]:
        love += 5
    love = min(100, max(10, love))

    # Communication percentage - intellectual connection
    communication = base_score + modality_bonus
    if element1 == "Air":
        communication += 10  # Air signs are communicative
    if element2 == "Air":
        communication += 10
    if planet1 == "Mercury" or planet2 == "Mercury":
        communication += 10  # Mercury rules communication
    communication = min(100, max(10, communication))

    # Emotional bond - depth of connection
    emotional_bond = base_score + modality_bonus
    if element1 == "Water":
        emotional_bond += 10  # Water signs are emotional
    if element2 == "Water":
        emotional_bond += 10
    if planet1 == "Moon" or planet2 == "Moon":
        emotional_bond += 10  # Moon rules emotions
    emotional_bond = min(100, max(10, emotional_bond))

    # Overall harmony - balanced average with slight boost for same element
    overall = (love + communication + emotional_bond) // 3
    if element1 == element2:
        overall += 5
    overall = min(100, max(10, overall))

    return {
        "love_percentage": love,
        "communication_percentage": communication,
        "emotional_bond_percentage": emotional_bond,
        "overall_harmony_percentage": overall,
    }
