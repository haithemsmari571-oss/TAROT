"""The registry's two structural guarantees.

1. FALLBACK. A row that still tracks the shipped default must render the CODE
   constant byte-for-byte — so editing a prompt in source actually reaches the
   model. Before is_default existed, the DB row was authoritative from the first
   seed and a later source edit was silently ignored forever.

2. EDIT *AND* RESTORE. Both editable classifications can be written and rolled
   back. Previously save_prompt demanded APPROVAL_EDITABLE while the
   draft/activate path demanded OWNER_EDITABLE, and both restore paths routed
   through save_prompt — so an OWNER_EDITABLE prompt could be edited but never
   restored. PROTECTED still refuses every write.
"""

from datetime import datetime, timezone

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

import app.models  # noqa: F401  (registers the mappers)
from app.models import AiPrompt, AiPromptVersion
from app.models.base import Base
from app.services.ai import registry


@pytest.fixture()
def db(tmp_path):
    engine = create_engine(f"sqlite:///{(tmp_path / 'prompts.sqlite3').as_posix()}")
    Base.metadata.create_all(engine)
    maker = sessionmaker(bind=engine)
    session: Session = maker()
    registry._CACHE.clear()
    yield session
    session.close()
    engine.dispose()
    registry._CACHE.clear()


def _seed(db: Session, *, key="t.prompt", text="SHIPPED TEXT", classification="OWNER_EDITABLE") -> AiPrompt:
    row = AiPrompt(
        key=key,
        name="Test prompt",
        description="fixture",
        model="claude-haiku-4-5-20251001",
        default_model="claude-haiku-4-5-20251001",
        prompt=text,
        default_prompt=text,
        variables=[],
        classification=classification,
        active_version=1,
        status="ACTIVE",
        is_default=1,
    )
    db.add(row)
    db.flush()
    # Mirror seed_prompts: a live row always has an ACTIVE version 1 alongside it.
    db.add(
        AiPromptVersion(
            prompt_id=row.id,
            version=1,
            text=text,
            model=row.model,
            state="ACTIVE",
            activated_at=datetime.now(timezone.utc),
        )
    )
    db.commit()
    return row


class TestShippedDefaultFallback:
    def test_default_state_renders_the_code_constant_byte_for_byte(self, db):
        # Deliberately awkward: trailing newline, CRLF, tabs, unicode, braces.
        constant = "Line one\r\n\tIndented — “quoted” {not_a_placeholder}\nTrailing\n"
        _seed(db, text=constant)
        registry._CACHE.clear()
        rendered = registry.get_prompt_text(db, "t.prompt")
        assert rendered == constant
        assert rendered.encode("utf-8") == constant.encode("utf-8")

    def test_a_later_code_change_reaches_the_model(self, db):
        """The exact regression the column exists for."""
        row = _seed(db, text="V1 SHIPPED")
        assert registry.get_prompt_text(db, "t.prompt") == "V1 SHIPPED"

        # Simulate a new deploy whose constant changed: seed_prompts syncs
        # default_prompt but never touches `prompt`.
        row.default_prompt = "V2 SHIPPED"
        db.commit()
        registry._CACHE.clear()

        assert registry.get_prompt_text(db, "t.prompt") == "V2 SHIPPED"

    def test_an_owner_edit_wins_over_the_code_default(self, db):
        _seed(db, text="V1 SHIPPED")
        registry.save_prompt(db, "t.prompt", "OWNER TEXT")
        registry._CACHE.clear()

        row = registry.get_prompt(db, "t.prompt")
        assert row.is_default == 0
        assert registry.get_prompt_text(db, "t.prompt") == "OWNER TEXT"

        # And a later code change must NOT clobber the owner's wording.
        row.default_prompt = "V2 SHIPPED"
        db.commit()
        registry._CACHE.clear()
        assert registry.get_prompt_text(db, "t.prompt") == "OWNER TEXT"

    def test_restore_default_returns_the_row_to_tracking(self, db):
        row = _seed(db, text="V1 SHIPPED")
        registry.save_prompt(db, "t.prompt", "OWNER TEXT")
        registry.restore_default(db, "t.prompt")
        registry._CACHE.clear()

        assert registry.get_prompt(db, "t.prompt").is_default == 1
        assert registry.get_prompt_text(db, "t.prompt") == "V1 SHIPPED"

        # Tracking again, so the next deploy's wording flows through.
        row = registry.get_prompt(db, "t.prompt")
        row.default_prompt = "V2 SHIPPED"
        db.commit()
        registry._CACHE.clear()
        assert registry.get_prompt_text(db, "t.prompt") == "V2 SHIPPED"


class TestEditableAndRestorable:
    @pytest.mark.parametrize("classification", ["OWNER_EDITABLE", "APPROVAL_EDITABLE"])
    def test_both_editable_classifications_can_save_and_restore(self, db, classification):
        _seed(db, text="SHIPPED", classification=classification)
        registry.save_prompt(db, "t.prompt", "EDITED")
        assert registry.get_prompt_text(db, "t.prompt") == "EDITED"

        registry._CACHE.clear()
        registry.restore_default(db, "t.prompt")
        assert registry.get_prompt_text(db, "t.prompt") == "SHIPPED"

    def test_protected_still_refuses_every_write(self, db):
        _seed(db, text="SHIPPED", classification="PROTECTED")
        with pytest.raises(registry.PromptProtectedError):
            registry.save_prompt(db, "t.prompt", "EDITED")
        with pytest.raises(registry.PromptProtectedError):
            registry.restore_default(db, "t.prompt")
        assert registry.get_prompt_text(db, "t.prompt") == "SHIPPED"

    def test_model_is_versioned_through_draft_activation_and_rollback(self, db, monkeypatch):
        row = _seed(db, text="SHIPPED")
        monkeypatch.setattr(
            registry,
            "configured_models",
            lambda: ["configured-a", "configured-b"],
        )
        row.model = "configured-a"
        row.default_model = "configured-a"
        row.versions[0].model = "configured-a"
        db.commit()

        draft = registry.save_draft(db, "t.prompt", "DRAFT TEXT", "configured-b")
        assert (draft.text, draft.model, draft.state) == (
            "DRAFT TEXT",
            "configured-b",
            "DRAFT",
        )
        activated = registry.activate_draft(db, "t.prompt", draft.version)
        assert (activated.prompt, activated.model) == ("DRAFT TEXT", "configured-b")

        rolled_back = registry.rollback_to_version(db, "t.prompt", 1)
        assert (rolled_back.prompt, rolled_back.model) == ("SHIPPED", "configured-a")
        active = registry.get_versions(db, "t.prompt")[0]
        assert (active.text, active.model, active.state) == (
            "SHIPPED",
            "configured-a",
            "ACTIVE",
        )

    def test_model_must_come_from_configuration(self, db, monkeypatch):
        _seed(db)
        monkeypatch.setattr(registry, "configured_models", lambda: ["configured-a"])
        with pytest.raises(registry.PromptValidationError, match="not enabled"):
            registry.save_prompt(db, "t.prompt", "EDITED", "invented-model")


class TestNoSplitBrain:
    """get_active_prompt must hand back the SAME text get_prompt_text resolves.

    The numerology reading executed version.text directly, so the admin Test
    button (which goes through render -> get_prompt_text) and production could
    run different strings the moment the code constant moved ahead of the
    seeded version row.
    """

    def test_active_prompt_text_matches_the_resolver(self, db):
        row = _seed(db, text="V1 SHIPPED")
        registry._CACHE.clear()

        # Constant moves forward on a deploy; the version row stays at 1.
        row.default_prompt = "V2 SHIPPED"
        db.commit()
        registry._CACHE.clear()

        _prompt, version, text = registry.get_active_prompt(db, "t.prompt")
        assert version.version == 1, "the active version row has not moved"
        assert version.text == "V1 SHIPPED", "the version row still holds the old wording"
        # ...but what runs is the resolved text, and it agrees with the Test path.
        assert text == "V2 SHIPPED"
        assert text == registry.get_prompt_text(db, "t.prompt")

    def test_after_an_owner_edit_both_paths_still_agree(self, db):
        _seed(db, text="V1 SHIPPED")
        registry.save_prompt(db, "t.prompt", "OWNER TEXT")
        registry._CACHE.clear()

        _prompt, _version, text = registry.get_active_prompt(db, "t.prompt")
        assert text == "OWNER TEXT"
        assert text == registry.get_prompt_text(db, "t.prompt")


class TestSeededDefaultsAreByteIdentical:
    def test_every_shipped_prompt_renders_its_own_constant(self, db):
        """The same proof the CRM makes for its registered prompts: with no
        owner edit anywhere, each key renders exactly the text defaults.py
        ships — no normalisation, no whitespace drift."""
        from app.services.ai import defaults as ai_defaults

        registry.seed_prompts(db)
        specs = ai_defaults.registered_prompts()
        assert specs, "expected at least one registered prompt"

        for spec in specs:
            registry._CACHE.clear()
            rendered = registry.get_prompt_text(db, spec["key"])
            assert rendered == spec["default_prompt"], f"{spec['key']} drifted from its constant"
            assert registry.get_prompt(db, spec["key"]).is_default == 1

    def test_startup_preserves_an_owner_selected_model(self, db, monkeypatch):
        models = registry.configured_models()
        assert len(models) >= 2
        row = _seed(db, text="SHIPPED")
        row.model = models[-1]
        row.default_model = models[0]
        row.prompt = "OWNER TEXT"
        row.is_default = 0
        row.versions[0].model = models[-1]
        db.commit()
        monkeypatch.setattr(
            registry.ai_defaults,
            "registered_prompts",
            lambda: [{
                "key": "t.prompt",
                "name": "Test prompt",
                "description": "updated metadata",
                "model": models[0],
                "default_prompt": "NEW SHIPPED",
                "variables": [],
                "output_schema": None,
                "output_schema_version": None,
                "classification": "OWNER_EDITABLE",
            }],
        )

        registry.seed_prompts(db)

        preserved = registry.get_prompt(db, "t.prompt")
        assert (preserved.prompt, preserved.model, preserved.is_default) == (
            "OWNER TEXT",
            models[-1],
            0,
        )
        assert (preserved.default_prompt, preserved.default_model) == (
            "NEW SHIPPED",
            models[0],
        )

    def test_changed_configured_default_creates_an_exact_new_version(self, db, monkeypatch):
        models = registry.configured_models()
        assert len(models) >= 2
        row = _seed(db, text="SHIPPED")
        row.model = models[0]
        row.default_model = models[0]
        row.versions[0].model = models[0]
        db.commit()
        monkeypatch.setattr(
            registry.ai_defaults,
            "registered_prompts",
            lambda: [{
                "key": "t.prompt",
                "name": "Test prompt",
                "description": "updated metadata",
                "model": models[-1],
                "default_prompt": "NEW SHIPPED",
                "variables": [],
                "output_schema": None,
                "output_schema_version": None,
                "classification": "OWNER_EDITABLE",
            }],
        )

        registry.seed_prompts(db)

        updated = registry.get_prompt(db, "t.prompt")
        assert (updated.prompt, updated.model, updated.active_version, updated.is_default) == (
            "NEW SHIPPED",
            models[-1],
            2,
            1,
        )
        active = registry.get_versions(db, "t.prompt")[0]
        assert (active.text, active.model, active.state) == (
            "NEW SHIPPED",
            models[-1],
            "ACTIVE",
        )
