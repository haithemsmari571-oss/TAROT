"""Detailed numerology interpretation built on immutable deterministic facts.

This module never calculates numerology itself. It asks the versioned engine for
the snapshot, loads one active registry prompt, and validates one complete JSON
report. Raw personal input and generated prose are never persisted or logged.
"""
from __future__ import annotations

import asyncio
from collections import OrderedDict, defaultdict, deque
from copy import deepcopy
from datetime import date, datetime, timezone
import hashlib
import json
import secrets
from threading import Lock
import time
from typing import Any

from pydantic import ValidationError
from sqlalchemy.orm import Session

from app.schemas.numerology import NumerologyReport
from app.services.ai import registry
from app.services.ai.defaults import NUMEROLOGY_FULL_READING_KEY
from app.services.numerology import build_profile
from app.services import numerology_ai_client as ai_client
from app.services.numerology_config import (
    get_numerology_settings as get_app_settings,
)

_CACHE_MAX_ITEMS = 128
_CACHE_SALT = secrets.token_bytes(32)
_cache: OrderedDict[str, tuple[float, dict[str, Any]]] = OrderedDict()
_inflight: dict[str, asyncio.Task[dict[str, Any]]] = {}
_state_lock = asyncio.Lock()


class NumerologyReadingError(RuntimeError):
    def __init__(
        self,
        code: str,
        message: str,
        *,
        status_code: int,
        retryable: bool,
    ):
        super().__init__(message)
        self.code = code
        self.message = message
        self.status_code = status_code
        self.retryable = retryable


class SlidingWindowRateLimiter:
    """Small process-local limiter. It stores opaque caller keys, never inputs."""

    def __init__(self) -> None:
        self._events: dict[str, deque[float]] = defaultdict(deque)
        self._lock = Lock()

    def check(
        self, key: str, *, limit: int, window_seconds: int, now: float | None = None
    ) -> int | None:
        current = time.monotonic() if now is None else now
        cutoff = current - window_seconds
        with self._lock:
            events = self._events[key]
            while events and events[0] <= cutoff:
                events.popleft()
            if len(events) >= limit:
                return max(1, int(window_seconds - (current - events[0])))
            events.append(current)
            if len(self._events) > 2048:
                empty = [item for item, values in self._events.items() if not values]
                for item in empty[:512]:
                    self._events.pop(item, None)
        return None

    def reset(self) -> None:
        with self._lock:
            self._events.clear()


public_rate_limiter = SlidingWindowRateLimiter()


def _private_key(
    *,
    birth_date: str,
    full_name: str | None,
    y_consonant_indexes: set[int],
    locale: str,
    prompt_version: int,
    prompt_fingerprint: str,
) -> str:
    payload = json.dumps(
        {
            "birth_date": birth_date,
            "full_name": full_name,
            "y_consonant_indexes": sorted(y_consonant_indexes),
            "locale": locale,
            "prompt_version": prompt_version,
            # The version number alone is not enough. A row that still tracks
            # the shipped default keeps version 1 while the code constant
            # changes underneath it, so keying on the version would serve a
            # cached reading generated from the OLD wording.
            "prompt_fingerprint": prompt_fingerprint,
        },
        sort_keys=True,
        separators=(",", ":"),
    ).encode("utf-8")
    return hashlib.sha256(_CACHE_SALT + payload).hexdigest()


def _provider_snapshot(profile: dict[str, Any]) -> dict[str, Any]:
    """Minimum necessary immutable facts; raw DOB/name never leave this process."""
    name = profile.get("name")
    return {
        "calculation_version": profile["calculation_version"],
        "life_path": deepcopy(profile["life_path"]),
        "birthday_number": deepcopy(profile["birthday_number"]),
        "personal_year": deepcopy(profile["personal_year"]),
        "name": (
            {
                "expression": deepcopy(name["expression"]),
                "soul_urge": deepcopy(name["soul_urge"]),
                "personality": deepcopy(name["personality"]),
            }
            if name
            else None
        ),
        # Reserved for a future verified engine addition. Absence is explicit;
        # the model must omit the chapter rather than fabricate it.
        "numerology_grid": deepcopy(profile.get("numerology_grid")),
    }


def _paragraph(subject: str, value: int, emphasis: str) -> str:
    return (
        f"Your verified {subject} is {value}. In this reading, that pattern points "
        f"towards {emphasis}. It is best treated as a lens for reflection rather "
        "than a fixed label: notice where the quality already feels natural, where "
        "it becomes overextended, and which small choice would bring it back into balance."
    )


def build_mock_report(snapshot: dict[str, Any]) -> dict[str, Any]:
    """PII-free deterministic provider used only in tests/local acceptance."""
    life = int(snapshot["life_path"]["headline"]["value"])
    birthday = int(snapshot["birthday_number"]["value"])
    year = snapshot["personal_year"]["birthday_to_birthday"]
    personal_year = int(year["value"])
    has_name = snapshot.get("name") is not None
    name_section = None
    if has_name:
        name = snapshot["name"]
        expression = int(name["expression"]["value"])
        soul = int(name["soul_urge"]["value"])
        personality = int(name["personality"]["value"])
        name_section = {
            "expression_destiny": _paragraph(
                "Expression / Destiny number", expression, "the way your abilities want to be used"
            ),
            "soul_urge": _paragraph(
                "Soul Urge number", soul, "the private motivation beneath visible choices"
            ),
            "personality": _paragraph(
                "Personality number", personality, "the energy others are likely to meet first"
            ),
            "synthesis": (
                f"Expression {expression}, Soul Urge {soul}, and Personality {personality} "
                "describe different layers rather than competing identities. Their useful "
                "question is whether your outward pace gives your inner motivation enough room."
            ),
        }
    return {
        "personal_overview": (
            f"Life Path {life}, Birthday Number {birthday}, and Personal Year {personal_year} "
            "form the verified foundation of this reading. Together they describe a person "
            "whose enduring style, inborn emphasis, and present season need to be read as one "
            "conversation. The most useful approach is compassionate observation followed by "
            "practical choice, never treating a number as a verdict about who you must become."
        ),
        "life_path": {
            "central_character": _paragraph(
                "Life Path", life, "the central way you learn, contribute, and regain direction"
            ),
            "natural_strengths": [
                "You can recognise the core pattern in a complicated situation.",
                "You grow when you give your natural style a clear, constructive purpose.",
                "You are capable of turning self-knowledge into consistent choices.",
            ],
            "challenges": [
                "A strength can become too rigid or too scattered when it is used from pressure.",
                "Other people's expectations can temporarily obscure your own pace.",
            ],
            "growth_lessons": [
                "Choose expression over performance and steadiness over perfection.",
                "Let feedback refine your path without handing it authority over your identity.",
            ],
            "practical_guidance": [
                "Name one decision that genuinely belongs to you this week.",
                "Build a short pause between emotional information and action.",
                "Review progress by consistency, not by intensity.",
            ],
        },
        "birthday_number": {
            "overview": _paragraph(
                "Birthday Number", birthday, "an instinctive talent that is available early and often"
            ),
            "natural_gifts": [
                "A recognisable personal style that does not need constant explanation.",
                "A useful instinct for what deserves attention first.",
            ],
            "growth_edge": (
                "The growth edge is to use this gift deliberately without assuming it must "
                "carry every situation or solve every other person's problem."
            ),
        },
        "personal_year": {
            "current_period": f"{year['starts_on']} to {year['ends_on']} (birthday to birthday)",
            "central_theme": _paragraph(
                "Personal Year", personal_year, "the emphasis of the current birthday-to-birthday season"
            ),
            "relationships": (
                "Let relationships reveal what is reciprocal, timely, and emotionally sustainable. "
                "Conversation is more useful than prediction, especially when needs are changing."
            ),
            "work_money": (
                "In work and money, favour choices that fit the season's theme while preserving "
                "practical buffers. Numerology can frame priorities, but it cannot replace budgets or evidence."
            ),
            "opportunities": [
                "Choose one project whose timing feels aligned and give it a defined next step.",
                "Notice invitations that develop an existing strength instead of demanding a new persona.",
            ],
            "cautions": [
                "Do not force a symbolic theme into every event.",
                "Avoid irreversible choices made only to create a feeling of momentum.",
            ],
            "practical_timing_guidance": [
                "Use the birthday-to-birthday dates as a reflection window, not a deadline.",
                "Review intentions monthly and adjust them when real circumstances change.",
            ],
        },
        "numerology_grid": None,
        "name_numerology": name_section,
        "relationships": {
            "overview": (
                f"Life Path {life} shapes how you seek meaning in connection, while Birthday "
                f"Number {birthday} colours the way you instinctively show up. Healthy bonds "
                "make room for both closeness and an honest personal rhythm."
            ),
            "strengths": [
                "You can bring thoughtful self-awareness into important conversations.",
                "You value connection that has substance rather than appearance alone.",
            ],
            "watch_points": [
                "Over-explaining can replace the simpler act of stating a need.",
                "Symbolic insight should not be used to guess another person's intentions.",
            ],
            "guidance": [
                "Ask directly for clarity and listen to observable behaviour.",
                "Keep boundaries specific, kind, and reviewable.",
            ],
        },
        "career_purpose_money": {
            "overview": (
                f"Life Path {life} describes a durable contribution style; Personal Year "
                f"{personal_year} describes the present emphasis. Purpose grows where repeated "
                "useful action meets values, skill, and the conditions of real life."
            ),
            "natural_contributions": [
                "Making a distinct strength useful to other people.",
                "Seeing how a long-term pattern connects to today's practical decision.",
            ],
            "money_patterns": [
                "Security improves when inspiration is paired with clear limits.",
                "Pricing, saving, and spending deserve evidence beyond spiritual symbolism.",
            ],
            "practical_guidance": [
                "Define what enough looks like before pursuing more.",
                "Track one concrete work or money measure for the next month.",
            ],
        },
        "combined_synthesis": {
            "overview": (
                f"Your Life Path {life} supplies the enduring direction, Birthday Number {birthday} "
                f"adds an instinctive tool, and Personal Year {personal_year} changes the current "
                "weather. Reinforcement creates confidence; tension creates useful development. "
                "Neither requires you to force every part of life into the same expression."
            ),
            "reinforcing_patterns": [
                "Self-knowledge becomes strongest when it is translated into an ordinary habit.",
                "Your natural gift can support the current season without taking it over.",
            ],
            "creative_tensions": [
                "The long-term path may ask for patience while the present season asks for movement.",
                "Inner motivation and visible presentation may need a more honest conversation.",
            ],
            "integration": (
                "Integration means letting each verified number answer its own question: the "
                "Life Path for enduring direction, the Birthday Number for instinctive talent, "
                "and the Personal Year for timing and emphasis."
            ),
        },
        "practical_guidance": {
            "priorities": [
                "Protect the decision that most clearly reflects your values.",
                "Create enough structure for your natural strength to remain dependable.",
                "Use the current cycle as a theme for review rather than a prediction.",
            ],
            "next_steps": [
                "Write one intention in language you can act on this week.",
                "Choose one conversation where a direct question would replace assumption.",
                "Schedule a monthly review before the current birthday cycle ends.",
            ],
            "timing_notes": [
                f"Treat {year['starts_on']} to {year['ends_on']} as the primary reflective period.",
                "Let real opportunities and constraints override symbolic timing when necessary.",
            ],
        },
        "reflection_questions": [
            "Where is my central strength already working quietly and well?",
            "Which challenge is asking for a boundary rather than more effort?",
            "What would aligned progress look like during this birthday-to-birthday season?",
            "Which part of my public role feels least connected to my inner motivation?",
        ],
        "disclaimer": (
            "Numerology is spiritual and interpretive guidance for reflection. It is not "
            "scientific fact, diagnosis, professional advice, or a guarantee of future events."
        ),
    }


def _validate_report(text: str, *, has_name: bool, has_grid: bool) -> NumerologyReport:
    try:
        candidate = json.loads(text.strip())
    except json.JSONDecodeError:
        # One controlled repair pass: extract a single JSON object/fence. There
        # is no second provider call and no partially parsed data is returned.
        try:
            candidate = ai_client.parse_json_object(text)
        except (ValueError, json.JSONDecodeError) as error:
            raise NumerologyReadingError(
                "invalid_provider_response",
                "The detailed reading was not valid JSON. Please try again.",
                status_code=502,
                retryable=True,
            ) from error
    try:
        report = NumerologyReport.model_validate(candidate)
    except ValidationError as error:
        raise NumerologyReadingError(
            "invalid_provider_response",
            "The detailed reading did not match the required report structure. Please try again.",
            status_code=502,
            retryable=True,
        ) from error
    if has_name != (report.name_numerology is not None):
        raise NumerologyReadingError(
            "invalid_provider_response",
            "The detailed reading returned an inconsistent name-numerology section. Please try again.",
            status_code=502,
            retryable=True,
        )
    if not has_grid and report.numerology_grid is not None:
        raise NumerologyReadingError(
            "invalid_provider_response",
            "The detailed reading invented an unavailable numerology-grid section. Please try again.",
            status_code=502,
            retryable=True,
        )
    return report


def _provider_error(error: Exception) -> NumerologyReadingError:
    if isinstance(error, ai_client.AiNotConfigured):
        return NumerologyReadingError(
            "provider_not_configured",
            "The detailed reading service is not configured yet.",
            status_code=503,
            retryable=True,
        )
    name = type(error).__name__.lower()
    status = getattr(error, "status_code", None)
    if isinstance(error, TimeoutError) or "timeout" in name:
        return NumerologyReadingError(
            "provider_timeout",
            "The interpretation took too long. Your verified numbers are still available; please retry.",
            status_code=504,
            retryable=True,
        )
    if status == 429 or "ratelimit" in name or "rate_limit" in name:
        return NumerologyReadingError(
            "provider_busy",
            "The interpretation service is busy. Your verified numbers are safe; please retry shortly.",
            status_code=503,
            retryable=True,
        )
    return NumerologyReadingError(
        "provider_unavailable",
        "The detailed interpretation is temporarily unavailable. Your verified numbers are still available.",
        status_code=502,
        retryable=True,
    )


async def _generate(
    *,
    profile: dict[str, Any],
    prompt_text: str,
    prompt_schema: dict[str, Any] | None,
    model: str,
) -> dict[str, Any]:
    settings = get_app_settings()
    snapshot = _provider_snapshot(profile)
    if settings.NUMEROLOGY_PROVIDER_MODE.strip().lower() == "mock":
        mock_delay = max(0.0, float(getattr(settings, "NUMEROLOGY_MOCK_DELAY_SECONDS", 0)))
        if mock_delay:
            await asyncio.sleep(mock_delay)
        provider_result = {
            "text": json.dumps(build_mock_report(snapshot)),
            "input_tokens": 0,
            "output_tokens": 0,
            "cost_usd": 0,
        }
        response_model = "local-deterministic-mock"
    else:
        rendered = registry.render_text(
            prompt_text,
            calculation_snapshot=json.dumps(
                snapshot, sort_keys=True, separators=(",", ":")
            ),
        )
        # The schema is part of the versioned registry record, not a second
        # authored prompt. It is supplied verbatim as the machine contract.
        provider_input = (
            rendered
            + "\n\nSTRUCTURED OUTPUT SCHEMA (follow exactly):\n"
            + json.dumps(prompt_schema or NumerologyReport.model_json_schema())
        )
        try:
            provider_result = await asyncio.to_thread(
                ai_client.run_prompt_bounded,
                provider_input,
                model,
                max_tokens=settings.NUMEROLOGY_MAX_TOKENS,
                timeout_seconds=settings.NUMEROLOGY_TIMEOUT_SECONDS,
            )
        except Exception as error:
            raise _provider_error(error) from error
        response_model = model
    report = _validate_report(
        provider_result["text"],
        has_name=snapshot["name"] is not None,
        has_grid=snapshot["numerology_grid"] is not None,
    )
    return {
        "calculationSnapshot": profile,
        "report": report.model_dump(),
        "calculationVersion": profile["calculation_version"],
        "promptKey": NUMEROLOGY_FULL_READING_KEY,
        "model": response_model,
        "generatedAt": datetime.now(timezone.utc),
        "cached": False,
    }


async def generate_full_reading(
    db: Session,
    *,
    birth_date: str,
    full_name: str | None,
    locale: str,
    y_consonant_indexes: set[int] | None = None,
    as_of: date | None = None,
) -> dict[str, Any]:
    profile = build_profile(
        birth_date,
        as_of=as_of or date.today(),
        full_name=full_name,
        y_consonant_indexes=y_consonant_indexes,
    )
    prompt, version, prompt_text = registry.get_active_prompt(db, NUMEROLOGY_FULL_READING_KEY)
    cache_key = _private_key(
        birth_date=profile["inputs"]["birth_date"],
        full_name=full_name,
        y_consonant_indexes=y_consonant_indexes or set(),
        locale=locale,
        prompt_version=version.version,
        prompt_fingerprint=hashlib.sha256(prompt_text.encode("utf-8")).hexdigest()[:16],
    )
    settings = get_app_settings()
    now = time.monotonic()
    async with _state_lock:
        cached = _cache.get(cache_key)
        if cached and cached[0] > now:
            _cache.move_to_end(cache_key)
            result = deepcopy(cached[1])
            result["cached"] = True
            return result
        if cached:
            _cache.pop(cache_key, None)
        task = _inflight.get(cache_key)
        owner = task is None
        if task is None:
            task = asyncio.create_task(
                _generate(
                    profile=profile,
                    prompt_text=prompt_text,
                    prompt_schema=prompt.output_schema,
                    model=prompt.model,
                )
            )
            _inflight[cache_key] = task
    try:
        result = await asyncio.shield(task)
    finally:
        if owner:
            async with _state_lock:
                _inflight.pop(cache_key, None)
    result["promptVersion"] = version.version
    if owner:
        async with _state_lock:
            _cache[cache_key] = (
                time.monotonic() + settings.NUMEROLOGY_CACHE_TTL_SECONDS,
                deepcopy(result),
            )
            _cache.move_to_end(cache_key)
            while len(_cache) > _CACHE_MAX_ITEMS:
                _cache.popitem(last=False)
        return result
    result = deepcopy(result)
    result["cached"] = True
    return result


def reset_runtime_state_for_tests() -> None:
    _cache.clear()
    _inflight.clear()
    public_rate_limiter.reset()
