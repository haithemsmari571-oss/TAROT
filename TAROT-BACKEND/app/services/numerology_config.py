"""Settings for the public numerology report.

This feature intentionally keeps its settings outside ``app.config`` because
that module is part of the production-locked Valentina -> Sabri workflow.
"""

from dataclasses import dataclass
import os


def _integer(name: str, default: int) -> int:
    try:
        return int(os.getenv(name, str(default)))
    except ValueError:
        return default


def _floating(name: str, default: float) -> float:
    try:
        return float(os.getenv(name, str(default)))
    except ValueError:
        return default


@dataclass(frozen=True)
class NumerologySettings:
    NUMEROLOGY_MODEL: str
    NUMEROLOGY_MAX_TOKENS: int
    NUMEROLOGY_TIMEOUT_SECONDS: float
    NUMEROLOGY_PROVIDER_MODE: str
    NUMEROLOGY_MOCK_DELAY_SECONDS: float
    NUMEROLOGY_RATE_LIMIT_REQUESTS: int
    NUMEROLOGY_RATE_LIMIT_WINDOW_SECONDS: int
    NUMEROLOGY_CACHE_TTL_SECONDS: int


def get_numerology_settings() -> NumerologySettings:
    return NumerologySettings(
        NUMEROLOGY_MODEL=os.getenv("NUMEROLOGY_MODEL", "claude-sonnet-4-6"),
        NUMEROLOGY_MAX_TOKENS=max(1, _integer("NUMEROLOGY_MAX_TOKENS", 6000)),
        NUMEROLOGY_TIMEOUT_SECONDS=max(
            0.1, _floating("NUMEROLOGY_TIMEOUT_SECONDS", 45.0)
        ),
        NUMEROLOGY_PROVIDER_MODE=os.getenv(
            "NUMEROLOGY_PROVIDER_MODE", "anthropic"
        ),
        NUMEROLOGY_MOCK_DELAY_SECONDS=max(
            0.0, _floating("NUMEROLOGY_MOCK_DELAY_SECONDS", 0.45)
        ),
        NUMEROLOGY_RATE_LIMIT_REQUESTS=max(
            1, _integer("NUMEROLOGY_RATE_LIMIT_REQUESTS", 5)
        ),
        NUMEROLOGY_RATE_LIMIT_WINDOW_SECONDS=max(
            1, _integer("NUMEROLOGY_RATE_LIMIT_WINDOW_SECONDS", 600)
        ),
        NUMEROLOGY_CACHE_TTL_SECONDS=max(
            1, _integer("NUMEROLOGY_CACHE_TTL_SECONDS", 300)
        ),
    )
