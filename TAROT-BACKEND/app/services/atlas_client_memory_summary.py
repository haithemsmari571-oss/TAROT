"""Post-session Atlas client-memory document generation."""
from __future__ import annotations

from dataclasses import asdict, dataclass
import json
import re
from typing import Any, Literal, Protocol

from pydantic import BaseModel, ConfigDict, Field, TypeAdapter
from sqlalchemy.orm import Session

from app.services.ai import registry
from app.services.ai.client import run_chat
from app.services.atlas_client_memory_prompt import (
    ATLAS_CLIENT_MEMORY_INSTRUCTION_VERSION,
    ATLAS_CLIENT_MEMORY_PROMPT_KEY,
)


ATLAS_CLIENT_MEMORY_MAX_TOKENS = 16_000

NARRATIVE_START = "<<<ATLAS_NARRATIVE_DOCUMENT>>>"
NARRATIVE_END = "<<<END_ATLAS_NARRATIVE_DOCUMENT>>>"
PROPOSALS_START = "<<<ATLAS_FACT_PROPOSALS_JSON>>>"
PROPOSALS_END = "<<<END_ATLAS_FACT_PROPOSALS_JSON>>>"


class AtlasSummaryError(RuntimeError):
    pass


class AtlasSummaryParseError(AtlasSummaryError):
    pass


@dataclass(frozen=True)
class AtlasTranscriptLine:
    message_id: str
    speaker: Literal["CLIENT", "PSYCHIC", "OPERATOR", "SYSTEM"]
    timestamp: str
    text: str


@dataclass(frozen=True)
class AtlasSummaryModelResult:
    text: str
    input_tokens: int
    output_tokens: int
    cost_usd: float


class AtlasSummaryModel(Protocol):
    def generate(
        self,
        *,
        instruction: str,
        input_text: str,
        model: str,
        max_tokens: int,
    ) -> AtlasSummaryModelResult: ...


class AnthropicAtlasSummaryModel:
    def generate(
        self,
        *,
        instruction: str,
        input_text: str,
        model: str,
        max_tokens: int,
    ) -> AtlasSummaryModelResult:
        result = run_chat(instruction, input_text, model, max_tokens=max_tokens)
        return AtlasSummaryModelResult(
            text=str(result["text"]),
            input_tokens=int(result["input_tokens"]),
            output_tokens=int(result["output_tokens"]),
            cost_usd=float(result["cost_usd"]),
        )


class AddPersonProposal(BaseModel):
    model_config = ConfigDict(extra="forbid")
    kind: Literal["ADD_PERSON"]
    name: str = Field(min_length=1, max_length=200)
    dateOfBirth: str | None = Field(default=None, max_length=10)
    relationshipToClient: str = Field(min_length=1, max_length=200)
    details: dict[str, str] = Field(default_factory=dict)
    evidenceMessageIds: list[str] = Field(default_factory=list, max_length=500)


class AddClientFactProposal(BaseModel):
    model_config = ConfigDict(extra="forbid")
    kind: Literal["ADD_CLIENT_FACT"]
    label: str = Field(min_length=1, max_length=200)
    value: str = Field(min_length=1, max_length=1_000)
    evidenceMessageIds: list[str] = Field(default_factory=list, max_length=500)


class CorrectionProposal(BaseModel):
    model_config = ConfigDict(extra="forbid")
    kind: Literal["CORRECTION"]
    factId: str = Field(min_length=1, max_length=64)
    field: str = Field(min_length=1, max_length=120)
    correctedValue: str | None = Field(max_length=1_000)
    evidenceMessageIds: list[str] = Field(min_length=1, max_length=500)


FactProposal = AddPersonProposal | AddClientFactProposal | CorrectionProposal
FACT_PROPOSALS = TypeAdapter(list[FactProposal])


@dataclass(frozen=True)
class AtlasSummaryGenerationInput:
    facts_block: dict[str, Any]
    narrative_document: str
    transcript: list[AtlasTranscriptLine]
    computed_numerology: dict[str, Any]
    account_profile: dict[str, Any]
    session_date: str


@dataclass(frozen=True)
class AtlasSummaryGenerationResult:
    narrative_document: str
    proposed_facts: list[dict[str, Any]]
    prompt_key: str
    prompt_version: int
    instruction_version: str
    model_identifier: str
    input_tokens: int
    output_tokens: int
    cost_usd: float


def _json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, indent=2, default=str)


def build_atlas_summary_input(value: AtlasSummaryGenerationInput) -> str:
    transcript = [asdict(line) for line in value.transcript]
    previous = value.narrative_document.strip() or "[NO PREVIOUS NARRATIVE DOCUMENT]"
    return "\n".join([
        "SESSION DATE",
        value.session_date,
        "",
        "ACCOUNT-LEVEL CLIENT PROFILE (VISIBLE TO EVERY PSYCHIC)",
        _json(value.account_profile),
        "",
        "VERIFIED PAIR-SCOPED FACTS BLOCK (NEVER EDIT OR DELETE IT)",
        _json(value.facts_block),
        "",
        "CODE-COMPUTED ASTROLOGY AND NUMEROLOGY (USE VERBATIM; NEVER CALCULATE)",
        _json(value.computed_numerology),
        "",
        "PREVIOUS PAIR-SCOPED NARRATIVE DOCUMENT",
        previous,
        "",
        "SPEAKER-LABELLED TRANSCRIPT IN MESSAGE-ID ORDER",
        _json(transcript),
        "",
        "RETURN EXACTLY THIS TRANSPORT ENVELOPE:",
        NARRATIVE_START,
        "the complete updated plain-text narrative document",
        NARRATIVE_END,
        PROPOSALS_START,
        "{\"proposals\": [fact proposal objects]}",
        PROPOSALS_END,
        "",
        "Allowed fact proposal objects only:",
        '{"kind":"ADD_PERSON","name":"...","dateOfBirth":"YYYY-MM-DD or null","relationshipToClient":"...","details":{},"evidenceMessageIds":["message id"]}',
        '{"kind":"ADD_CLIENT_FACT","label":"...","value":"...","evidenceMessageIds":["message id"]}',
        '{"kind":"CORRECTION","factId":"existing factId","field":"specific field","correctedValue":"... or null","evidenceMessageIds":["message id"]}',
        "Return an empty proposals array when there is nothing to propose.",
        "Never return a replacement facts block. Never put a psychic inference into a client fact proposal.",
    ])


def _bounded_section(text: str, start: str, end: str) -> str:
    pattern = re.escape(start) + r"\s*(.*?)\s*" + re.escape(end)
    matches = re.findall(pattern, text, flags=re.DOTALL)
    if len(matches) != 1:
        raise AtlasSummaryParseError(f"The model output must contain exactly one {start} section.")
    return matches[0].strip()


def parse_atlas_summary_output(text: str) -> tuple[str, list[dict[str, Any]]]:
    narrative = _bounded_section(text, NARRATIVE_START, NARRATIVE_END)
    if not narrative:
        raise AtlasSummaryParseError("The updated narrative document is empty.")
    proposals_text = _bounded_section(text, PROPOSALS_START, PROPOSALS_END)
    try:
        envelope = json.loads(proposals_text)
    except json.JSONDecodeError as error:
        raise AtlasSummaryParseError("The fact proposals are not valid JSON.") from error
    if not isinstance(envelope, dict) or set(envelope) != {"proposals"}:
        raise AtlasSummaryParseError("The fact proposal envelope must contain only proposals.")
    try:
        proposals = FACT_PROPOSALS.validate_python(envelope["proposals"])
    except Exception as error:
        raise AtlasSummaryParseError("A fact proposal does not match the allowed schema.") from error
    return narrative, [proposal.model_dump() for proposal in proposals]


class AtlasClientMemorySummarizer:
    def __init__(self, model: AtlasSummaryModel | None = None):
        self._model = model or AnthropicAtlasSummaryModel()

    def generate(
        self,
        db: Session,
        value: AtlasSummaryGenerationInput,
    ) -> AtlasSummaryGenerationResult:
        prompt, version, instruction = registry.get_active_prompt(
            db,
            ATLAS_CLIENT_MEMORY_PROMPT_KEY,
        )
        model_result = self._model.generate(
            instruction=instruction,
            input_text=build_atlas_summary_input(value),
            model=prompt.model,
            max_tokens=ATLAS_CLIENT_MEMORY_MAX_TOKENS,
        )
        narrative, proposed_facts = parse_atlas_summary_output(model_result.text)
        return AtlasSummaryGenerationResult(
            narrative_document=narrative,
            proposed_facts=proposed_facts,
            prompt_key=ATLAS_CLIENT_MEMORY_PROMPT_KEY,
            prompt_version=version.version,
            instruction_version=ATLAS_CLIENT_MEMORY_INSTRUCTION_VERSION,
            model_identifier=prompt.model,
            input_tokens=model_result.input_tokens,
            output_tokens=model_result.output_tokens,
            cost_usd=model_result.cost_usd,
        )
