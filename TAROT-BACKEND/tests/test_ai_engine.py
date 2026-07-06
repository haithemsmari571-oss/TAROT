"""AI Prompt Registry, nightly content engine, and settings-driven economy."""

from datetime import date, timedelta

from app.models import DailyContent, Settings
from app.services import stardust_rewards as sr
from app.services.ai import client as ai_client
from app.services.ai import content_engine, registry


# ── Registry ─────────────────────────────────────────────────────────────────
def test_seed_and_render_substitutes_vars_keeps_json(db):
    registry.seed_prompts(db)
    p = registry.get_prompt(db, "daily_content")
    assert p.default_prompt and p.model

    text = registry.render(
        db, "daily_content", zodiac_sign="Cancer", date="2026-07-07", card_name="The Star"
    )
    assert "Cancer" in text and "The Star" in text
    assert "{zodiac_sign}" not in text and "{card_name}" not in text
    # literal JSON braces in the prompt are untouched by substitution
    assert '"interpretation"' in text


def test_save_creates_version_busts_cache_and_restores(db):
    registry.seed_prompts(db)
    default = registry.get_prompt(db, "daily_content").default_prompt

    registry.save_prompt(db, "daily_content", "EDITED ONE")
    assert registry.get_prompt_text(db, "daily_content") == "EDITED ONE"  # cache updated

    versions = registry.get_versions(db, "daily_content")
    assert versions[0].text == "EDITED ONE"

    registry.restore_default(db, "daily_content")
    assert registry.get_prompt(db, "daily_content").prompt == default

    edited = next(v for v in registry.get_versions(db, "daily_content") if v.text == "EDITED ONE")
    registry.restore_version(db, "daily_content", edited.id)
    assert registry.get_prompt(db, "daily_content").prompt == "EDITED ONE"


def test_keeps_only_last_10_versions(db):
    registry.seed_prompts(db)
    for i in range(15):
        registry.save_prompt(db, "daily_content", f"v{i}")
    versions = registry.get_versions(db, "daily_content")
    assert len(versions) == 10
    assert versions[0].text == "v14"  # newest kept


# ── JSON parsing ─────────────────────────────────────────────────────────────
def test_parse_json_tolerates_fences_and_prose():
    assert ai_client.parse_json_object('```json\n{"a": 1}\n```') == {"a": 1}
    assert ai_client.parse_json_object('Sure: {"a": 2} — enjoy') == {"a": 2}


# ── Content engine ───────────────────────────────────────────────────────────
def _fake_ok(prompt, model, max_tokens=1024):
    return {
        "text": '{"interpretation":"i","manifestation":"m","ritual":"r","quote_line":"q"}',
        "input_tokens": 10,
        "output_tokens": 20,
        "cost_usd": 0.0001,
    }


def test_generate_stores_twelve_signs(db, monkeypatch):
    registry.seed_prompts(db)
    monkeypatch.setattr(ai_client, "run_prompt", _fake_ok)

    run = content_engine.generate_for_date(db, date(2026, 7, 7), trigger="manual")

    assert run.status == "SUCCESS"
    assert len(run.signs_ok) == 12
    rows = db.query(DailyContent).filter(DailyContent.content_date == date(2026, 7, 7)).all()
    assert len(rows) == 12
    assert all(r.source == "generated" for r in rows)
    assert all(0 <= r.card_key <= 21 for r in rows)  # a real Major Arcana


def test_malformed_retries_once_then_records_failure(db, monkeypatch):
    registry.seed_prompts(db)
    calls = {"n": 0}

    def _bad(prompt, model, max_tokens=1024):
        calls["n"] += 1
        return {"text": "not json at all", "input_tokens": 5, "output_tokens": 5, "cost_usd": 0}

    monkeypatch.setattr(ai_client, "run_prompt", _bad)
    run = content_engine.generate_for_date(db, date(2026, 7, 8), trigger="manual")

    assert run.status == "FAILED"
    assert len(run.signs_failed) == 12
    assert calls["n"] == 24  # one retry per sign


def test_failure_keeps_yesterdays_content(db, monkeypatch):
    registry.seed_prompts(db)
    on_date = date(2026, 7, 9)
    # Yesterday's content exists for Cancer.
    db.add(
        DailyContent(
            content_date=on_date - timedelta(days=1), zodiac_sign="Cancer",
            card_key=17, card_name="The Star", interpretation="old i",
            manifestation="old m", ritual="old r", quote_line="old q", source="generated",
        )
    )
    db.commit()

    def _bad(prompt, model, max_tokens=1024):
        return {"text": "broken", "input_tokens": 1, "output_tokens": 1, "cost_usd": 0}

    monkeypatch.setattr(ai_client, "run_prompt", _bad)
    content_engine.generate_for_date(db, on_date, trigger="manual")

    cancer = (
        db.query(DailyContent)
        .filter(DailyContent.content_date == on_date, DailyContent.zodiac_sign == "Cancer")
        .first()
    )
    assert cancer is not None  # never blank
    assert cancer.interpretation == "old i"
    assert cancer.source == "fallback_yesterday"


# ── Settings drive the economy live ──────────────────────────────────────────
def test_settings_override_cap_and_expiry(db):
    db.add(Settings(key="earned_redemption_cap_pct", value="0.25"))
    db.add(Settings(key="earned_expiry_days", value="10"))
    db.commit()
    assert sr.get_redemption_cap_pct(db) == 0.25
    assert sr.get_ttl_days(db) == 10


def test_cap_default_when_unset(db):
    assert sr.get_redemption_cap_pct(db) == 0.5
    assert sr.get_ttl_days(db) == 30
