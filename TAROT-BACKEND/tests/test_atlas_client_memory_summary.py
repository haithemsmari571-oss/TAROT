from types import SimpleNamespace

import pytest

from app.services.atlas_client_memory_prompt import (
    ATLAS_CLIENT_MEMORY_INSTRUCTION_PATH,
    ATLAS_CLIENT_MEMORY_PROMPT_KEY,
    load_shipped_atlas_client_memory_instruction,
)
from app.services.atlas_client_memory_summary import (
    ATLAS_CLIENT_MEMORY_MAX_TOKENS,
    NARRATIVE_END,
    NARRATIVE_START,
    PROPOSALS_END,
    PROPOSALS_START,
    AtlasClientMemorySummarizer,
    AtlasSummaryGenerationInput,
    AtlasSummaryModelResult,
    AtlasSummaryParseError,
    AtlasTranscriptLine,
    build_atlas_summary_input,
    parse_atlas_summary_output,
)


class FakeModel:
    def __init__(self, text):
        self.text = text
        self.calls = []

    def generate(self, **kwargs):
        self.calls.append(kwargs)
        return AtlasSummaryModelResult(
            text=self.text,
            input_tokens=123,
            output_tokens=456,
            cost_usd=0.007,
        )


def generation_input():
    return AtlasSummaryGenerationInput(
        facts_block={
            "schemaVersion": 1,
            "people": [{
                "factId": "019-synthetic-person",
                "name": "Synthetic Person",
                "dateOfBirth": "1990-05-14",
                "relationshipToClient": "primary person",
                "details": {},
                "history": [],
            }],
            "clientFacts": [],
        },
        narrative_document="## HEADER\nExisting synthetic memory.",
        transcript=[
            AtlasTranscriptLine("101", "CLIENT", "2042-01-01T10:00:00Z", "Client-stated synthetic fact."),
            AtlasTranscriptLine("102", "PSYCHIC", "2042-01-01T10:01:00Z", "Psychic synthetic prediction."),
        ],
        computed_numerology={
            "019-synthetic-person": {
                "sunSign": "Taurus",
                "lifePath": 11,
                "personalYear": 4,
            },
        },
        account_profile={
            "userId": "700001",
            "username": "synthetic-client",
            "dateOfBirth": "1992-07-22",
        },
        session_date="2042-01-01",
    )


def model_output():
    return f"""{NARRATIVE_START}
## HEADER
Updated synthetic living document.
{NARRATIVE_END}
{PROPOSALS_START}
{{"proposals":[{{"kind":"ADD_CLIENT_FACT","label":"Occupation","value":"Synthetic role","evidenceMessageIds":["101"]}}]}}
{PROPOSALS_END}"""


def test_owner_instruction_has_one_standalone_source_file_and_all_sections():
    instruction = load_shipped_atlas_client_memory_instruction()
    assert ATLAS_CLIENT_MEMORY_INSTRUCTION_PATH.name == "atlas_client_memory_summary.txt"
    assert instruction.startswith("POST-SESSION SUMMARY INSTRUCTION")
    assert instruction.count("DOCUMENT SECTIONS, IN ORDER") == 1
    for section in range(1, 16):
        assert f"{section}. " in instruction
    assert "A read the psychic made is never attributed to the client." in instruction
    assert "every cited message must have speaker CLIENT" in instruction
    assert "If a client value is absent, it is NOT AVAILABLE" in instruction
    assert "This restriction does not apply to another person" in instruction
    assert "record the psychic's third-party numerology and astrology normally" in instruction
    assert "DOB and astrology from the facts block or as stated by the psychic" in instruction
    assert "File approaching compression threshold." in instruction
    assert "exceeds 1,000 lines" in instruction
    assert "exceeds 300 lines" not in instruction
    assert instruction.endswith("it must be findable in under ten seconds.")


def test_registry_exposes_the_standalone_instruction_as_owner_editable(monkeypatch):
    from app.services.ai import defaults

    monkeypatch.setattr(
        defaults,
        "get_app_settings",
        lambda: SimpleNamespace(
            CONTENT_MODEL="synthetic-content",
            READING_DRAFT_MODEL="synthetic-summary",
            READER_MODEL="synthetic-valentina",
            SABRI_DELIVERY_MODEL="synthetic-sabri",
        ),
    )
    specs = defaults.registered_prompts()
    summary = next(item for item in specs if item["key"] == ATLAS_CLIENT_MEMORY_PROMPT_KEY)
    assert summary["default_prompt"] == load_shipped_atlas_client_memory_instruction()
    assert summary["classification"] == "OWNER_EDITABLE"
    assert summary["model"] == "synthetic-summary"


def test_generation_input_keeps_verified_facts_computed_values_and_speakers_distinct():
    rendered = build_atlas_summary_input(generation_input())
    assert '"name": "Synthetic Person"' in rendered
    assert '"lifePath": 11' in rendered
    assert '"speaker": "CLIENT"' in rendered
    assert '"speaker": "PSYCHIC"' in rendered
    assert '"message_id": "101"' in rendered
    assert "Never return a replacement facts block." in rendered


def test_summarizer_uses_active_registry_version_and_returns_only_proposals(monkeypatch):
    fake = FakeModel(model_output())
    monkeypatch.setattr(
        "app.services.atlas_client_memory_summary.registry.get_active_prompt",
        lambda db, key: (
            SimpleNamespace(model="synthetic-summary-model"),
            SimpleNamespace(version=7),
            "OWNER-EDITED SYNTHETIC INSTRUCTION",
        ),
    )
    result = AtlasClientMemorySummarizer(fake).generate(object(), generation_input())
    assert result.narrative_document == "## HEADER\nUpdated synthetic living document."
    assert result.proposed_facts == [{
        "kind": "ADD_CLIENT_FACT",
        "label": "Occupation",
        "value": "Synthetic role",
        "evidenceMessageIds": ["101"],
    }]
    assert result.prompt_version == 7
    assert result.model_identifier == "synthetic-summary-model"
    assert (result.input_tokens, result.output_tokens, result.cost_usd) == (123, 456, 0.007)
    assert len(fake.calls) == 1
    assert fake.calls[0]["instruction"] == "OWNER-EDITED SYNTHETIC INSTRUCTION"
    assert fake.calls[0]["input_text"] == build_atlas_summary_input(generation_input())
    assert fake.calls[0]["model"] == "synthetic-summary-model"
    assert fake.calls[0]["max_tokens"] == ATLAS_CLIENT_MEMORY_MAX_TOKENS


def test_summarizer_rejects_fact_proposals_without_exclusively_client_evidence(monkeypatch):
    output = f"""{NARRATIVE_START}
## HEADER
Updated synthetic living document.
{NARRATIVE_END}
{PROPOSALS_START}
{{"proposals":[
  {{"kind":"ADD_CLIENT_FACT","label":"Client fact","value":"accepted","evidenceMessageIds":["101"]}},
  {{"kind":"ADD_CLIENT_FACT","label":"Psychic claim","value":"rejected","evidenceMessageIds":["102"]}},
  {{"kind":"ADD_PERSON","name":"Mixed source","dateOfBirth":null,"relationshipToClient":"friend","details":{{}},"evidenceMessageIds":["101","102"]}},
  {{"kind":"ADD_CLIENT_FACT","label":"No evidence","value":"rejected","evidenceMessageIds":[]}}
]}}
{PROPOSALS_END}"""
    monkeypatch.setattr(
        "app.services.atlas_client_memory_summary.registry.get_active_prompt",
        lambda db, key: (
            SimpleNamespace(model="synthetic-summary-model"),
            SimpleNamespace(version=1),
            "SYNTHETIC INSTRUCTION",
        ),
    )
    result = AtlasClientMemorySummarizer(FakeModel(output)).generate(
        object(), generation_input()
    )
    assert result.proposed_facts == [{
        "kind": "ADD_CLIENT_FACT",
        "label": "Client fact",
        "value": "accepted",
        "evidenceMessageIds": ["101"],
    }]


def test_parser_accepts_additions_and_specific_corrections_but_no_replacement_block():
    text = f"""{NARRATIVE_START}
## HEADER
Synthetic.
{NARRATIVE_END}
{PROPOSALS_START}
{{"proposals":[
  {{"kind":"ADD_PERSON","name":"Synthetic Person","dateOfBirth":null,"relationshipToClient":"friend","details":{{}},"evidenceMessageIds":["1"]}},
  {{"kind":"CORRECTION","factId":"019-synthetic","field":"dateOfBirth","correctedValue":"1991-05-14","evidenceMessageIds":["2"]}}
]}}
{PROPOSALS_END}"""
    narrative, proposals = parse_atlas_summary_output(text)
    assert narrative == "## HEADER\nSynthetic."
    assert [item["kind"] for item in proposals] == ["ADD_PERSON", "CORRECTION"]
    assert not any("factsBlock" in item for item in proposals)


@pytest.mark.parametrize("text", [
    "no transport envelope",
    f"{NARRATIVE_START}{NARRATIVE_END}{PROPOSALS_START}{{\"proposals\":[]}}{PROPOSALS_END}",
    f"{NARRATIVE_START}x{NARRATIVE_END}{PROPOSALS_START}not-json{PROPOSALS_END}",
    f"{NARRATIVE_START}x{NARRATIVE_END}{PROPOSALS_START}{{\"proposals\":[],\"factsBlock\":{{}}}}{PROPOSALS_END}",
    f"{NARRATIVE_START}x{NARRATIVE_END}{PROPOSALS_START}{{\"proposals\":[{{\"kind\":\"ADD_CLIENT_FACT\",\"label\":\"x\",\"value\":\"y\",\"speaker\":\"PSYCHIC\"}}]}}{PROPOSALS_END}",
])
def test_parser_fails_closed_on_missing_empty_malformed_or_extra_output(text):
    with pytest.raises(AtlasSummaryParseError):
        parse_atlas_summary_output(text)
