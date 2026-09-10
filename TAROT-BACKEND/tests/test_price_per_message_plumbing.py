"""Per-message billing, step 1: plumbing only.

The setting, the users.price_per_message column and its migration, the psychic
schemas and the psychic service write/echo. No behaviour change for clients.
"""

import importlib.util
from pathlib import Path

import sqlalchemy as sa
from alembic.migration import MigrationContext
from alembic.operations import Operations
from sqlalchemy import create_engine, inspect
from sqlalchemy.pool import StaticPool

from app.enums.role import Role
from app.models import User
from app.models.base import Base
from app.schemas.psychic import PsychicCreate, PsychicRead, PsychicUpdate
from app.services.psychics import _psychic_to_out

BACKEND_ROOT = Path(__file__).resolve().parents[1]
MIGRATION = (
    BACKEND_ROOT / "alembic" / "versions" / "f4a5b6c7d8e9_add_price_per_message_to_users.py"
)


def _load_migration():
    spec = importlib.util.spec_from_file_location("migration_f4a5b6c7d8e9", MIGRATION)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _user_columns(conn) -> dict:
    return {column["name"]: column for column in inspect(conn).get_columns("users")}


def test_migration_upgrade_and_downgrade_against_the_test_database():
    migration = _load_migration()
    assert migration.revision == "f4a5b6c7d8e9"
    assert migration.down_revision == "e2f3a4b5c6d7"  # chained onto the current head

    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    Base.metadata.create_all(engine)  # the models already carry the new column
    try:
        with engine.begin() as conn:
            context = MigrationContext.configure(conn)
            assert "price_per_message" in _user_columns(conn)

            with Operations.context(context):
                migration.downgrade()
            assert "price_per_message" not in _user_columns(conn)

            with Operations.context(context):
                migration.upgrade()
            columns = _user_columns(conn)
            added = columns["price_per_message"]
            reference = columns["price_per_second"]
            assert added["nullable"] is True
            assert isinstance(added["type"], sa.Float)
            assert type(added["type"]) is type(reference["type"])
            assert added["nullable"] == reference["nullable"]

            with Operations.context(context):
                migration.downgrade()
            assert "price_per_message" not in _user_columns(conn)
    finally:
        engine.dispose()


def test_psychic_schemas_round_trip_price_per_message_set_and_unset(db):
    # Create: set and unset.
    common = dict(
        password="password1", is_online=True, categories_ids=[], availability=[],
        price_per_second=0.05,
    )
    with_price = PsychicCreate(
        username="reader", email="reader@test.co", price_per_message=2.5, **common
    )
    without_price = PsychicCreate(username="reader2", email="reader2@test.co", **common)
    assert with_price.price_per_message == 2.5
    assert without_price.price_per_message is None

    # Update: only an explicitly sent value reaches the generic setattr loop.
    assert PsychicUpdate(price_per_message=3.0).model_dump(exclude_unset=True) == {
        "price_per_message": 3.0
    }
    assert "price_per_message" not in PsychicUpdate(bio="x").model_dump(exclude_unset=True)

    # Read: the service echoes the stored value, and None when unset.
    priced = User(
        email="p@test.co", username="p", password_hash="h", role=Role.PSYCHIC,
        price_per_second=0.05, price_per_message=2.5,
    )
    unpriced = User(
        email="q@test.co", username="q", password_hash="h", role=Role.PSYCHIC,
        price_per_second=0.05,
    )
    db.add_all([priced, unpriced])
    db.commit()
    db.refresh(priced)
    db.refresh(unpriced)

    out_priced = _psychic_to_out(priced)
    out_unpriced = _psychic_to_out(unpriced)
    assert isinstance(out_priced, PsychicRead)
    assert out_priced.price_per_message == 2.5
    assert out_priced.price_per_second == 0.05
    assert out_unpriced.price_per_message is None
    assert "price_per_message" in out_priced.model_dump()
