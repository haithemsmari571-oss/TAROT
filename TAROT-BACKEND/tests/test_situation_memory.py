"""Atlas Track A (phases A0-A2): situation records, client codes, the
deterministic extractor, and the v2 read-only projection.

ZERO API anywhere: the extractor is pure regex/keyword code, the pipeline is
never invoked, and the endpoint tests run against an in-memory sqlite session.
Extractor fixtures use REAL transcript/situation language taken from the
owner's actual client records and production reading copy — not synthetic
placeholder text — per the phase's testing requirement.
"""

from __future__ import annotations

import os
import subprocess
import sys
import tempfile
from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.enums.chat_status import ChatStatus
from app.enums.role import Role
from app.enums.situation_source import SituationSource
from app.models import Chat, ClientSituationRecord, User
from app.services.ai import situation_memory
from app.services.ai.reading_ledger import record_commitments
from app.services.client_code import (
    CLIENT_CODE_PREFIX,
    generate_client_code,
    generate_unique_client_code,
    is_client_code,
)

BACKEND_ROOT = Path(__file__).resolve().parents[1]


# ---------------------------------------------------------------------------
# A0 — client codes
# ---------------------------------------------------------------------------

def test_client_code_format_and_uniqueness():
    codes = {generate_client_code() for _ in range(500)}
    assert len(codes) >= 499  # collisions at this sample size would be a red flag
    for code in codes:
        assert is_client_code(code)
        assert code.startswith(CLIENT_CODE_PREFIX)
        assert len(code) == len(CLIENT_CODE_PREFIX) + 6
        # Confusion-prone characters never appear.
        assert not set(code[len(CLIENT_CODE_PREFIX):]) & set("01OILU")


def test_new_users_get_client_code_automatically(db, make_user):
    user = make_user()
    db.commit()
    assert user.client_code is not None
    assert is_client_code(user.client_code)


def test_generate_unique_client_code_respects_existing(db, make_user):
    user = make_user()
    db.commit()
    code = generate_unique_client_code(db)
    assert is_client_code(code)
    assert code != user.client_code


def test_situation_record_model_roundtrip(db, make_user):
    client = make_user()
    record = ClientSituationRecord(
        client_id=client.id,
        situation={"themes": ["grief-bereavement"]},
        source=SituationSource.DETERMINISTIC,
    )
    db.add(record)
    db.commit()
    loaded = db.query(ClientSituationRecord).filter_by(client_id=client.id).one()
    assert loaded.situation["themes"] == ["grief-bereavement"]
    assert loaded.source == SituationSource.DETERMINISTIC


# ---------------------------------------------------------------------------
# A0 — alembic migration up/down on sqlite (stamp + upgrade, repo precedent)
# ---------------------------------------------------------------------------

def _alembic(env: dict, *args: str) -> subprocess.CompletedProcess:
    return subprocess.run(
        [sys.executable, "-m", "alembic", *args],
        cwd=str(BACKEND_ROOT),
        env=env,
        capture_output=True,
        text=True,
    )


def test_migration_up_down_on_sqlite(tmp_path):
    db_path = tmp_path / "migration-test.sqlite"
    url = f"sqlite:///{db_path}"

    import sqlite3

    connection = sqlite3.connect(db_path)
    # Minimal BEFORE-state schema: just what the new migration touches.
    connection.executescript(
        """
        CREATE TABLE users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT UNIQUE, username TEXT UNIQUE, password_hash TEXT
        );
        CREATE TABLE chats (id INTEGER PRIMARY KEY AUTOINCREMENT);
        INSERT INTO users (email, username, password_hash) VALUES
            ('a@test.co','a','x'), ('b@test.co','b','x'), ('c@test.co','c','x');
        """
    )
    connection.commit()
    connection.close()

    env = {**os.environ, "DATABASE_URL": url}
    stamped = _alembic(env, "stamp", "f7a8b9c0d1e2")
    assert stamped.returncode == 0, stamped.stderr
    upgraded = _alembic(env, "upgrade", "head")
    assert upgraded.returncode == 0, upgraded.stderr

    connection = sqlite3.connect(db_path)
    tables = {row[0] for row in connection.execute("SELECT name FROM sqlite_master WHERE type='table'")}
    assert "client_situation_records" in tables
    codes = [row[0] for row in connection.execute("SELECT client_code FROM users")]
    assert all(code and code.startswith("AV-") for code in codes)
    assert len(set(codes)) == 3  # backfill produced unique codes
    connection.close()

    downgraded = _alembic(env, "downgrade", "-1")
    assert downgraded.returncode == 0, downgraded.stderr
    connection = sqlite3.connect(db_path)
    tables = {row[0] for row in connection.execute("SELECT name FROM sqlite_master WHERE type='table'")}
    assert "client_situation_records" not in tables
    columns = {row[1] for row in connection.execute("PRAGMA table_info(users)")}
    assert "client_code" not in columns
    connection.close()


# ---------------------------------------------------------------------------
# A1 — deterministic extractor on REAL transcript/situation language
# ---------------------------------------------------------------------------

# Real client-side language (from the owner's actual client records — Helen's
# and Di's situations, verbatim phrasing patterns).
REAL_CLIENT_TEXT = (
    "He still refuses to name feelings or commit. I sent him the ultimatum and "
    "his 2 AM reply said he can't give me what I want. My boss at work has been "
    "toxic for months and I am exhausted. My dog was given months to live and I "
    "keep crying. My eggs are frozen in London and I am 44 — is a baby still "
    "possible? When will it finally happen for me?"
)

# Real delivered-reading language (verbatim production copy shipped by the
# landing pages + the standing-prediction phrasing the records document).
REAL_DELIVERED_TEXT = (
    "The Tower has appeared for you tonight. Someone is watching you closer than "
    "you realise. By December you will understand why nothing before this felt "
    "finished. Within 3 weeks a door you thought closed will open again — he "
    "will come back to your door before August. Your husband's silence is not "
    "absence; trust the rebuilding you have already begun."
)


def test_extractor_finds_themes_flags_people_predictions_on_real_language():
    delta = situation_memory.extract_situation_delta(REAL_CLIENT_TEXT, REAL_DELIVERED_TEXT)

    assert "avoidant-partner" in delta["themes"]          # "refuses to ... commit"
    assert "career-business" in delta["themes"]           # "boss", "work"
    assert "fertility-children" in delta["themes"]        # "baby", "eggs ... frozen"
    assert "waiting-on-timeline" in delta["themes"]       # "When will"
    assert "reconciliation-hope" in delta["themes"]       # "come back"
    assert "self-rebuilding" in delta["themes"]           # "rebuilding"

    kinds = {entry["kind"] for entry in delta["open_predictions"]}
    values = " | ".join(str(entry["value"]) for entry in delta["open_predictions"])
    assert "card" in kinds                                 # The Tower
    assert "timing" in kinds                               # by December / within 3 weeks
    assert "Tower" in values

    assert "husband" in delta["key_people"]
    # No sensitive flags in this text — and none invented.
    assert delta["sensitive_flags"] == []


def test_extractor_flags_sensitive_topics_without_false_positives():
    risky = "Some days I don't want to live like this. I'm afraid to go home when he drinks."
    delta = situation_memory.extract_situation_delta(risky, None)
    assert "self-harm-risk" in delta["sensitive_flags"]
    assert "domestic-danger" in delta["sensitive_flags"]

    benign = "I would live anywhere warm; home renovations start next week."
    assert situation_memory.extract_situation_delta(benign, None)["sensitive_flags"] == []


def test_extractor_is_deterministic():
    a = situation_memory.extract_situation_delta(REAL_CLIENT_TEXT, REAL_DELIVERED_TEXT)
    b = situation_memory.extract_situation_delta(REAL_CLIENT_TEXT, REAL_DELIVERED_TEXT)
    assert a == b


def test_merge_dedupes_and_caps():
    prior = {"themes": ["grief-bereavement"], "open_predictions": [
        {"kind": "card", "value": "The Tower", "first_seen": "2026-07-01T00:00:00+00:00"}
    ]}
    delta = situation_memory.extract_situation_delta(None, REAL_DELIVERED_TEXT)
    merged = situation_memory.merge_situation(prior, delta, reader_name="Valentina", turn_stamp="2026-07-25T00:00:00+00:00")
    # The Tower not duplicated even though re-mentioned.
    towers = [p for p in merged["open_predictions"] if "tower" in str(p["value"]).casefold()]
    assert len(towers) == 1
    assert towers[0]["first_seen"] == "2026-07-01T00:00:00+00:00"  # first sighting kept
    assert merged["last_reader"] == "Valentina"
    assert "grief-bereavement" in merged["themes"]  # prior facts never dropped

    # Caps hold.
    fat = {"themes": [f"t{i}" for i in range(50)]}
    capped = situation_memory.merge_situation(fat, {"themes": ["new"]},)
    assert len(capped["themes"]) == situation_memory.MAX_THEMES


# ---------------------------------------------------------------------------
# A1 — gating: OFF by default, writes ONLY the new table, never affects a turn
# ---------------------------------------------------------------------------

class _LedgerState:
    def __init__(self, chat_id):
        self.chat_id = chat_id
        self.commitment_ledger = []
        self.messages_sent_count = 3


def _seed_chat(db, make_user):
    client = make_user()
    psychic = make_user(role=Role.PSYCHIC)
    chat = Chat(user_id=client.id, psychic_id=psychic.id, status=ChatStatus.ACTIVE)
    db.add(chat)
    db.commit()
    return client, psychic, chat


def test_flag_off_by_default_no_write(db, make_user, monkeypatch):
    monkeypatch.delenv(situation_memory.SITUATION_MEMORY_ENABLED_ENV, raising=False)
    assert situation_memory.situation_memory_enabled() is False
    client, _, chat = _seed_chat(db, make_user)
    state = _LedgerState(chat.id)

    added = record_commitments(state, REAL_DELIVERED_TEXT)

    # The ledger itself behaved exactly as before…
    assert added > 0
    assert len(state.commitment_ledger) == added
    # …and nothing touched the situation table.
    assert db.query(ClientSituationRecord).count() == 0


def test_enabled_write_goes_only_to_situation_table(db, make_user, monkeypatch):
    client, psychic, chat = _seed_chat(db, make_user)
    note_count_before = 0  # fresh db fixture — assert stays zero below

    # Call the synchronous core directly (the thread wrapper is fire-and-forget;
    # tests need determinism).
    wrote = situation_memory.apply_situation_update(db, chat.id, REAL_CLIENT_TEXT, REAL_DELIVERED_TEXT)
    assert wrote is True

    record = db.query(ClientSituationRecord).filter_by(client_id=client.id).one()
    assert record.source == SituationSource.DETERMINISTIC
    assert record.chat_id == chat.id
    assert "avoidant-partner" in record.situation["themes"]
    assert record.situation["last_reader"] == psychic.username

    # Only the new table was written: dossier notes untouched, ledger untouched.
    from app.models import ClientNote

    assert db.query(ClientNote).count() == note_count_before

    # Second update merges into the SAME row (one rolling record per client).
    situation_memory.apply_situation_update(db, chat.id, "My sister keeps draining me about money.", None)
    records = db.query(ClientSituationRecord).filter_by(client_id=client.id).all()
    assert len(records) == 1
    assert "financial-strain" in records[0].situation["themes"]


def test_enabled_hook_never_raises_even_on_bad_state(monkeypatch):
    monkeypatch.setenv(situation_memory.SITUATION_MEMORY_ENABLED_ENV, "true")
    # chat_id None, no DB available — must be silently ignored.
    situation_memory.record_situation(None, None, "text")
    state = _LedgerState(chat_id=None)
    assert record_commitments(state, REAL_DELIVERED_TEXT) > 0  # ledger unaffected


def test_no_reply_path_reads_situation_table():
    """A-LIVE is NOT built: prove no reading-pipeline module references the
    situation table. Only situation_memory (the writer) and the v2 projection
    (the CRM read side) may mention it."""

    ai_dir = BACKEND_ROOT / "app" / "services" / "ai"
    offenders = []
    for path in ai_dir.glob("*.py"):
        if path.name == "situation_memory.py":
            continue
        text = path.read_text(encoding="utf-8", errors="replace")
        # The model class is the only way to QUERY the table; reading_ledger's
        # hook only calls the writer (its comment naming the table is fine).
        if "ClientSituationRecord" in text:
            offenders.append(path.name)
    assert offenders == []
    ledger = (ai_dir / "reading_ledger.py").read_text(encoding="utf-8", errors="replace")
    assert "record_situation" in ledger  # the write hook is present…
    assert "ClientSituationRecord" not in ledger  # …but no read/query capability
    # And build_client_file (the CLIENT FILE the LLM sees) is untouched by A1:
    # it neither imports the writer module nor references the record model.
    # (The bare word "situation" appears in its pre-existing persona prose,
    # so the check targets the actual code references.)
    assistant = (ai_dir / "reading_assistant.py").read_text(encoding="utf-8", errors="replace")
    assert "situation_memory" not in assistant
    assert "ClientSituationRecord" not in assistant
    assert "client_situation_records" not in assistant


# ---------------------------------------------------------------------------
# A2 — the v2 read-only projection endpoint
# ---------------------------------------------------------------------------

SYNTHETIC_TOKEN = "synthetic_phase_a2_token_000000000001"
AUTH = {"Authorization": f"Bearer {SYNTHETIC_TOKEN}"}


def _make_v2_app(db, allowed_psychic_ids):
    from app.dependencies import second_brain_readonly_auth as auth_mod
    from app.integrations.second_brain_readonly_config import SecondBrainReadonlyConfig
    from app.routers import second_brain_situation as v2

    app = FastAPI()
    app.include_router(v2.router, prefix="/api/integrations/second-brain/valentina/v2")

    def _test_config():
        return SecondBrainReadonlyConfig(
            enabled=True,
            token=SYNTHETIC_TOKEN,
            allowed_psychic_ids=frozenset(allowed_psychic_ids),
            validation_errors=(),
        )

    def _test_db():
        yield db

    app.dependency_overrides[auth_mod.get_second_brain_readonly_config] = _test_config
    # Override only the session opening — the auth chain stays REAL.
    app.dependency_overrides[v2.get_situation_db] = _test_db
    return app


def _seed_situation(db, make_user, psychic=None):
    client = make_user()
    psychic = psychic or make_user(role=Role.PSYCHIC)
    chat = Chat(user_id=client.id, psychic_id=psychic.id, status=ChatStatus.ACTIVE)
    db.add(chat)
    db.commit()
    situation_memory.apply_situation_update(db, chat.id, REAL_CLIENT_TEXT, REAL_DELIVERED_TEXT)
    return client, psychic, chat


def test_v2_rejects_missing_and_wrong_tokens(db, make_user):
    client, psychic, _ = _seed_situation(db, make_user)
    app = _make_v2_app(db, {psychic.id})
    with TestClient(app) as http:
        assert http.get("/api/integrations/second-brain/valentina/v2/situations").status_code == 401
        wrong = http.get(
            "/api/integrations/second-brain/valentina/v2/situations",
            headers={"Authorization": "Bearer not-the-token-000000000000000000"},
        )
        assert wrong.status_code == 401


def test_v2_lists_and_fetches_by_code_and_id(db, make_user):
    client, psychic, _ = _seed_situation(db, make_user)
    app = _make_v2_app(db, {psychic.id})
    with TestClient(app) as http:
        listing = http.get("/api/integrations/second-brain/valentina/v2/situations", headers=AUTH)
        assert listing.status_code == 200
        assert listing.headers["cache-control"] == "no-store"
        body = listing.json()
        assert body["total"] == 1
        row = body["records"][0]
        assert row["client_id"] == client.id
        assert row["client_code"] == client.client_code
        assert "avoidant-partner" in row["situation"]["themes"]

        by_code = http.get(
            f"/api/integrations/second-brain/valentina/v2/situations/{client.client_code}",
            headers=AUTH,
        )
        assert by_code.status_code == 200
        assert by_code.json()["client_id"] == client.id

        by_id = http.get(
            f"/api/integrations/second-brain/valentina/v2/situations/{client.id}",
            headers=AUTH,
        )
        assert by_id.status_code == 200
        assert by_id.json()["client_code"] == client.client_code


def test_v2_scope_excludes_unlisted_psychics_clients(db, make_user):
    # Client A read by allowlisted psychic; client B read by an UNLISTED one.
    client_a, psychic_a, _ = _seed_situation(db, make_user)
    client_b, psychic_b, _ = _seed_situation(db, make_user)
    app = _make_v2_app(db, {psychic_a.id})
    with TestClient(app) as http:
        body = http.get("/api/integrations/second-brain/valentina/v2/situations", headers=AUTH).json()
        ids = {row["client_id"] for row in body["records"]}
        assert client_a.id in ids
        assert client_b.id not in ids  # out of scope, invisible
        out = http.get(
            f"/api/integrations/second-brain/valentina/v2/situations/{client_b.client_code}",
            headers=AUTH,
        )
        assert out.status_code == 404


def test_v2_registers_no_write_routes():
    from app.routers import second_brain_situation as v2

    methods = set()
    for route in v2.router.routes:
        methods |= set(getattr(route, "methods", set()))
    assert methods <= {"GET", "HEAD"}
