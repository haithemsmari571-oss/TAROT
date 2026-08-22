from datetime import datetime, timedelta, timezone
from importlib.util import module_from_spec, spec_from_file_location
from io import BytesIO
from pathlib import Path
from types import SimpleNamespace

from alembic.migration import MigrationContext
from alembic.operations import Operations
from fastapi import FastAPI
from fastapi.testclient import TestClient
from PIL import Image
from sqlalchemy import create_engine, inspect

from app.database.client import get_db
from app.dependencies.get_current_user import get_current_user
from app.enums.role import Role
from app.models.library_item import LibraryItem
from app.routers.library_items import admin_router, public_router


def _mp3(frame_count: int = 3) -> bytes:
    # MPEG-1 Layer III, 128 kbps, 44.1 kHz. Consecutive complete frames are
    # enough for the production byte sniffer to identify and time the audio.
    header = b"\xff\xfb\x90\x64"
    frame = header + bytes(417 - len(header))
    return frame * frame_count


def _png(colour=(74, 44, 90)) -> bytes:
    output = BytesIO()
    Image.new("RGB", (80, 50), colour).save(output, format="PNG")
    return output.getvalue()


def _client(db, user) -> TestClient:
    app = FastAPI()
    app.include_router(public_router, prefix="/api/library-items")
    app.include_router(admin_router, prefix="/api/admin/library-items")
    app.dependency_overrides[get_db] = lambda: db
    app.dependency_overrides[get_current_user] = lambda: user
    return TestClient(app, raise_server_exceptions=False)


def _create(
    client: TestClient,
    *,
    title: str,
    type_value: str = "meditation",
    enabled: bool = True,
    published_at: datetime | None = None,
    sort_order: int = 0,
):
    files = {"audio_file": (f"{title}.mp3", _mp3(), "audio/mpeg")}
    data = {
        "type": type_value,
        "title": title,
        "enabled": str(enabled).lower(),
        "sort_order": str(sort_order),
    }
    if published_at is not None:
        data["published_at"] = published_at.isoformat()
    return client.post("/api/admin/library-items", data=data, files=files)


def test_admin_create_update_delete_round_trip(db, make_user, tmp_path, monkeypatch):
    monkeypatch.setattr(
        "app.services.library_items.get_app_settings",
        lambda: SimpleNamespace(MEDIA_DIR=tmp_path),
    )
    client = _client(db, make_user(role=Role.ADMIN))
    published = datetime.now(timezone.utc) - timedelta(minutes=5)

    created_response = _create(
        client,
        title="Morning Grounding",
        type_value="guided-practice",
        published_at=published,
    )
    assert created_response.status_code == 201, created_response.text
    created = created_response.json()
    assert created["key"] == "morning-grounding"
    assert created["type"] == "guided-practice"
    assert created["audio_content_type"] == "audio/mpeg"
    assert created["audio_file_path"].startswith("library_audio_")
    assert created["cover_image_path"] is None
    assert created["cover_content_type"] is None
    assert (tmp_path / created["audio_file_path"]).is_file()

    old_audio = tmp_path / created["audio_file_path"]
    updated_response = client.patch(
        f"/api/admin/library-items/{created['id']}",
        data={
            "title": "Morning Grounding Updated",
            "description": "A longer owner-edited description.",
            "sort_order": "7",
        },
        files={
            "audio_file": ("replacement.mp3", _mp3(4), "audio/mpeg"),
            "cover_image": ("replacement.png", _png((12, 90, 75)), "image/png"),
        },
    )
    assert updated_response.status_code == 200, updated_response.text
    updated = updated_response.json()
    assert updated["key"] == created["key"]
    assert updated["title"] == "Morning Grounding Updated"
    assert updated["sort_order"] == 7
    assert updated["original_filename"] == "replacement.mp3"
    assert updated["audio_file_path"] != created["audio_file_path"]
    assert updated["cover_image_path"].startswith("library_cover_")
    assert updated["cover_content_type"] == "image/webp"
    assert not old_audio.exists()

    new_audio = tmp_path / updated["audio_file_path"]
    new_cover = tmp_path / updated["cover_image_path"]
    deleted = client.delete(f"/api/admin/library-items/{created['id']}")
    assert deleted.status_code == 204
    assert db.query(LibraryItem).count() == 0
    assert not new_audio.exists()
    assert not new_cover.exists()


def test_public_routes_exclude_disabled_draft_and_future_items_and_keep_contract_exact(
    db, make_user, tmp_path, monkeypatch
):
    monkeypatch.setattr(
        "app.services.library_items.get_app_settings",
        lambda: SimpleNamespace(MEDIA_DIR=tmp_path),
    )
    client = _client(db, make_user(role=Role.ADMIN))
    now = datetime.now(timezone.utc)
    visible_later = _create(
        client,
        title="Visible Later",
        type_value="open-custom-type",
        published_at=now - timedelta(days=1),
        sort_order=9,
    ).json()
    visible_first = _create(
        client,
        title="Visible First",
        published_at=now - timedelta(minutes=1),
        sort_order=1,
    ).json()
    disabled = _create(
        client,
        title="Disabled",
        enabled=False,
        published_at=now - timedelta(days=1),
    ).json()
    draft = _create(client, title="Draft").json()
    future = _create(
        client,
        title="Future",
        published_at=now + timedelta(days=1),
    ).json()

    response = client.get("/api/library-items")
    assert response.status_code == 200
    items = response.json()
    assert [item["key"] for item in items] == [visible_first["key"], visible_later["key"]]
    assert set(items[0]) == {
        "key",
        "type",
        "title",
        "description",
        "audio_url",
        "cover_url",
        "duration_seconds",
        "published_at",
    }
    assert "file_path" not in response.text
    assert "sha256" not in response.text

    assert client.get(f"/api/library-items/{visible_first['key']}").status_code == 200
    for hidden in (disabled, draft, future):
        assert client.get(f"/api/library-items/{hidden['key']}").status_code == 404


def test_wrong_type_and_oversized_audio_are_rejected(db, make_user, tmp_path, monkeypatch):
    monkeypatch.setattr(
        "app.services.library_items.get_app_settings",
        lambda: SimpleNamespace(MEDIA_DIR=tmp_path),
    )
    client = _client(db, make_user(role=Role.ADMIN))
    wrong = client.post(
        "/api/admin/library-items",
        data={"type": "podcast", "title": "Not audio"},
        files={"audio_file": ("fake.mp3", b"not an mp3", "audio/mpeg")},
    )
    assert wrong.status_code == 415

    monkeypatch.setattr("app.routers.library_items.MAX_LIBRARY_AUDIO_BYTES", 32)
    monkeypatch.setattr("app.services.library_items.MAX_LIBRARY_AUDIO_BYTES", 32)
    oversized = client.post(
        "/api/admin/library-items",
        data={"type": "podcast", "title": "Too large"},
        files={"audio_file": ("large.mp3", bytes(33), "audio/mpeg")},
    )
    assert oversized.status_code == 413


def test_wrong_type_and_oversized_cover_are_rejected(db, make_user, tmp_path, monkeypatch):
    monkeypatch.setattr(
        "app.services.library_items.get_app_settings",
        lambda: SimpleNamespace(MEDIA_DIR=tmp_path),
    )
    client = _client(db, make_user(role=Role.ADMIN))
    item = _create(client, title="Cover validation item").json()

    rejected_mime = client.patch(
        f"/api/admin/library-items/{item['id']}",
        files={"cover_image": ("cover.txt", _png(), "text/plain")},
    )
    assert rejected_mime.status_code == 415
    rejected_bytes = client.patch(
        f"/api/admin/library-items/{item['id']}",
        files={"cover_image": ("cover.png", b"not a png", "image/png")},
    )
    assert rejected_bytes.status_code == 415

    monkeypatch.setattr("app.routers.library_items.MAX_LIBRARY_COVER_BYTES", 32)
    monkeypatch.setattr("app.services.library_items.MAX_LIBRARY_COVER_BYTES", 32)
    oversized = client.patch(
        f"/api/admin/library-items/{item['id']}",
        files={"cover_image": ("cover.png", _png(), "image/png")},
    )
    assert oversized.status_code == 413


def test_key_is_immutable_after_creation(db, make_user, tmp_path, monkeypatch):
    monkeypatch.setattr(
        "app.services.library_items.get_app_settings",
        lambda: SimpleNamespace(MEDIA_DIR=tmp_path),
    )
    client = _client(db, make_user(role=Role.ADMIN))
    created = _create(client, title="Stable Address").json()
    response = client.patch(
        f"/api/admin/library-items/{created['id']}",
        data={"key": "changed-address", "title": "A new title"},
    )
    assert response.status_code == 400
    db.expire_all()
    assert db.get(LibraryItem, created["id"]).key == "stable-address"


def test_admin_routes_use_manage_settings_permission(db, make_user):
    assert _client(db, make_user(role=Role.ADMIN)).get("/api/admin/library-items").status_code == 200
    assert _client(db, make_user(role=Role.SUPERADMIN)).get("/api/admin/library-items").status_code == 200
    assert _client(db, make_user(role=Role.USER)).get("/api/admin/library-items").status_code == 403
    assert _client(db, make_user(role=Role.PSYCHIC)).get("/api/admin/library-items").status_code == 403


def test_library_items_migration_upgrades_downgrades_and_reupgrades_cleanly(monkeypatch):
    migration_path = (
        Path(__file__).parents[1]
        / "alembic"
        / "versions"
        / "e2f3a4b5c6d7_add_library_items.py"
    )
    spec = spec_from_file_location("library_items_migration", migration_path)
    migration = module_from_spec(spec)
    spec.loader.exec_module(migration)
    assert migration.down_revision == "d1e2f3a4b5c6"

    engine = create_engine("sqlite://")
    with engine.begin() as connection:
        operations = Operations(MigrationContext.configure(connection))
        monkeypatch.setattr(migration, "op", operations)

        migration.upgrade()
        columns = {column["name"] for column in inspect(connection).get_columns("library_items")}
        assert columns == {
            "id",
            "key",
            "type",
            "title",
            "description",
            "audio_file_path",
            "audio_content_type",
            "audio_size_bytes",
            "audio_sha256",
            "duration_seconds",
            "cover_image_path",
            "cover_content_type",
            "cover_size_bytes",
            "sort_order",
            "enabled",
            "published_at",
            "original_filename",
            "created_at",
            "updated_at",
        }

        migration.downgrade()
        assert "library_items" not in inspect(connection).get_table_names()
        migration.upgrade()
        assert "library_items" in inspect(connection).get_table_names()
    engine.dispose()
