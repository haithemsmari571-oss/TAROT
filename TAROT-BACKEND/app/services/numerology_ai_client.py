"""Bounded provider call for the public numerology report only."""

from app.config import get_app_settings
from app.services.ai.client import AiNotConfigured, estimate_cost


def run_prompt_bounded(
    prompt_text: str,
    model: str,
    *,
    max_tokens: int,
    timeout_seconds: float,
) -> dict:
    """Make one non-streaming call with no SDK retry loop."""
    key = get_app_settings().ANTHROPIC_API_KEY
    if not key:
        raise AiNotConfigured()

    from anthropic import Anthropic

    client = Anthropic(
        api_key=key,
        timeout=timeout_seconds,
        max_retries=0,
    )
    message = client.messages.create(
        model=model,
        max_tokens=max_tokens,
        messages=[{"role": "user", "content": prompt_text}],
    )
    text = "".join(
        getattr(block, "text", "")
        for block in message.content
        if getattr(block, "type", "") == "text"
    )
    usage = message.usage
    return {
        "text": text,
        "input_tokens": usage.input_tokens,
        "output_tokens": usage.output_tokens,
        "cost_usd": estimate_cost(usage.input_tokens, usage.output_tokens),
    }
