"""A client likes a reel in the Shorts tab to keep it in her Favourites (ROUND71).

POST /api/library-items/reels/{key}/like keeps it, DELETE takes it out, and
GET /api/library-items/reels/liked lists her liked reels that are still on the
shelf, the newest like first. Clients only. Liking does not change the order
of her Shorts feed, and the public reels pages do not change at all.
"""

from datetime import datetime, timedelta, timezone
from importlib.util import module_from_spec, spec_from_file_location
from pathlib import Path

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
from app.models.reel_like import ReelLike
from app.routers.library_items import public_router
from app.routers.public_seo import router as public_seo_router
from app.services.library_items import like_reel
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
        cover_image_path=f"library/covers/{key}.jpg",
        cover_content_type="image/jpeg",
        cover_size_bytes=100,
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


def _liked(http, user):
    response = http.get("/api/library-items/reels/liked", headers=_bearer(user))
    assert response.status_code == 200, response.text
    return [reel["key"] for reel in response.json()]


def _feed(http, user=None):
    response = http.get("/api/library-items/reels", headers=_bearer(user) if user else {})
    assert response.status_code == 200, response.text
    return [reel["key"] for reel in response.json()]


def test_a_client_likes_and_unlikes_reels_and_lists_them_newest_like_first(db, http, make_user, shelf):
    client = make_user()
    assert _liked(http, client) == []

    for key in ("c", "a"):
        liked = http.post(f"/api/library-items/reels/{key}/like", headers=_bearer(client))
        assert liked.status_code == 204, liked.text
        assert liked.content == b""
    assert _liked(http, client) == ["a", "c"]

    # Each comes as the Shorts tab draws it: poster and title included.
    first = http.get("/api/library-items/reels/liked", headers=_bearer(client)).json()[0]
    assert first["title"] == "Reel a"
    assert first["cover_url"] == "https://media.example.test/library/covers/a.jpg"
    assert first["video_url"] == "https://media.example.test/library/video/a.mp4"

    # Liking again keeps her one row and her first like's place.
    assert http.post("/api/library-items/reels/c/like", headers=_bearer(client)).status_code == 204
    assert _liked(http, client) == ["a", "c"]
    assert db.query(ReelLike).filter(ReelLike.user_id == client.id).count() == 2

    unliked = http.delete("/api/library-items/reels/a/like", headers=_bearer(client))
    assert unliked.status_code == 204, unliked.text
    assert _liked(http, client) == ["c"]
    # Unliking what she has not liked, or a key that is not there, is no change.
    for key in ("a", "b", "nothing"):
        assert http.delete(f"/api/library-items/reels/{key}/like", headers=_bearer(client)).status_code == 204
    assert _liked(http, client) == ["c"]

    # Liked again later, it is the newest like.
    assert http.post("/api/library-items/reels/a/like", headers=_bearer(client)).status_code == 204
    assert _liked(http, client) == ["a", "c"]


def test_likes_are_her_own(db, http, make_user, shelf):
    client, other = make_user(), make_user()
    for key in ("a", "b"):
        assert http.post(f"/api/library-items/reels/{key}/like", headers=_bearer(client)).status_code == 204
    assert _liked(http, other) == []
    # Another client unliking touches nothing of hers.
    assert http.delete("/api/library-items/reels/a/like", headers=_bearer(other)).status_code == 204
    assert _liked(http, client) == ["b", "a"]


def test_a_liked_reel_taken_off_the_shelf_leaves_her_list(db, http, make_user, shelf):
    client = make_user()
    start = datetime.now(timezone.utc)
    for minutes, key in enumerate(("a", "b", "c")):
        like_reel(db, user_id=client.id, item=shelf[key], now=start + timedelta(minutes=minutes))
    assert _liked(http, client) == ["c", "b", "a"]

    shelf["b"].enabled = False
    db.commit()
    assert _liked(http, client) == ["c", "a"]

    db.delete(shelf["c"])
    db.commit()
    assert _liked(http, client) == ["a"]


def test_liking_does_not_change_the_order_of_her_feed(db, http, make_user, shelf):
    client = make_user()
    for key in ("a", "b"):
        assert http.post(f"/api/library-items/reels/{key}/watched", headers=_bearer(client)).status_code == 204
    before = _feed(http, client)
    assert before == ["c", "d", "a", "b"]

    for key in ("d", "a"):
        assert http.post(f"/api/library-items/reels/{key}/like", headers=_bearer(client)).status_code == 204
    assert _feed(http, client) == before
    assert _feed(http) == ["a", "b", "c", "d"]


def test_the_public_reels_pages_do_not_change(db, http, make_user, shelf):
    client = make_user()
    pages_before = {path: http.get(path).text for path in ("/reels/", "/reels/a/")}
    for key in ("a", "b"):
        assert http.post(f"/api/library-items/reels/{key}/like", headers=_bearer(client)).status_code == 204
    for headers in ({}, _bearer(client)):
        for path, before in pages_before.items():
            page = http.get(path, headers=headers)
            assert page.status_code == 200
            assert page.text == before


def test_liking_is_for_signed_in_clients_and_published_reels_only(db, http, make_user, shelf):
    calls = (
        ("get", "/api/library-items/reels/liked"),
        ("post", "/api/library-items/reels/a/like"),
        ("delete", "/api/library-items/reels/a/like"),
    )
    for method, path in calls:
        assert getattr(http, method)(path).status_code == 401
        stale = getattr(http, method)(path, headers={"Authorization": "Bearer not-a-token"})
        assert stale.status_code == 401
        for role in (Role.PSYCHIC, Role.ADMIN, Role.SUPERADMIN):
            refused = getattr(http, method)(path, headers=_bearer(make_user(role=role)))
            assert refused.status_code == 403

    client = make_user()
    for key in ("nothing", "hidden", "future", "tone"):
        missing = http.post(f"/api/library-items/reels/{key}/like", headers=_bearer(client))
        assert missing.status_code == 404
        assert missing.json() == {"detail": "Reel not found."}

    assert db.query(ReelLike).count() == 0


def test_the_same_like_cannot_be_kept_twice(db, make_user, shelf):
    client = make_user()
    db.add(ReelLike(user_id=client.id, library_item_id=shelf["a"].id))
    db.commit()
    db.add(ReelLike(user_id=client.id, library_item_id=shelf["a"].id))
    with pytest.raises(IntegrityError):
        db.commit()
    db.rollback()


def test_reel_likes_migration_creates_and_drops_the_table(monkeypatch):
    versions = Path(__file__).parents[1] / "alembic" / "versions"

    def load(name):
        spec = spec_from_file_location(name, versions / f"{name}.py")
        module = module_from_spec(spec)
        spec.loader.exec_module(module)
        return module

    base = load("e2f3a4b5c6d7_add_library_items")
    likes = load("0009ab288b88_add_reel_likes")
    assert likes.down_revision == "ff5f7d74d8a9"

    engine = create_engine("sqlite://")
    with engine.begin() as connection:
        operations = Operations(MigrationContext.configure(connection))
        monkeypatch.setattr(base, "op", operations)
        monkeypatch.setattr(likes, "op", operations)
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

        likes.upgrade()
        table = inspect(connection)
        assert {c["name"] for c in table.get_columns("reel_likes")} == {
            "user_id",
            "library_item_id",
            "created_at",
            "updated_at",
        }
        assert table.get_pk_constraint("reel_likes")["constrained_columns"] == ["user_id", "library_item_id"]
        foreign_keys = table.get_foreign_keys("reel_likes")
        assert {fk["referred_table"] for fk in foreign_keys} == {"users", "library_items"}
        assert {fk["options"].get("ondelete") for fk in foreign_keys} == {"CASCADE"}
        assert [ix["name"] for ix in table.get_indexes("reel_likes")] == ["ix_reel_likes_library_item_id"]

        # One row per client and reel.
        insert = text(
            "INSERT INTO reel_likes (user_id, library_item_id) VALUES (7, (SELECT id FROM library_items))"
        )
        connection.execute(insert)
        with pytest.raises(IntegrityError):
            with connection.begin_nested():
                connection.execute(insert)

        likes.downgrade()
        assert "reel_likes" not in inspect(connection).get_table_names()
        assert connection.execute(text("SELECT key FROM library_items")).scalars().all() == ["tone"]
        likes.upgrade()
        assert "reel_likes" in inspect(connection).get_table_names()
    engine.dispose()
