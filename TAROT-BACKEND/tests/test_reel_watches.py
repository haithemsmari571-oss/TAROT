"""The Shorts tab shows each client the reels she has not watched first (ROUND69).

A reel counts as watched once the tab has played 90 percent of it and called
POST /api/library-items/reels/{key}/watched. For that client, GET
/api/library-items/reels then lists the reels she has not watched, newest
first, then the ones she has, the least recently watched first. Nothing is
left out. Everyone else (signed out, another client, the owner, a reader) and
the public reels pages keep newest first.
"""

from datetime import datetime, timedelta, timezone
from importlib.util import module_from_spec, spec_from_file_location
from pathlib import Path
import re

from alembic.migration import MigrationContext
from alembic.operations import Operations
from fastapi import FastAPI
from fastapi.testclient import TestClient
import pytest
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.exc import IntegrityError

from app.database.client import get_db
from app.enums.role import Role
from app.models.library_item import LibraryItem
from app.models.reel_watch import ReelWatch
from app.routers.library_items import public_router
from app.routers.public_seo import router as public_seo_router
from app.services.library_items import record_reel_watched
from app.utils.security import create_access_token


class _Storage:
    def public_url(self, key):
        return f"https://media.example.test/{key}"


@pytest.fixture
def http(db, monkeypatch):
    monkeypatch.setattr("app.services.library_items.get_object_storage", lambda: _Storage())
    app = FastAPI()
    app.include_router(public_router, prefix="/api/library-items")
    app.include_router(public_seo_router)
    app.dependency_overrides[get_db] = lambda: db
    return TestClient(app, raise_server_exceptions=False)


def _bearer(user):
    return {"Authorization": f"Bearer {create_access_token({'sub': str(user.id)})}"}


def _reel(db, key, *, hours_ago, enabled=True):
    item = LibraryItem(
        key=key,
        type="reel",
        title=f"Reel {key}",
        video_file_path=f"library/video/{key}.mp4",
        video_content_type="video/mp4",
        video_size_bytes=1000,
        video_sha256="a" * 64,
        video_width=720,
        video_height=1280,
        duration_seconds=30,
        enabled=enabled,
        published_at=datetime.now(timezone.utc) - timedelta(hours=hours_ago),
    )
    db.add(item)
    db.commit()
    return item


@pytest.fixture
def shelf(db):
    """Four published reels, a, b, c, d from newest to oldest, and what is not on the shelf."""
    reels = {key: _reel(db, key, hours_ago=hours) for key, hours in (("a", 1), ("b", 2), ("c", 3), ("d", 4))}
    _reel(db, "hidden", hours_ago=1, enabled=False)
    _reel(db, "future", hours_ago=-24)
    tone = LibraryItem(
        key="tone",
        type="meditation",
        title="Tone",
        audio_file_path="library/audio/tone.mp3",
        audio_content_type="audio/mpeg",
        audio_size_bytes=10,
        audio_sha256="b" * 64,
        duration_seconds=6,
        enabled=True,
        published_at=datetime.now(timezone.utc) - timedelta(days=1),
    )
    db.add(tone)
    db.commit()
    return reels


def _feed(http, user=None):
    response = http.get("/api/library-items/reels", headers=_bearer(user) if user else {})
    assert response.status_code == 200, response.text
    return [reel["key"] for reel in response.json()]


def test_a_client_sees_the_reels_she_has_not_watched_first_then_the_least_recently_watched(
    db, http, make_user, shelf
):
    client = make_user()
    assert _feed(http, client) == ["a", "b", "c", "d"]

    for key in ("a", "b"):
        recorded = http.post(f"/api/library-items/reels/{key}/watched", headers=_bearer(client))
        assert recorded.status_code == 204, recorded.text
        assert recorded.content == b""

    # The next visit opens on the third; the two she watched wait at the back.
    assert _feed(http, client) == ["c", "d", "a", "b"]
    rows = db.query(ReelWatch).filter(ReelWatch.user_id == client.id).all()
    assert sorted(row.library_item_id for row in rows) == [shelf["a"].id, shelf["b"].id]


def test_when_every_reel_is_watched_the_feed_is_still_whole_least_recently_watched_first(
    db, http, make_user, shelf
):
    client = make_user()
    start = datetime.now(timezone.utc)
    for minutes, key in enumerate(("c", "a", "d", "b")):
        record_reel_watched(db, user_id=client.id, item=shelf[key], now=start + timedelta(minutes=minutes))
    assert _feed(http, client) == ["c", "a", "d", "b"]

    # Watching c again moves it to the back; it keeps its one row.
    record_reel_watched(db, user_id=client.id, item=shelf["c"], now=start + timedelta(minutes=10))
    assert _feed(http, client) == ["a", "d", "b", "c"]
    rows = db.query(ReelWatch).filter(ReelWatch.user_id == client.id, ReelWatch.library_item_id == shelf["c"].id).all()
    assert len(rows) == 1
    assert rows[0].watched_at.replace(tzinfo=timezone.utc) == start + timedelta(minutes=10)


def test_a_new_reel_goes_to_the_top_for_everyone(db, http, make_user, shelf):
    client, other = make_user(), make_user()
    for key in ("a", "b", "c", "d"):
        assert http.post(f"/api/library-items/reels/{key}/watched", headers=_bearer(client)).status_code == 204

    _reel(db, "e", hours_ago=0.5)
    assert _feed(http, client) == ["e", "a", "b", "c", "d"]
    assert _feed(http, other) == ["e", "a", "b", "c", "d"]


def test_everyone_else_keeps_newest_first(db, http, make_user, shelf):
    client = make_user()
    for key in ("a", "b"):
        assert http.post(f"/api/library-items/reels/{key}/watched", headers=_bearer(client)).status_code == 204
    assert _feed(http, client) == ["c", "d", "a", "b"]

    newest_first = ["a", "b", "c", "d"]
    assert _feed(http) == newest_first
    assert _feed(http, make_user()) == newest_first
    assert _feed(http, make_user(role=Role.SUPERADMIN)) == newest_first
    assert _feed(http, make_user(role=Role.ADMIN)) == newest_first
    assert _feed(http, make_user(role=Role.PSYCHIC)) == newest_first
    # A token that is no longer good reads as signed out, as before: no 401.
    stale = http.get("/api/library-items/reels", headers={"Authorization": "Bearer not-a-token"})
    assert stale.status_code == 200
    assert [reel["key"] for reel in stale.json()] == newest_first

    # The public reels page lists them newest first, whoever asks.
    for headers in ({}, _bearer(client)):
        page = http.get("/reels/", headers=headers)
        assert page.status_code == 200
        keys = list(dict.fromkeys(re.findall(r'href="/reels/([^/"]+)/"', page.text)))
        assert keys == newest_first


def test_recording_is_for_signed_in_clients_and_published_reels_only(db, http, make_user, shelf):
    signed_out = http.post("/api/library-items/reels/a/watched")
    assert signed_out.status_code == 401

    for role in (Role.PSYCHIC, Role.ADMIN, Role.SUPERADMIN):
        refused = http.post("/api/library-items/reels/a/watched", headers=_bearer(make_user(role=role)))
        assert refused.status_code == 403

    client = make_user()
    for key in ("nothing", "hidden", "future", "tone"):
        missing = http.post(f"/api/library-items/reels/{key}/watched", headers=_bearer(client))
        assert missing.status_code == 404
        assert missing.json() == {"detail": "Reel not found."}

    assert db.query(ReelWatch).count() == 0


def test_reel_watches_migration_creates_and_drops_the_table(monkeypatch):
    versions = Path(__file__).parents[1] / "alembic" / "versions"

    def load(name):
        spec = spec_from_file_location(name, versions / f"{name}.py")
        module = module_from_spec(spec)
        spec.loader.exec_module(module)
        return module

    base = load("e2f3a4b5c6d7_add_library_items")
    watches = load("ff5f7d74d8a9_add_reel_watches")
    assert watches.down_revision == "eb861e419d14"

    engine = create_engine("sqlite://")
    with engine.begin() as connection:
        operations = Operations(MigrationContext.configure(connection))
        monkeypatch.setattr(base, "op", operations)
        monkeypatch.setattr(watches, "op", operations)
        base.upgrade()
        connection.execute(text("CREATE TABLE users (id INTEGER PRIMARY KEY)"))
        connection.execute(text("INSERT INTO users (id) VALUES (7)"))
        connection.execute(
            text(
                "INSERT INTO library_items (key, type, title, audio_file_path, audio_content_type, "
                "audio_size_bytes, audio_sha256, duration_seconds) "
                "VALUES ('tone', 'meditation', 'Tone', 'library/audio/t.mp3', 'audio/mpeg', 10, :sha, 6)"
            ),
            {"sha": "a" * 64},
        )

        watches.upgrade()
        table = inspect(connection)
        assert {c["name"] for c in table.get_columns("reel_watches")} == {
            "user_id",
            "library_item_id",
            "watched_at",
            "created_at",
            "updated_at",
        }
        assert table.get_pk_constraint("reel_watches")["constrained_columns"] == ["user_id", "library_item_id"]
        assert {fk["referred_table"] for fk in table.get_foreign_keys("reel_watches")} == {"users", "library_items"}
        assert [ix["name"] for ix in table.get_indexes("reel_watches")] == ["ix_reel_watches_library_item_id"]

        # One row per client and reel.
        insert = text(
            "INSERT INTO reel_watches (user_id, library_item_id, watched_at) "
            "VALUES (7, (SELECT id FROM library_items), CURRENT_TIMESTAMP)"
        )
        connection.execute(insert)
        with pytest.raises(IntegrityError):
            with connection.begin_nested():
                connection.execute(insert)

        watches.downgrade()
        assert "reel_watches" not in inspect(connection).get_table_names()
        assert connection.execute(text("SELECT key FROM library_items")).scalars().all() == ["tone"]
        watches.upgrade()
        assert "reel_watches" in inspect(connection).get_table_names()
    engine.dispose()
