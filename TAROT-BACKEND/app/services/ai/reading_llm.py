"""LLM call retry/backoff for the reading pipeline.

Spec: retry once after 2s, then up to 2 more with exponential backoff (4s, 8s);
if everything fails, the caller delivers a natural fallback line to the client.
The delays and the sleep function are injectable so tests run instantly.
"""

import time
from typing import Callable, Sequence

from app.logging_config import get_logger

logger = get_logger(__name__)

# Sent to the client if the whole pipeline fails after all retries.
FALLBACK_MESSAGE = "give me one moment darling, something is pulling my attention"
# Pre-programmed opening "holding" line while the first reading generates.
OPENING_HOLD_MESSAGE = "hey love give me one sec im pulling for u"

DEFAULT_DELAYS: Sequence[float] = (2, 4, 8)


class LLMCallError(RuntimeError):
    """Raised when an LLM call fails after all retries."""


def run_with_retries(
    fn: Callable[[], object],
    *,
    delays: Sequence[float] = DEFAULT_DELAYS,
    sleep: Callable[[float], None] = time.sleep,
    label: str = "llm_call",
):
    """Call fn(); on exception, wait delays[i] and retry. After exhausting all
    delays, raise LLMCallError. Total attempts = 1 + len(delays)."""
    last_exc = None
    attempts = 1 + len(delays)
    for i in range(attempts):
        try:
            return fn()
        except Exception as e:  # noqa: BLE001 — retry any failure (timeout, API, rate limit)
            last_exc = e
            if i < len(delays):
                logger.warning(
                    "llm_call_retry", label=label, attempt=i + 1, wait=delays[i], error=str(e)
                )
                sleep(delays[i])
            else:
                logger.error("llm_call_failed", label=label, attempts=attempts, error=str(e))
    raise LLMCallError(f"{label} failed after {attempts} attempts") from last_exc
