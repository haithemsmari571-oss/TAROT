from __future__ import annotations

import os
from pathlib import Path
import sqlite3
import subprocess
import sys


BACKEND_ROOT = Path(__file__).resolve().parents[1]


# The migration under test: "add explicit AI prompt drafts, activation metadata and output
# contracts". Named rather than reached via "head" — see the note at the upgrade below.
PROMPT_ACTIVATION_REVISION = "c4e5f6a7b8c9"


def _alembic(environment: dict[str, str], *arguments: str):
    return subprocess.run(
        [sys.executable, "-m", "alembic", *arguments],
        cwd=BACKEND_ROOT,
        env=environment,
        capture_output=True,
        text=True,
        check=False,
    )


def test_prompt_activation_migration_preserves_and_versions_existing_text(tmp_path):
    database_path = tmp_path / "prompt-migration.sqlite3"
    connection = sqlite3.connect(database_path)
    connection.executescript(
        """
        CREATE TABLE ai_prompts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            key VARCHAR(64) NOT NULL UNIQUE,
            name VARCHAR(128) NOT NULL,
            description TEXT NOT NULL,
            model VARCHAR(64) NOT NULL,
            prompt TEXT NOT NULL,
            default_prompt TEXT NOT NULL,
            variables JSON,
            status VARCHAR(16) NOT NULL DEFAULT 'ACTIVE',
            last_run_at DATETIME,
            last_run_status VARCHAR(255),
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE ai_prompt_versions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            prompt_id INTEGER NOT NULL REFERENCES ai_prompts(id),
            text TEXT NOT NULL,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX ix_ai_prompt_versions_prompt_id
            ON ai_prompt_versions(prompt_id);
        INSERT INTO ai_prompts
            (key, name, description, model, prompt, default_prompt)
        VALUES
            ('numerology.full-reading', 'Numerology Full Reading',
             'test', 'claude-sonnet-4-6', 'second text', 'first text');
        INSERT INTO ai_prompt_versions (prompt_id, text)
        VALUES (1, 'first text'), (1, 'second text');
        """
    )
    connection.commit()
    connection.close()

    environment = {
        **os.environ,
        "DATABASE_URL": f"sqlite:///{database_path.as_posix()}",
    }
    stamped = _alembic(environment, "stamp", "b3c4d5e6f7a8")
    assert stamped.returncode == 0, stamped.stderr
    # Bounded to the prompt-activation migration this test is ABOUT, not to head. The
    # fixture above is a minimal two-table BEFORE state, so upgrading all the way to head
    # made this test fail on the first later migration to touch any OTHER table — which is
    # a fact about the fixture, not about the migration under test.
    upgraded = _alembic(environment, "upgrade", PROMPT_ACTIVATION_REVISION)
    assert upgraded.returncode == 0, upgraded.stderr

    connection = sqlite3.connect(database_path)
    prompt_columns = {
        row[1] for row in connection.execute("PRAGMA table_info(ai_prompts)")
    }
    version_columns = {
        row[1]
        for row in connection.execute("PRAGMA table_info(ai_prompt_versions)")
    }
    assert {
        "output_schema",
        "output_schema_version",
        "classification",
        "active_version",
        "draft_version",
    }.issubset(prompt_columns)
    assert {"version", "state", "activated_at"}.issubset(version_columns)
    assert connection.execute(
        "SELECT prompt, active_version FROM ai_prompts WHERE id = 1"
    ).fetchone() == ("second text", 2)
    assert connection.execute(
        "SELECT version, state FROM ai_prompt_versions ORDER BY id"
    ).fetchall() == [(1, "SUPERSEDED"), (2, "ACTIVE")]
    connection.close()

    downgraded = _alembic(environment, "downgrade", "b3c4d5e6f7a8")
    assert downgraded.returncode == 0, downgraded.stderr
    connection = sqlite3.connect(database_path)
    assert "active_version" not in {
        row[1] for row in connection.execute("PRAGMA table_info(ai_prompts)")
    }
    assert connection.execute(
        "SELECT text FROM ai_prompt_versions ORDER BY id"
    ).fetchall() == [("first text",), ("second text",)]
    connection.close()
