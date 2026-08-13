"""Atlas Track A (phases A0-A2): situation records, client codes, the
deterministic extractor, and the v2 read-only projection.

ZERO API anywhere: the extractor is pure regex/keyword code, the pipeline is
never invoked, and the endpoint tests run against an in-memory sqlite session.
Extractor fixtures use REAL transcript/situation language taken from the
owner's actual client records and production reading copy — not synthetic
placeholder text — per the phase's testing requirement.
"""

from __future__ import annotations

import json
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
    psychic = make_user(role=Role.PSYCHIC)
    record = ClientSituationRecord(
        client_id=client.id,
        psychic_id=psychic.id,
        situation={"themes": ["grief-bereavement"]},
        source=SituationSource.DETERMINISTIC,
    )
    db.add(record)
    db.commit()
    loaded = (
        db.query(ClientSituationRecord)
        .filter_by(client_id=client.id, psychic_id=psychic.id)
        .one()
    )
    assert loaded.situation["themes"] == ["grief-bereavement"]
    assert loaded.source == SituationSource.DETERMINISTIC


def test_record_is_unique_per_client_psychic_pair_not_per_client(db, make_user):
    """The schema change itself: client alone is no longer unique; the PAIR is."""
    client = make_user()
    yusuf = make_user(role=Role.PSYCHIC)
    valentina = make_user(role=Role.PSYCHIC)

    db.add(ClientSituationRecord(client_id=client.id, psychic_id=yusuf.id, situation={}))
    db.add(ClientSituationRecord(client_id=client.id, psychic_id=valentina.id, situation={}))
    db.commit()  # two rows for ONE client — impossible under the old schema
    assert db.query(ClientSituationRecord).filter_by(client_id=client.id).count() == 2

    # But the same pair twice must still be rejected.
    db.add(ClientSituationRecord(client_id=client.id, psychic_id=yusuf.id, situation={}))
    with pytest.raises(Exception):
        db.commit()
    db.rollback()


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

    # head now includes the per-psychic siloing migration, so assert its shape.
    connection = sqlite3.connect(db_path)
    situation_columns = {
        row[1] for row in connection.execute("PRAGMA table_info(client_situation_records)")
    }
    assert "psychic_id" in situation_columns
    indexes = {
        row[1]: row[2]  # name -> unique flag
        for row in connection.execute("PRAGMA index_list(client_situation_records)")
    }
    # client_id alone must NOT be unique any more; the PAIR must be.
    assert indexes.get("ix_client_situation_records_client_id") == 0
    assert "ix_client_situation_records_psychic_id" in indexes
    pair_unique = [
        name
        for name, is_unique in indexes.items()
        if is_unique
        and [r[2] for r in connection.execute(f'PRAGMA index_info("{name}")')]
        == ["client_id", "psychic_id"]
    ]
    assert pair_unique, f"no UNIQUE(client_id, psychic_id) found in {indexes}"
    connection.close()

    # Step back over the siloing migration only: the table survives, in the old
    # one-row-per-client shape.
    # The Articles foundation now follows the silo migration at head. Step
    # explicitly to the pre-silo revision rather than assuming silo is head.
    down_one = _alembic(env, "downgrade", "a9b8c7d6e5f4")
    assert down_one.returncode == 0, down_one.stderr
    connection = sqlite3.connect(db_path)
    situation_columns = {
        row[1] for row in connection.execute("PRAGMA table_info(client_situation_records)")
    }
    assert "psychic_id" not in situation_columns
    indexes = {
        row[1]: row[2]
        for row in connection.execute("PRAGMA index_list(client_situation_records)")
    }
    assert indexes.get("ix_client_situation_records_client_id") == 1, "unique again"
    connection.close()

    # And all the way back down removes the table and the client_code column.
    down_two = _alembic(env, "downgrade", "-1")
    assert down_two.returncode == 0, down_two.stderr
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


# ---------------------------------------------------------------------------
# Per-psychic siloing — the correctness requirement of this schema
# ---------------------------------------------------------------------------

# Two clearly distinguishable conversations. Nothing in one may ever appear in
# the other reader's record.
YUSUF_CLIENT_TEXT = (
    "My husband hits me and I am afraid to go home. There is a restraining order now."
)
YUSUF_DELIVERED = "I hear how frightening that is. You will know where you stand within ten days."
VALENTINA_CLIENT_TEXT = "My sister keeps draining me about money and I feel guilty saying no."
VALENTINA_DELIVERED = "Your business will turn a corner within three weeks."


def _seed_pair(db, make_user, client, psychic, client_text, delivered_text):
    chat = Chat(user_id=client.id, psychic_id=psychic.id, status=ChatStatus.ACTIVE)
    db.add(chat)
    db.commit()
    situation_memory.apply_situation_update(db, chat.id, client_text, delivered_text)
    return chat


def test_two_psychics_seeing_one_client_get_separate_records(db, make_user):
    client = make_user()
    yusuf = make_user(role=Role.PSYCHIC)
    valentina = make_user(role=Role.PSYCHIC)

    _seed_pair(db, make_user, client, yusuf, YUSUF_CLIENT_TEXT, YUSUF_DELIVERED)
    _seed_pair(db, make_user, client, valentina, VALENTINA_CLIENT_TEXT, VALENTINA_DELIVERED)

    records = db.query(ClientSituationRecord).filter_by(client_id=client.id).all()
    assert len(records) == 2, "one record per reader, not one merged document"
    assert {r.psychic_id for r in records} == {yusuf.id, valentina.id}


def test_one_psychics_briefing_never_contains_the_others_content(db, make_user):
    """THE leak test. Yusuf's record must not carry a single fact that only
    appeared in the client's sessions with Valentina, and vice versa."""

    client = make_user()
    yusuf = make_user(role=Role.PSYCHIC)
    valentina = make_user(role=Role.PSYCHIC)

    _seed_pair(db, make_user, client, yusuf, YUSUF_CLIENT_TEXT, YUSUF_DELIVERED)
    _seed_pair(db, make_user, client, valentina, VALENTINA_CLIENT_TEXT, VALENTINA_DELIVERED)

    def silo(psychic):
        return (
            db.query(ClientSituationRecord)
            .filter_by(client_id=client.id, psychic_id=psychic.id)
            .one()
        )

    y, v = silo(yusuf).situation, silo(valentina).situation

    # Each reader saw a genuinely different situation…
    assert "family-violence" in y["themes"]
    assert "family-drain" in v["themes"]
    # …and neither leaks into the other.
    assert "family-drain" not in y["themes"]
    assert "family-violence" not in v["themes"]

    # Sensitive flags are the highest-stakes field — check them explicitly.
    assert y.get("sensitive_flags"), "the violence disclosure should raise a flag"
    assert not set(y.get("sensitive_flags") or []) & set(v.get("sensitive_flags") or [])

    # Open predictions stay with the reader who made them.
    y_predictions = {p["value"] for p in y.get("open_predictions") or []}
    v_predictions = {p["value"] for p in v.get("open_predictions") or []}
    assert y_predictions and v_predictions
    assert not (y_predictions & v_predictions)

    # And last_reader is each silo's own reader, never overwritten by the other.
    assert silo(yusuf).situation["last_reader"] == yusuf.username
    assert silo(valentina).situation["last_reader"] == valentina.username

    # Belt and braces: no substring of one conversation's people appears in the
    # other record, serialized whole.
    assert "draining" not in json.dumps(y)
    assert "violence" not in json.dumps(v)


def test_repeat_turns_with_the_same_psychic_still_merge_into_one_record(db, make_user):
    """Siloing must not break the rolling behaviour WITHIN one reader's silo.

    Note `chats` is uniquely keyed on (user_id, psychic_id), so a client and a
    reader share ONE chat thread — repeat sessions are further delivered bubbles
    on that same chat, which is what this simulates.
    """

    client = make_user()
    yusuf = make_user(role=Role.PSYCHIC)
    chat = _seed_pair(db, make_user, client, yusuf, YUSUF_CLIENT_TEXT, YUSUF_DELIVERED)
    situation_memory.apply_situation_update(
        db, chat.id, "My sister keeps draining me about money.", None
    )

    records = db.query(ClientSituationRecord).filter_by(client_id=client.id).all()
    assert len(records) == 1, "same reader keeps ONE rolling record"
    themes = records[0].situation["themes"]
    assert "family-violence" in themes and "family-drain" in themes


def test_a_chat_can_never_lack_a_psychic_and_the_writer_guards_anyway(db, make_user):
    """The writer refuses to write without a psychic rather than falling back to
    a shared client-wide row. The schema also forbids it, so this documents both
    layers: the DB invariant, and the guard behind it."""

    from app.models.chat import Chat as ChatModel

    assert ChatModel.__table__.c.psychic_id.nullable is False

    client = make_user()
    db.add(ChatModel(user_id=client.id, psychic_id=None, status=ChatStatus.ACTIVE))
    with pytest.raises(Exception):
        db.commit()
    db.rollback()

    # And an unknown chat id writes nothing at all.
    assert situation_memory.apply_situation_update(
        db, 999_999, YUSUF_CLIENT_TEXT, YUSUF_DELIVERED
    ) is False
    assert db.query(ClientSituationRecord).count() == 0


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

        assert row["psychic_id"] == psychic.id  # every row names its reader

        by_code = http.get(
            f"/api/integrations/second-brain/valentina/v2/situations/{client.client_code}",
            headers=AUTH,
        )
        assert by_code.status_code == 200
        # A LIST now — one entry per psychic the client has seen.
        assert by_code.json()["total"] == 1
        assert by_code.json()["records"][0]["client_id"] == client.id

        by_id = http.get(
            f"/api/integrations/second-brain/valentina/v2/situations/{client.id}",
            headers=AUTH,
        )
        assert by_id.status_code == 200
        assert by_id.json()["records"][0]["client_code"] == client.client_code


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


def test_v2_scope_hides_another_psychics_silo_for_a_SHARED_client(db, make_user):
    """The read-side leak. One client, two readers, only one allowlisted: the
    endpoint must return that reader's silo ONLY.

    Under the old shape this was impossible to get right — scope was "clients
    with >=1 chat handled by an allowed psychic" and there was a single merged
    document per client, so an allowlisted reader's scope returned a record
    containing the other reader's conversations.
    """

    client = make_user()
    allowed = make_user(role=Role.PSYCHIC)
    hidden = make_user(role=Role.PSYCHIC)
    _seed_pair(db, make_user, client, allowed, YUSUF_CLIENT_TEXT, YUSUF_DELIVERED)
    _seed_pair(db, make_user, client, hidden, VALENTINA_CLIENT_TEXT, VALENTINA_DELIVERED)

    app = _make_v2_app(db, {allowed.id})
    with TestClient(app) as http:
        listing = http.get(
            "/api/integrations/second-brain/valentina/v2/situations", headers=AUTH
        ).json()
        assert listing["total"] == 1
        assert {row["psychic_id"] for row in listing["records"]} == {allowed.id}

        detail = http.get(
            f"/api/integrations/second-brain/valentina/v2/situations/{client.client_code}",
            headers=AUTH,
        ).json()
        assert detail["total"] == 1
        row = detail["records"][0]
        assert row["psychic_id"] == allowed.id
        # The hidden reader's content is absent from the whole response body.
        assert "family-drain" not in json.dumps(detail)


def test_v2_psychic_id_filter_narrows_to_one_silo(db, make_user):
    """What a briefing path must use: ?psychic_id= returns exactly one silo."""

    client = make_user()
    a = make_user(role=Role.PSYCHIC)
    b = make_user(role=Role.PSYCHIC)
    _seed_pair(db, make_user, client, a, YUSUF_CLIENT_TEXT, YUSUF_DELIVERED)
    _seed_pair(db, make_user, client, b, VALENTINA_CLIENT_TEXT, VALENTINA_DELIVERED)

    app = _make_v2_app(db, {a.id, b.id})  # owner sees both
    base = f"/api/integrations/second-brain/valentina/v2/situations/{client.client_code}"
    with TestClient(app) as http:
        both = http.get(base, headers=AUTH).json()
        assert both["total"] == 2  # unfiltered: every silo the caller may see

        only_a = http.get(f"{base}?psychic_id={a.id}", headers=AUTH).json()
        assert only_a["total"] == 1
        assert only_a["records"][0]["psychic_id"] == a.id
        assert "family-drain" not in json.dumps(only_a)

        only_b = http.get(f"{base}?psychic_id={b.id}", headers=AUTH).json()
        assert only_b["total"] == 1
        assert "family-violence" not in json.dumps(only_b)

        # Asking for a silo outside the allowlist yields nothing, not a leak.
        outsider = make_user(role=Role.PSYCHIC)
        assert http.get(f"{base}?psychic_id={outsider.id}", headers=AUTH).status_code == 404


def test_v2_empty_allowlist_sees_nothing(db, make_user):
    """Two independent layers, both asserted.

    The auth gate fail-closes the whole route when no psychic is allowlisted
    (config.ready is false -> 404), and beneath that the query itself scopes on
    psychic_id IN (), which matches no row. Either alone would be sufficient.
    """

    client, psychic, _ = _seed_situation(db, make_user)

    app = _make_v2_app(db, set())
    with TestClient(app) as http:
        assert http.get(
            "/api/integrations/second-brain/valentina/v2/situations", headers=AUTH
        ).status_code == 404
        assert http.get(
            f"/api/integrations/second-brain/valentina/v2/situations/{client.client_code}",
            headers=AUTH,
        ).status_code == 404

    # The service layer underneath returns nothing even if the gate were opened.
    from app.services.second_brain_situation import (
        get_situation_records,
        list_situation_records,
    )

    rows, total = list_situation_records(db, frozenset())
    assert rows == [] and total == 0
    assert get_situation_records(db, frozenset(), client.client_code) == []


def test_v2_registers_no_write_routes():
    from app.routers import second_brain_situation as v2

    methods = set()
    for route in v2.router.routes:
        methods |= set(getattr(route, "methods", set()))
    assert methods <= {"GET", "HEAD"}
