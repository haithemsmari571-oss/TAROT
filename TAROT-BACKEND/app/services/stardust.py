"""Stardust custom-amount pricing.

Single source of truth for the interactive "glider" checkout. The client sends a
dollar amount only; the tier, bonus percentage and awarded points are always
computed here on the server. Never trust a client-sent point total.

Fixed pricing model (USD):
    $15 - $99    no bonus            $1 = 1 point
    $100 - $249  +25% bonus points   "Whisper" tier
    $250 - $449  +40% bonus points   "Revelation" tier
    $450 - $999  +60% bonus points   "Devotion" tier
    $1000        Lifetime Access     no points, manual fulfilment
"""

from dataclasses import dataclass

STARDUST_MIN_USD = 15
STARDUST_MAX_USD = 1000  # top of the slider == Lifetime Access

# Machine-readable tier keys (stored in Stripe metadata / transaction records)
TIER_BASE = "base"
TIER_WHISPER = "whisper"
TIER_REVELATION = "revelation"
TIER_DEVOTION = "devotion"
TIER_LIFETIME = "lifetime"

LIFETIME_COPY = (
    "Lifetime Access Unlocked — 1 hour of reading time, daily, for life."
)

# The bonus-tier bands, in one place. These MUST mirror the thresholds used in
# ``calculate_stardust_quote`` below (kept co-located so they can't drift). This
# is what the admin "Stardust Tiers" page reads so it always shows the real,
# live pricing rather than the retired ``buy_options`` rows.
STARDUST_BANDS = [
    {"key": TIER_BASE, "name": "Stardust", "bonus_pct": 0.0, "min_usd": STARDUST_MIN_USD, "max_usd": 99},
    {"key": TIER_WHISPER, "name": "Whisper", "bonus_pct": 0.25, "min_usd": 100, "max_usd": 249},
    {"key": TIER_REVELATION, "name": "Revelation", "bonus_pct": 0.40, "min_usd": 250, "max_usd": 449},
    {"key": TIER_DEVOTION, "name": "Devotion", "bonus_pct": 0.60, "min_usd": 450, "max_usd": 999},
]


def get_public_tiers() -> dict:
    """Read-only view of the live Stardust pricing (bands + range + lifetime).

    Derived from the same constants the checkout engine uses, so the admin page
    never drifts from what customers actually pay. Money is GBP (£1 = 1 point).
    """
    return {
        "min_usd": STARDUST_MIN_USD,
        "max_usd": STARDUST_MAX_USD,
        "lifetime_copy": LIFETIME_COPY,
        "bands": STARDUST_BANDS,
    }


@dataclass
class StardustQuote:
    amount_usd: int
    tier: str  # machine key, e.g. "whisper"
    tier_name: str  # display name, e.g. "Whisper"
    bonus_pct: float  # 0.25 == +25%
    base_points: int
    bonus_points: int
    total_points: int
    is_lifetime: bool


def calculate_stardust_quote(amount_usd: int) -> StardustQuote:
    """Compute the tier and points for a whole-dollar amount.

    Assumes ``amount_usd`` has already passed :func:`validate_stardust_amount`.
    """
    if amount_usd >= STARDUST_MAX_USD:
        return StardustQuote(
            amount_usd=STARDUST_MAX_USD,
            tier=TIER_LIFETIME,
            tier_name="Lifetime Access",
            bonus_pct=0.0,
            base_points=0,
            bonus_points=0,
            total_points=0,
            is_lifetime=True,
        )

    if amount_usd >= 450:
        bonus_pct, tier, tier_name = 0.60, TIER_DEVOTION, "Devotion"
    elif amount_usd >= 250:
        bonus_pct, tier, tier_name = 0.40, TIER_REVELATION, "Revelation"
    elif amount_usd >= 100:
        bonus_pct, tier, tier_name = 0.25, TIER_WHISPER, "Whisper"
    else:
        bonus_pct, tier, tier_name = 0.0, TIER_BASE, "Stardust"

    base_points = amount_usd  # $1 = 1 point
    bonus_points = int(base_points * bonus_pct)

    return StardustQuote(
        amount_usd=amount_usd,
        tier=tier,
        tier_name=tier_name,
        bonus_pct=bonus_pct,
        base_points=base_points,
        bonus_points=bonus_points,
        total_points=base_points + bonus_points,
        is_lifetime=False,
    )


def validate_stardust_amount(amount_usd: int) -> int:
    """Validate the requested amount is a whole dollar value within range.

    Raises:
        ValueError: if the amount is out of the [15, 1000] range.
    """
    if amount_usd < STARDUST_MIN_USD or amount_usd > STARDUST_MAX_USD:
        raise ValueError(
            f"amount_usd must be between ${STARDUST_MIN_USD} and ${STARDUST_MAX_USD}"
        )
    return amount_usd
