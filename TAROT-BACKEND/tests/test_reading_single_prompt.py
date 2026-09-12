"""reading.single is a shipped registry default (per-message billing, step 4a).

Nothing calls the prompt yet. These pin three things: the startup seed creates
the row on a fresh database and leaves reading.valentina and reading.sabri as
they were, the runtime resolver hands back that text and that model from the
registry rather than from its fallback, and the constant is the owner's text
untouched: ASCII, no em dash, no en dash, no semicolon, opening with
YOU ARE THE READER.
"""

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

import app.models  # noqa: F401  (registers the mappers)
from app.models import AiPrompt
from app.models.base import Base
from app.services.ai import defaults as ai_defaults
from app.services.ai import registry, runtime_prompts
from app.services.ai.reading_single_prompt import READING_SINGLE_PROMPT

KEY = "reading.single"
MODEL = "claude-opus-4-6"
NEIGHBOURS = ("reading.valentina", "reading.sabri")


@pytest.fixture()
def seeded(tmp_path, monkeypatch):
    """A fresh database, seeded once, that ALSO stands in for
    app.database.client.SessionLocal because the runtime resolver opens its own
    session."""
    engine = create_engine(f"sqlite:///{(tmp_path / 'prompts.sqlite3').as_posix()}")
    Base.metadata.create_all(engine)
    Local = sessionmaker(bind=engine)
    from app.database import client as database_client

    monkeypatch.setattr(database_client, "SessionLocal", Local)
    registry._CACHE.clear()
    runtime_prompts.clear_runtime_prompt_cache()
    db = Local()
    try:
        registry.seed_prompts(db)
        yield db
    finally:
        db.close()
        engine.dispose()
        registry._CACHE.clear()
        runtime_prompts.clear_runtime_prompt_cache()


def _snapshot(row: AiPrompt) -> dict:
    """Every column of a prompt row plus its version rows, for an exact
    before/after comparison."""
    columns = {c.name: getattr(row, c.name) for c in AiPrompt.__table__.columns}
    columns["versions"] = [
        (v.version, v.text, v.model, v.state, v.activated_at) for v in row.versions
    ]
    return columns


# -- 1. The seed creates the row on a fresh database --------------------------
def test_the_seed_creates_reading_single_as_a_shipped_default(seeded):
    row = seeded.query(AiPrompt).filter(AiPrompt.key == KEY).one()

    assert bool(row.is_default) is True
    assert row.model == MODEL
    assert row.default_model == MODEL
    assert row.prompt == READING_SINGLE_PROMPT
    assert row.default_prompt == READING_SINGLE_PROMPT
    assert row.name == "READING SINGLE, the one-call reader"
    assert row.description == (
        "Per-message billing reader. One call per client message, writes the "
        "final texting-voice bubbles directly."
    )
    assert row.classification == "OWNER_EDITABLE"
    assert row.variables == []
    assert row.status == "ACTIVE"
    assert row.active_version == 1
    assert [(v.version, v.state) for v in row.versions] == [(1, "ACTIVE")]
    assert row.versions[0].text == READING_SINGLE_PROMPT
    assert row.versions[0].model == MODEL


def test_the_seed_leaves_valentina_and_sabri_exactly_as_they_were(seeded):
    """Seeding again with reading.single in the list must change nothing about
    the two readers already there: not a column, not a version row."""
    before = {
        key: _snapshot(seeded.query(AiPrompt).filter(AiPrompt.key == key).one())
        for key in NEIGHBOURS
    }

    registry.seed_prompts(seeded)
    seeded.expire_all()

    after = {
        key: _snapshot(seeded.query(AiPrompt).filter(AiPrompt.key == key).one())
        for key in NEIGHBOURS
    }
    assert after == before
    assert seeded.query(AiPrompt).filter(AiPrompt.key == KEY).count() == 1


# -- 2. The runtime resolver serves it from the registry ----------------------
def test_the_runtime_resolver_returns_the_registry_text_and_model(seeded):
    # Sentinel fallbacks, so a silent fallback could not pass as a registry hit.
    text, model = runtime_prompts.resolve_runtime_prompt_and_model(
        KEY, "FALLBACK PROMPT", "fallback-model"
    )

    assert model == MODEL
    # The resolver strips what it hands the model, like every other reading
    # prompt, so the resolved text is the constant less its one final newline.
    assert text == READING_SINGLE_PROMPT.strip()
    assert text + "\n" == READING_SINGLE_PROMPT
    assert MODEL in registry.configured_models()


# -- 3. The constant is the owner's text, untouched ---------------------------
def test_the_constant_is_pure_ascii_with_no_dashes_or_semicolons():
    text = READING_SINGLE_PROMPT

    assert text.startswith("YOU ARE THE READER")
    assert text.isascii()
    assert "\u2014" not in text  # em dash
    assert "\u2013" not in text  # en dash
    assert ";" not in text
    assert "\r" not in text
    assert "\t" not in text
    assert text.endswith("Nothing else anywhere.\n")
    # A single final newline and nothing else around the text.
    assert text == text.strip() + "\n"
    assert all(line == line.rstrip() for line in text.split("\n"))


def test_the_registered_spec_follows_the_valentina_convention():
    specs = {spec["key"]: spec for spec in ai_defaults.registered_prompts()}
    single = specs[KEY]
    valentina = specs["reading.valentina"]

    assert single["name"] == "READING SINGLE, the one-call reader"
    assert single["description"] == (
        "Per-message billing reader. One call per client message, writes the "
        "final texting-voice bubbles directly."
    )
    assert single["model"] == MODEL
    assert single["default_prompt"] is READING_SINGLE_PROMPT
    assert single["classification"] == valentina["classification"] == "OWNER_EDITABLE"
    assert single["variables"] == valentina["variables"] == []
    assert single["output_schema"] is None
    assert single["output_schema_version"] is None
