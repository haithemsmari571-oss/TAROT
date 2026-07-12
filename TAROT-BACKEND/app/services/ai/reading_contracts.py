"""Data contracts for the Valentina/Sabri delivery pipeline.

Valentina outputs raw structured text (a full 4-part reading or 3-8 micro-read
lines) — no parsing needed. Sabri outputs JSON that is EITHER:

  - a Valentina request  (it needs content generated / corrected first), or
  - a delivery plan       (a queue of messages to send, plus a held-back buffer).

The Sabri SYSTEM PROMPT and the original tech spec describe these two shapes with
minor differences (per-item ``action`` vs top-level ``pacing``/``deliver``
wrapper, ``text`` vs ``message`` on held items). ``parse_sabri_output`` is
deliberately lenient and normalises every realistic shape into the dataclasses
below, so the orchestrator has one clean representation to work with.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from typing import List, Optional, Union


# Valid pacing flags (per the Sabri prompt's OUTPUT FORMAT).
PACINGS = {"send_now", "pause_short", "pause_long", "wait_for_response", "hold_back"}
# Valid tiers (kept as free strings on the item, this is just for reference/validation).
TIERS = {
    "provocation", "bold_assumption", "mystical", "directional",
    "depth", "grounding", "engagement",
}


@dataclass
class DeliveryItem:
    """One message the client will receive, with its pacing."""

    message: str
    pacing: str = "send_now"
    tier: Optional[str] = None
    typing_duration_ms: Optional[int] = None
    notes: Optional[str] = None


@dataclass
class HeldItem:
    """A line held in the reactive buffer for later deployment."""

    text: str
    tier: Optional[str] = None
    hold_trigger: Optional[str] = None


@dataclass
class DeliveryPlan:
    """Sabri Type B — ready to deliver."""

    queue: List[DeliveryItem] = field(default_factory=list)
    hold_back: List[HeldItem] = field(default_factory=list)
    session_notes: Optional[str] = None


@dataclass
class ValentinaRequest:
    """Sabri Type A — Sabri needs Valentina to generate/correct content first."""

    type: str = "full_reading"  # full_reading | micro_read | correction | rejection
    instructions: str = ""
    flags: List[str] = field(default_factory=list)
    client_message: Optional[str] = None
    correction_notes: Optional[str] = None
    context: Optional[str] = None


SabriDecision = Union[DeliveryPlan, ValentinaRequest]


class SabriParseError(ValueError):
    """Raised when Sabri output cannot be interpreted as either decision type."""


# ── JSON extraction ──────────────────────────────────────────────────────────
def _balanced_json(s: str, start: int):
    """Return the balanced {...} or [...] substring beginning at s[start], honouring
    string literals/escapes, or None if it never closes."""
    depth = 0
    in_str = False
    esc = False
    for i in range(start, len(s)):
        c = s[i]
        if in_str:
            if esc:
                esc = False
            elif c == "\\":
                esc = True
            elif c == '"':
                in_str = False
            continue
        if c == '"':
            in_str = True
        elif c in "{[":
            depth += 1
        elif c in "}]":
            depth -= 1
            if depth == 0:
                return s[start : i + 1]
    return None


def _extract_json(text: str):
    """Parse the FIRST top-level JSON value (object or array) from model output,
    tolerating ```json fences and surrounding prose.

    Only the first top-level value is considered. A nested array inside a
    MALFORMED object is never mistaken for the payload — a malformed first value
    raises SabriParseError so the caller retries/falls back, rather than silently
    delivering a sub-structure."""
    cleaned = (text or "").strip()
    cleaned = re.sub(r"^```(?:json)?\s*|\s*```$", "", cleaned, flags=re.IGNORECASE).strip()
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        pass
    for idx, ch in enumerate(cleaned):
        if ch in "{[":
            frag = _balanced_json(cleaned, idx)
            if frag is None:
                break
            try:
                return json.loads(frag)
            except json.JSONDecodeError:
                raise SabriParseError("Malformed JSON in Sabri output")
    raise SabriParseError("No JSON object or array found in Sabri output")


def _finalize_plan(plan: "DeliveryPlan") -> "DeliveryPlan":
    """A plan with nothing to send AND nothing to hold is not a usable output —
    signal failure so the caller retries then falls back (never 'deliver nothing')."""
    if not plan.queue and not plan.hold_back:
        raise SabriParseError("Sabri produced an empty delivery plan")
    return plan


def _as_list(v) -> list:
    if v is None:
        return []
    return v if isinstance(v, list) else [v]


def _norm_pacing(item: dict) -> str:
    p = (item.get("action") or item.get("pacing") or "send_now")
    p = str(p).strip().lower()
    return p if p in PACINGS else "send_now"


def _delivery_item(item: dict) -> DeliveryItem:
    dur = item.get("typing_duration_ms")
    try:
        dur = int(dur) if dur is not None else None
    except (TypeError, ValueError):
        dur = None
    return DeliveryItem(
        message=str(item.get("message", "")).strip(),
        pacing=_norm_pacing(item),
        tier=item.get("tier"),
        typing_duration_ms=dur,
        notes=item.get("notes"),
    )


def _held_item(item: dict) -> HeldItem:
    return HeldItem(
        text=str(item.get("text") or item.get("message") or "").strip(),
        tier=item.get("tier"),
        hold_trigger=item.get("hold_trigger"),
    )


def _valentina_request(obj: dict) -> ValentinaRequest:
    return ValentinaRequest(
        type=str(obj.get("type") or "full_reading"),
        instructions=str(obj.get("instructions") or ""),
        flags=[str(f) for f in _as_list(obj.get("flags"))],
        client_message=obj.get("client_message"),
        correction_notes=obj.get("correction_notes"),
        context=obj.get("context"),
    )


def _plan_from_items(items: list) -> DeliveryPlan:
    """Flat-list form: split items into queue vs hold_back by their pacing/action."""
    queue: List[DeliveryItem] = []
    held: List[HeldItem] = []
    for it in items:
        if not isinstance(it, dict):
            continue
        if _norm_pacing(it) == "hold_back":
            held.append(_held_item(it))
        else:
            queue.append(_delivery_item(it))
    return DeliveryPlan(queue=queue, hold_back=held)


def parse_sabri_output(text: str) -> SabriDecision:
    """Normalise Sabri's raw output into a ValentinaRequest or a DeliveryPlan.

    Raises SabriParseError if the output is neither. Callers treat that as an LLM
    failure and fall back (never send unparseable output to the client)."""
    data = _extract_json(text)

    # Flat array of delivery items.
    if isinstance(data, list):
        return _finalize_plan(_plan_from_items(data))

    if not isinstance(data, dict):
        raise SabriParseError(f"Unexpected Sabri output type: {type(data).__name__}")

    action = str(data.get("action") or "").strip().lower()

    # Type A — needs Valentina.
    if action == "valentina_request":
        return _valentina_request(data)

    # Type B — object wrapper form ({"action":"deliver", "queue":[...], "hold_back":[...]}),
    # including a hold-everything-back object with no queue key.
    if "queue" in data or "hold_back" in data or action == "deliver":
        plan = _plan_from_items(_as_list(data.get("queue")))
        # Any explicit hold_back array, plus any hold_back-actioned queue items already split.
        for it in _as_list(data.get("hold_back")):
            if isinstance(it, dict):
                plan.hold_back.append(_held_item(it))
        plan.session_notes = data.get("session_notes") or data.get("notes")
        return _finalize_plan(plan)

    # Single delivery item object.
    if "message" in data:
        return _finalize_plan(_plan_from_items([data]))

    raise SabriParseError("Sabri output is JSON but matches no known shape")
