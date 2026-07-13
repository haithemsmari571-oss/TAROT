"""Thin wrapper over the Claude API (Messages) for the content engine + prompt
"Run test". The API key comes from a server-side env var only. Never import this
anywhere near frontend/response code that would leak the key."""

import json
import re
from typing import Optional

from app.config import get_app_settings
from app.logging_config import get_logger

logger = get_logger(__name__)

# Cost estimate for the admin display (Claude Haiku, USD per token). These are
# estimates for the cost readout only — the real spend guard is the token budget.
INPUT_COST_PER_TOKEN = 1.0 / 1_000_000
OUTPUT_COST_PER_TOKEN = 5.0 / 1_000_000

DEFAULT_MAX_TOKENS = 1024


class AiNotConfigured(Exception):
    """Raised when no Anthropic API key is configured."""

    def __init__(self):
        super().__init__(
            "No Claude API key configured. Add ANTHROPIC_API_KEY to "
            "TAROT-BACKEND/.env (get one at console.anthropic.com)."
        )


def is_configured() -> bool:
    return bool(get_app_settings().ANTHROPIC_API_KEY)


def _client():
    key = get_app_settings().ANTHROPIC_API_KEY
    if not key:
        raise AiNotConfigured()
    from anthropic import Anthropic  # imported lazily so the app boots without it

    return Anthropic(api_key=key)


def estimate_cost(input_tokens: int, output_tokens: int) -> float:
    return round(
        input_tokens * INPUT_COST_PER_TOKEN + output_tokens * OUTPUT_COST_PER_TOKEN, 4
    )


def run_prompt(prompt_text: str, model: str, max_tokens: int = DEFAULT_MAX_TOKENS) -> dict:
    """Run a prompt against a model. Returns text + token usage + cost estimate.
    Raises AiNotConfigured if no key; propagates SDK errors for the caller to
    handle (retry/fallback)."""
    client = _client()
    msg = client.messages.create(
        model=model,
        max_tokens=max_tokens,
        messages=[{"role": "user", "content": prompt_text}],
    )
    text = "".join(getattr(b, "text", "") for b in msg.content if getattr(b, "type", "") == "text")
    usage = msg.usage
    return {
        "text": text,
        "input_tokens": usage.input_tokens,
        "output_tokens": usage.output_tokens,
        "cost_usd": estimate_cost(usage.input_tokens, usage.output_tokens),
    }


def run_chat(
    system: str,
    user_content: str,
    model: str,
    max_tokens: int = DEFAULT_MAX_TOKENS,
) -> dict:
    """Run a single-turn chat with an optional system prompt. Same return shape
    as run_prompt (text + token usage + cost). Blocking — call from a thread if
    you are on the event loop. Raises AiNotConfigured if no key; propagates SDK
    errors for the caller to handle (retry/fallback)."""
    client = _client()
    kwargs: dict = {
        "model": model,
        "max_tokens": max_tokens,
        "messages": [{"role": "user", "content": user_content}],
    }
    if system:
        kwargs["system"] = system
    msg = client.messages.create(**kwargs)
    text = "".join(
        getattr(b, "text", "") for b in msg.content if getattr(b, "type", "") == "text"
    )
    usage = msg.usage
    return {
        "text": text,
        "input_tokens": usage.input_tokens,
        "output_tokens": usage.output_tokens,
        "cost_usd": estimate_cost(usage.input_tokens, usage.output_tokens),
    }


def run_chat_stream(
    system: str,
    user_content: str,
    model: str,
    max_tokens: int = DEFAULT_MAX_TOKENS,
    thinking: Optional[dict] = None,
    effort: Optional[str] = None,
):
    """Stream a single-turn chat, yielding text deltas as the model generates them.
    Blocking generator — drive it from a thread if you are on the event loop. The
    single-agent Reader consumes this: accumulate deltas, split into bubbles on the
    blank-line delimiter, filter each, and emit. Raises AiNotConfigured if no key;
    propagates SDK errors for the caller to handle (retry/fallback).

    ``thinking`` (e.g. {"type": "adaptive"}) and ``effort`` ("low".."max", set inside
    output_config) enable extended thinking on the 4.6+ models. Only text deltas are
    yielded — thinking happens server-side and never reaches the caller — so bubble
    parsing is unaffected."""
    client = _client()
    kwargs: dict = {
        "model": model,
        "max_tokens": max_tokens,
        "messages": [{"role": "user", "content": user_content}],
    }
    if system:
        kwargs["system"] = system
    if thinking:
        kwargs["thinking"] = thinking
    if effort:
        kwargs["output_config"] = {"effort": effort}
    with client.messages.stream(**kwargs) as stream:
        for delta in stream.text_stream:
            yield delta


def parse_json_object(text: str) -> dict:
    """Best-effort parse of a JSON object from model output — tolerates ```json
    fences and leading/trailing prose. Raises ValueError if none found/valid."""
    cleaned = text.strip()
    # strip code fences
    cleaned = re.sub(r"^```(?:json)?\s*|\s*```$", "", cleaned, flags=re.IGNORECASE).strip()
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        pass
    # fall back to the first {...} block
    match = re.search(r"\{.*\}", cleaned, flags=re.DOTALL)
    if match:
        return json.loads(match.group(0))
    raise ValueError("No JSON object found in model output")
