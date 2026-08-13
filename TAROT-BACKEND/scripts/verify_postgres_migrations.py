"""Exercise the complete Alembic lifecycle against disposable PostgreSQL."""

from __future__ import annotations

import os
from pathlib import Path

from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, inspect
from sqlalchemy.engine import make_url


def _database_url() -> str:
    value = os.environ.get("DATABASE_URL", "").strip()
    if not value:
        raise SystemExit("DATABASE_URL is required.")
    url = make_url(value)
    if url.get_backend_name() != "postgresql":
        raise SystemExit("The migration lane requires PostgreSQL.")
    if url.host not in {"127.0.0.1", "localhost", "::1"}:
        raise SystemExit("The migration lane refuses a non-local database host.")
    if os.environ.get("MIGRATION_TEST_CONFIRM_DISPOSABLE") != "YES":
        raise SystemExit("Set MIGRATION_TEST_CONFIRM_DISPOSABLE=YES for a disposable database.")
    return value


def _app_tables(database_url: str) -> set[str]:
    engine = create_engine(database_url)
    try:
        return set(inspect(engine).get_table_names()) - {"alembic_version"}
    finally:
        engine.dispose()


def main() -> None:
    database_url = _database_url()
    if _app_tables(database_url):
        raise SystemExit("The migration lane requires an empty disposable database.")

    config = Config(str(Path(__file__).resolve().parents[1] / "alembic.ini"))

    command.upgrade(config, "head")
    command.current(config, check_heads=True)
    command.check(config)
    print("postgres_migrations:first_upgrade_and_parity=PASS")

    command.downgrade(config, "base")
    leftovers = _app_tables(database_url)
    if leftovers:
        raise SystemExit(f"Downgrade left application tables: {sorted(leftovers)}")
    print("postgres_migrations:full_downgrade=PASS")

    command.upgrade(config, "head")
    command.current(config, check_heads=True)
    command.check(config)
    print("postgres_migrations:reupgrade_and_parity=PASS")


if __name__ == "__main__":
    main()
