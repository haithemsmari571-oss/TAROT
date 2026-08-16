"""The session capsule: what the reader still knows an hour into a three-hour reading.

The facts half must survive compression byte for byte — a summariser that rounds "life
path 5" to "a five energy" has destroyed the one thing a psychic reading cannot rebuild.
The narrative half compresses, additively, and must never re-summarise its own output.
"""

from app.services.ai import reading_capsule as C
from app.services.ai.reading_session import create_session_state, record_client_message


def _state(**kwargs):
    state = create_session_state("chat:cap", chat_id=99, **kwargs)
    return state


def _say(state, role, content):
    if role == "client":
        record_client_message(state, content)
    else:
        from app.services.ai.reading_ledger import record_commitments
        from app.services.ai.reading_session import record_sent_message

        record_sent_message(state, content)
        record_commitments(state, content)


# ── the facts block ──────────────────────────────────────────────────────────
def test_facts_block_holds_her_own_words_verbatim():
    state = _state()
    _say(state, "client", "my ex is called Daniel and he was born 14 August 1992")
    _say(state, "logan", "ok i hear you")
    block = C.format_capsule(state)
    assert "SESSION FACTS" in block
    assert "my ex is called Daniel and he was born 14 August 1992" in block


def test_facts_block_captures_cards_numbers_signs_dates_and_names():
    state = _state()
    _say(state, "client", "im a Scorpio, born 3 March 1990")
    _say(state, "logan", "the Tower came up for Daniel, and your life path 5 explains it")
    _say(state, "logan", "something shifts by the end of March")
    block = C.format_capsule(state)
    for fact in ("The Tower", "life path 5", "Scorpio", "3 March 1990", "Daniel"):
        assert fact in block, fact


def test_facts_survive_a_fold_completely_unchanged(monkeypatch):
    """The rule the whole design turns on: compression never touches the facts."""
    state = _state()
    _say(state, "client", "im a Scorpio, born 3 March 1990, my ex is Daniel")
    _say(state, "logan", "the Tower came up for Daniel and your life path 5 explains it")
    # Pad the verbatim tail past the fold trigger.
    for i in range(40):
        _say(state, "client", f"and another thing about my life number {i} " + "x" * 120)
    assert C.needs_fold(state)

    monkeypatch.setattr(C, "_extend_narrative", lambda prev, new: "They talked it through.")
    assert C.fold_now(state) is True

    block = C.format_capsule(state)
    for fact in ("The Tower", "life path 5", "Scorpio", "3 March 1990", "Daniel"):
        assert fact in block, fact
    assert "im a Scorpio, born 3 March 1990, my ex is Daniel" in block   # her words, verbatim
    assert "They talked it through." in block                            # and the summary


# ── the narrative: additive only ─────────────────────────────────────────────
def test_compression_is_additive_and_never_resummarises(monkeypatch):
    state = _state()
    for i in range(40):
        _say(state, "client", f"turn {i} " + "y" * 160)
    seen = []

    def fake_extend(previous, new_entries):
        seen.append(previous)
        return f"paragraph about {len(new_entries)} entries"

    monkeypatch.setattr(C, "_extend_narrative", fake_extend)
    assert C.fold_now(state) is True
    first = state.capsule_narrative

    for i in range(40):
        _say(state, "client", f"later turn {i} " + "z" * 160)
    assert C.needs_fold(state)
    assert C.fold_now(state) is True

    # The earlier paragraph is still present, character for character, and was only ever
    # shown to the second pass as read-only context.
    assert state.capsule_narrative.startswith(first)
    assert len(state.capsule_narrative) > len(first)
    assert seen[1] == first


def test_a_failed_fold_changes_nothing(monkeypatch):
    state = _state()
    for i in range(40):
        _say(state, "client", f"turn {i} " + "y" * 160)

    def boom(previous, new_entries):
        raise RuntimeError("model down")

    monkeypatch.setattr(C, "_extend_narrative", boom)
    assert C.fold_now(state) is False
    assert state.capsule_narrative == ""
    assert state.capsule_folded_upto == 0


def test_fold_triggers_on_size_not_on_turn_count():
    state = _state()
    for i in range(30):
        _say(state, "client", "ok")          # thirty turns, tiny
    assert not C.needs_fold(state)
    _say(state, "client", "x" * (C.CAPSULE_FOLD_ABOVE_CHARS + 1))
    assert C.needs_fold(state)


def test_recent_turns_stay_verbatim_after_a_fold(monkeypatch):
    state = _state()
    for i in range(40):
        _say(state, "client", f"old turn {i} " + "y" * 160)
    _say(state, "client", "THE MOST RECENT THING SHE SAID")
    monkeypatch.setattr(C, "_extend_narrative", lambda p, n: "summary")
    C.fold_now(state)
    block = C.format_capsule(state)
    assert "THE MOST RECENT THING SHE SAID" in block
    assert "THE CONVERSATION RIGHT NOW" in block


# ── durability ───────────────────────────────────────────────────────────────
def test_the_migration_is_the_direct_successor_to_the_current_head():
    """A migration off the wrong parent is how this backend once lost 24 minutes."""
    import importlib.util
    from pathlib import Path

    path = (
        Path(__file__).parents[1] / "alembic" / "versions"
        / "c7e8f9a0b1c2_add_session_capsule_and_atlas_delay.py"
    )
    spec = importlib.util.spec_from_file_location("capsule_migration", path)
    migration = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migration)
    assert migration.revision == "c7e8f9a0b1c2"
    assert migration.down_revision == "a1c2e3f4b5d6"


def test_migration_adds_the_columns_and_backfills_existing_rows(tmp_path):
    """Existing rows must come out behaving exactly as they did before the deploy."""
    import os
    import sqlite3
    import subprocess
    import sys
    from pathlib import Path

    backend_root = Path(__file__).resolve().parents[1]
    db_path = tmp_path / "capsule-migration.sqlite"
    connection = sqlite3.connect(db_path)
    connection.executescript(
        """
        CREATE TABLE reading_session_states (chat_id INTEGER PRIMARY KEY, reserve TEXT);
        CREATE TABLE atlas_client_memory_jobs (
            chat_session_id INTEGER PRIMARY KEY, created_at TIMESTAMP
        );
        INSERT INTO reading_session_states (chat_id, reserve) VALUES (1, 'held prose');
        INSERT INTO atlas_client_memory_jobs (chat_session_id, created_at)
            VALUES (5, '2026-08-01 10:00:00');
        """
    )
    connection.commit()
    connection.close()

    env = {**os.environ, "DATABASE_URL": f"sqlite:///{db_path}"}

    def alembic(*args):
        return subprocess.run(
            [sys.executable, "-m", "alembic", *args],
            cwd=str(backend_root), env=env, capture_output=True, text=True,
        )

    stamped = alembic("stamp", "a1c2e3f4b5d6")
    assert stamped.returncode == 0, stamped.stderr
    upgraded = alembic("upgrade", "c7e8f9a0b1c2")
    assert upgraded.returncode == 0, upgraded.stderr

    connection = sqlite3.connect(db_path)
    row = connection.execute(
        "SELECT reserve, capsule_narrative, capsule_folded_upto FROM reading_session_states"
    ).fetchone()
    assert row == ("held prose", "", 0)          # existing reading untouched, capsule empty
    job = connection.execute(
        "SELECT created_at, not_before FROM atlas_client_memory_jobs"
    ).fetchone()
    assert job[1] == job[0]                       # backfilled: already-queued stays eligible
    connection.close()

    downgraded = alembic("downgrade", "a1c2e3f4b5d6")
    assert downgraded.returncode == 0, downgraded.stderr
    connection = sqlite3.connect(db_path)
    columns = {
        row[1] for row in connection.execute("PRAGMA table_info(reading_session_states)")
    }
    assert "capsule_narrative" not in columns
    assert connection.execute("SELECT reserve FROM reading_session_states").fetchone() == (
        "held prose",
    )
    connection.close()


def test_capsule_round_trips_through_the_persistence_layer():
    from app.services.ai.reading_session import _row_to_state, _state_to_row_fields

    state = _state()
    state.capsule_narrative = "She arrived worried about her ex."
    state.capsule_folded_upto = 7
    fields = _state_to_row_fields(state)
    assert fields["capsule_narrative"] == "She arrived worried about her ex."
    assert fields["capsule_folded_upto"] == 7

    class Row:
        pass

    row = Row()
    for key, value in fields.items():
        setattr(row, key, value)
    restored = _row_to_state(row)
    assert restored.capsule_narrative == "She arrived worried about her ex."
    assert restored.capsule_folded_upto == 7
