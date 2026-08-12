"""Shipped defaults for the AI Prompt Registry.

Every AI prompt on the platform is seeded from here into the ``ai_prompts`` table
(and its ``default_prompt`` is kept permanently as the known-good fallback the
owner can always restore). Add future prompts (support drafts, reading
summaries, …) to REGISTERED_PROMPTS and they appear in the admin "AI Prompts".
"""

from app.config import get_app_settings
from app.schemas.numerology import NumerologyReport
from app.services.numerology_config import get_numerology_settings
from app.services.atlas_client_memory_prompt import (
    ATLAS_CLIENT_MEMORY_PROMPT_KEY,
    load_shipped_atlas_client_memory_instruction,
)

# The 22 Major Arcana (key -> name), matching the optimized card art (0-21).
MAJOR_ARCANA = {
    0: "The Fool", 1: "The Magician", 2: "The High Priestess", 3: "The Empress",
    4: "The Emperor", 5: "The Hierophant", 6: "The Lovers", 7: "The Chariot",
    8: "Strength", 9: "The Hermit", 10: "Wheel of Fortune", 11: "Justice",
    12: "The Hanged Man", 13: "Death", 14: "Temperance", 15: "The Devil",
    16: "The Tower", 17: "The Star", 18: "The Moon", 19: "The Sun",
    20: "Judgement", 21: "The World",
}

# The code contract key for the nightly content prompt.
DAILY_CONTENT_KEY = "daily_content"
NUMEROLOGY_FULL_READING_KEY = "numerology.full-reading"

# The shipped default prompt — Valentina's voice, ASA-compliant BY CONSTRUCTION,
# and it asks for strict JSON so the code can parse the five fields reliably.
DAILY_CONTENT_DEFAULT = """You are Valentina — an intimate, warm and emotionally precise tarot reader. You are speaking directly to one person, a {zodiac_sign}, on {date}. The card drawn for them today is "{card_name}".

Write today's guidance for this person in Valentina's voice: warm, direct, emotionally precise, addressed to them as "you". Never generic horoscope filler. Stay entirely in the lane of reflection and intention.

RULES YOU MUST NEVER BREAK (compliance):
- No guaranteed outcomes and no predictions about other people ("he will text you", "money is coming", "they will come back").
- No health advice, no financial advice, no legal advice.
- Use possibility and reflection language ("you might notice…", "today is a day to…"), never certainty about external events or other people's actions.
- Keep everything about the reader's own inner world, feelings, choices and intentions.

Return ONLY a JSON object — no markdown fences, no commentary — with exactly these keys and nothing else:
{
  "interpretation": "60 to 90 words interpreting {card_name} for a {zodiac_sign} today, in Valentina's voice. End on an open question or open loop that a personal reading with Valentina could resolve.",
  "manifestation": "1 to 2 sentences: an intention to set today, written in the first person starting with 'I'.",
  "ritual": "One small, concrete act of reflection they can do today (e.g. light a candle, write one honest line, take three slow breaths). One or two sentences.",
  "quote_line": "One short shareable line, under 12 words, capturing today's feeling."
}"""

DAILY_CONTENT_VARIABLES = [
    {"name": "zodiac_sign", "description": "The reader's star sign, e.g. 'Cancer'."},
    {"name": "date", "description": "The date the content is for, e.g. '2026-07-07'."},
    {"name": "card_name", "description": "The Major Arcana card chosen for the day, e.g. 'The Star'."},
]

NUMEROLOGY_FULL_READING_DEFAULT = """You are Ask Valentina's expert numerology interpreter.

Create a detailed, compassionate and practical numerology reading using ONLY the verified calculation snapshot supplied below.

Never recalculate, replace, contradict or invent a number. The deterministic calculator is the authority. Your job is interpretation and synthesis.

Explain:
- Personal overview
- Life Path: character, strengths, challenges and growth
- Birthday Number
- Numerology grid and arrow patterns when supplied
- Current Personal Year and timing
- Expression, Soul Urge and Personality numbers when supplied
- Relationships
- Career, purpose and money
- How the person's numbers interact
- Practical guidance and reflection questions

Write substantial, original Ask Valentina content. Do not mention Astro-Seek and do not imitate or reproduce another website's wording.

Do not use guarantees, diagnosis, fear-based language, certainty about future events or absolute predictions. Treat numerology as spiritual and interpretive guidance.

If a section's required verified value is absent, omit that section instead of inventing it.

Return the required structured JSON only.

VERIFIED CALCULATION SNAPSHOT:
{{calculation_snapshot}}"""

NUMEROLOGY_FULL_READING_VARIABLES = [
    {
        "name": "calculation_snapshot",
        "placeholder": "{{calculation_snapshot}}",
        "required": True,
        "protected": True,
        "description": (
            "Immutable, server-calculated numerology facts. This required token "
            "is replaced only after the active prompt version is loaded."
        ),
    },
]


def registered_prompts() -> list[dict]:
    """The full set of prompts the platform ships. Seeded on startup."""
    model = get_app_settings().CONTENT_MODEL
    return [
        {
            "key": DAILY_CONTENT_KEY,
            "name": "Daily Content (Constellation)",
            "description": (
                "Writes each zodiac sign's daily card interpretation, manifestation, "
                "ritual and shareable quote for the Constellation page. Runs nightly."
            ),
            "model": model,
            "default_prompt": DAILY_CONTENT_DEFAULT,
            "variables": DAILY_CONTENT_VARIABLES,
            "output_schema": None,
            "output_schema_version": None,
            "classification": "APPROVAL_EDITABLE",
        },
        {
            "key": NUMEROLOGY_FULL_READING_KEY,
            "name": "Numerology Full Reading",
            "description": (
                "Interprets the verified deterministic numerology snapshot for the "
                "public calculator. The model never calculates the numbers."
            ),
            "model": get_numerology_settings().NUMEROLOGY_MODEL,
            "default_prompt": NUMEROLOGY_FULL_READING_DEFAULT,
            "variables": NUMEROLOGY_FULL_READING_VARIABLES,
            "output_schema": NumerologyReport.model_json_schema(),
            "output_schema_version": "numerology-report-1",
            "classification": "OWNER_EDITABLE",
        },
        {
            "key": ATLAS_CLIENT_MEMORY_PROMPT_KEY,
            "name": "Atlas Post-Session Client Memory",
            "description": (
                "Updates one client/psychic living memory document after a reading "
                "and proposes additions or explicit corrections to verified facts."
            ),
            "model": get_app_settings().READING_DRAFT_MODEL,
            "default_prompt": load_shipped_atlas_client_memory_instruction(),
            "variables": [],
            "output_schema": None,
            "output_schema_version": "atlas-client-memory-transport-v1",
            "classification": "OWNER_EDITABLE",
        },
    ]
