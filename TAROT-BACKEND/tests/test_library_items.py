import base64
from datetime import datetime, timedelta, timezone
import hashlib
from importlib.util import module_from_spec, spec_from_file_location
from io import BytesIO
from pathlib import Path

from alembic.migration import MigrationContext
from alembic.operations import Operations
from botocore.exceptions import ConnectTimeoutError, EndpointConnectionError, ReadTimeoutError
from fastapi import FastAPI
from fastapi.testclient import TestClient
from PIL import Image
import pytest
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.exc import IntegrityError

from app.database.client import get_db
from app.dependencies.get_current_user import get_current_user
from app.enums.role import Role
from app.models.library_item import LibraryItem
from app.routers.library_items import admin_router, public_router
from app.schemas.library_item import MAX_LIBRARY_AUDIO_SIZE_BYTES, MAX_LIBRARY_VIDEO_SIZE_BYTES
from app.services.object_storage import (
    ObjectNotFoundError,
    ObjectStorage,
    StorageUnreachableError,
    StoredObject,
)


def _mp3(frame_count: int = 3) -> bytes:
    header = b"\xff\xfb\x90\x64"
    frame = header + bytes(417 - len(header))
    return frame * frame_count


def _png(colour=(74, 44, 90)) -> bytes:
    output = BytesIO()
    Image.new("RGB", (80, 50), colour).save(output, format="PNG")
    return output.getvalue()


def _audio_claim(
    data: bytes = _mp3(),
    *,
    content_type: str = "audio/mpeg",
    size_bytes: int | None = None,
    original_filename: str = "session.mp3",
) -> dict:
    return {
        "content_type": content_type,
        "size_bytes": len(data) if size_bytes is None else size_bytes,
        "sha256": hashlib.sha256(data).hexdigest(),
        "content_md5": base64.b64encode(hashlib.md5(data).digest()).decode(),
        "duration_seconds": 123.456,
        "original_filename": original_filename,
    }


class FakeStorage:
    def __init__(self) -> None:
        self.objects: dict[str, StoredObject] = {}
        self.presigns: list[dict] = []
        self.cover_puts: list[str] = []
        self.deleted: list[str] = []

    def presign_put(
        self,
        key,
        *,
        content_type,
        content_length,
        content_md5,
        sha256,
        duration_seconds,
        expires_seconds,
    ):
        self.presigns.append(
            {
                "key": key,
                "content_type": content_type,
                "content_length": content_length,
                "content_md5": content_md5,
                "sha256": sha256,
                "duration_seconds": duration_seconds,
                "expires_seconds": expires_seconds,
            }
        )
        return (
            f"https://upload.example.test/{key}?signature=exact",
            {
                "Content-Type": content_type,
                "Content-MD5": content_md5,
                "Cache-Control": "public, max-age=31536000, immutable",
                "If-None-Match": "*",
                "x-amz-meta-sha256": sha256,
                "x-amz-meta-duration-seconds": duration_seconds,
            },
        )

    def complete_direct_upload(self, key: str, claim: dict) -> None:
        self.objects[key] = StoredObject(
            size_bytes=claim["size_bytes"],
            content_type=claim["content_type"],
            etag=base64.b64decode(claim["content_md5"]).hex(),
            metadata={
                "sha256": claim["sha256"],
                "duration-seconds": str(claim["duration_seconds"]),
            },
        )

    def head_object(self, key):
        try:
            return self.objects[key]
        except KeyError as exc:
            raise ObjectNotFoundError(key) from exc

    def put_object(self, key, fileobj, *, content_type):
        data = fileobj.read()
        fileobj.seek(0)
        self.cover_puts.append(key)
        self.objects[key] = StoredObject(
            size_bytes=len(data),
            content_type=content_type,
            etag=hashlib.md5(data).hexdigest(),
            metadata={},
        )

    def delete_object(self, key):
        self.deleted.append(key)
        self.objects.pop(key, None)

    def public_url(self, key):
        return f"https://media.example.test/{key}"


@pytest.fixture
def fake_storage(monkeypatch):
    storage = FakeStorage()
    monkeypatch.setattr("app.services.library_items.get_object_storage", lambda: storage)
    return storage


def _client(db, user) -> TestClient:
    app = FastAPI()
    app.include_router(public_router, prefix="/api/library-items")
    app.include_router(admin_router, prefix="/api/admin/library-items")
    app.dependency_overrides[get_db] = lambda: db
    app.dependency_overrides[get_current_user] = lambda: user
    return TestClient(app, raise_server_exceptions=False)


def _grant_and_complete(client: TestClient, storage: FakeStorage, claim: dict) -> dict:
    response = client.post("/api/admin/library-items/audio-upload-url", json=claim)
    assert response.status_code == 200, response.text
    grant = response.json()
    storage.complete_direct_upload(grant["object_key"], claim)
    return {
        "audio_key": grant["object_key"],
        "audio_content_type": claim["content_type"],
        "audio_size_bytes": str(claim["size_bytes"]),
        "audio_sha256": claim["sha256"],
        "audio_md5": claim["content_md5"],
        "duration_seconds": str(claim["duration_seconds"]),
        "audio_original_filename": claim["original_filename"],
    }


def _create(
    client: TestClient,
    storage: FakeStorage,
    *,
    title: str,
    type_value: str = "meditation",
    enabled: bool = True,
    published_at: datetime | None = None,
    sort_order: int = 0,
):
    data = _grant_and_complete(
        client,
        storage,
        _audio_claim(original_filename=f"{title}.mp3"),
    )
    data.update(
        {
            "type": type_value,
            "title": title,
            "enabled": str(enabled).lower(),
            "sort_order": str(sort_order),
        }
    )
    if published_at is not None:
        data["published_at"] = published_at.isoformat()
    return client.post("/api/admin/library-items", data=data)


def test_presigned_put_is_short_lived_exact_and_first_write_only():
    class RecordingClient:
        def __init__(self):
            self.call = None

        def generate_presigned_url(self, operation, **kwargs):
            self.call = (operation, kwargs)
            return "https://r2.example.test/signed"

    client = RecordingClient()
    storage = ObjectStorage(
        client=client,
        bucket="media",
        public_base_url="https://media.example.test",
    )
    url, headers = storage.presign_put(
        "library/audio/exact.mp3",
        content_type="audio/mpeg",
        content_length=440_000_000,
        content_md5="AAAAAAAAAAAAAAAAAAAAAA==",
        sha256="a" * 64,
        duration_seconds="123.456",
        expires_seconds=900,
    )
    operation, arguments = client.call
    assert url == "https://r2.example.test/signed"
    assert operation == "put_object"
    assert arguments["ExpiresIn"] == 900
    assert arguments["HttpMethod"] == "PUT"
    assert arguments["Params"] == {
        "Bucket": "media",
        "Key": "library/audio/exact.mp3",
        "ContentType": "audio/mpeg",
        "ContentLength": 440_000_000,
        "ContentMD5": "AAAAAAAAAAAAAAAAAAAAAA==",
        "CacheControl": "public, max-age=31536000, immutable",
        "IfNoneMatch": "*",
        "Metadata": {
            "sha256": "a" * 64,
            "duration-seconds": "123.456",
        },
    }
    assert headers["If-None-Match"] == "*"


def test_admin_create_update_delete_round_trip(db, make_user, fake_storage):
    client = _client(db, make_user(role=Role.SUPERADMIN))
    published = datetime.now(timezone.utc) - timedelta(minutes=5)

    created_response = _create(
        client,
        fake_storage,
        title="Morning Grounding",
        type_value="guided-practice",
        published_at=published,
    )
    assert created_response.status_code == 201, created_response.text
    created = created_response.json()
    assert created["key"] == "morning-grounding"
    assert created["audio_file_path"].startswith("library/audio/")
    assert created["audio_file_path"] in fake_storage.objects

    old_audio = created["audio_file_path"]
    replacement = _grant_and_complete(
        client,
        fake_storage,
        _audio_claim(_mp3(4), original_filename="replacement.mp3"),
    )
    replacement.update(
        {
            "title": "Morning Grounding Updated",
            "description": "A longer owner-edited description.",
            "sort_order": "7",
        }
    )
    updated_response = client.patch(
        f"/api/admin/library-items/{created['id']}",
        data=replacement,
        files={"cover_image": ("replacement.png", _png((12, 90, 75)), "image/png")},
    )
    assert updated_response.status_code == 200, updated_response.text
    updated = updated_response.json()
    assert updated["key"] == created["key"]
    assert updated["title"] == "Morning Grounding Updated"
    assert updated["sort_order"] == 7
    assert updated["original_filename"] == "replacement.mp3"
    assert updated["audio_file_path"] != old_audio
    assert updated["cover_image_path"].startswith("library/covers/")
    assert old_audio in fake_storage.deleted

    new_audio = updated["audio_file_path"]
    new_cover = updated["cover_image_path"]
    deleted = client.delete(f"/api/admin/library-items/{created['id']}")
    assert deleted.status_code == 204
    assert db.query(LibraryItem).count() == 0
    assert new_audio in fake_storage.deleted
    assert new_cover in fake_storage.deleted


def test_upload_finalization_requires_the_stored_key_size_type_and_checksum(
    db, make_user, fake_storage
):
    client = _client(db, make_user(role=Role.SUPERADMIN))
    claim = _audio_claim()
    response = client.post("/api/admin/library-items/audio-upload-url", json=claim)
    grant = response.json()
    data = {
        "type": "meditation",
        "title": "Not uploaded yet",
        "audio_key": grant["object_key"],
        "audio_content_type": claim["content_type"],
        "audio_size_bytes": str(claim["size_bytes"]),
        "audio_sha256": claim["sha256"],
        "audio_md5": claim["content_md5"],
        "duration_seconds": str(claim["duration_seconds"]),
    }
    assert client.post("/api/admin/library-items", data=data).status_code == 409

    fake_storage.complete_direct_upload(grant["object_key"], claim)
    fake_storage.objects[grant["object_key"]] = StoredObject(
        size_bytes=claim["size_bytes"] + 1,
        content_type=claim["content_type"],
        etag=base64.b64decode(claim["content_md5"]).hex(),
        metadata={
            "sha256": claim["sha256"],
            "duration-seconds": str(claim["duration_seconds"]),
        },
    )
    assert client.post("/api/admin/library-items", data=data).status_code == 409


def test_public_routes_exclude_hidden_items_and_build_storage_urls(
    db, make_user, fake_storage
):
    client = _client(db, make_user(role=Role.SUPERADMIN))
    now = datetime.now(timezone.utc)
    visible_later = _create(
        client,
        fake_storage,
        title="Visible Later",
        type_value="open-custom-type",
        published_at=now - timedelta(days=1),
        sort_order=9,
    ).json()
    visible_first = _create(
        client,
        fake_storage,
        title="Visible First",
        published_at=now - timedelta(minutes=1),
        sort_order=1,
    ).json()
    disabled = _create(
        client,
        fake_storage,
        title="Disabled",
        enabled=False,
        published_at=now - timedelta(days=1),
    ).json()
    draft = _create(client, fake_storage, title="Draft").json()
    future = _create(
        client,
        fake_storage,
        title="Future",
        published_at=now + timedelta(days=1),
    ).json()

    response = client.get("/api/library-items")
    assert response.status_code == 200
    items = response.json()
    assert [item["key"] for item in items] == [visible_first["key"], visible_later["key"]]
    assert items[0]["audio_url"] == (
        "https://media.example.test/" + visible_first["audio_file_path"]
    )
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


def test_wrong_type_and_absurdly_large_audio_are_rejected_before_signing(
    db, make_user, fake_storage
):
    client = _client(db, make_user(role=Role.SUPERADMIN))
    wrong = client.post(
        "/api/admin/library-items/audio-upload-url",
        json=_audio_claim(content_type="audio/wav"),
    )
    assert wrong.status_code == 415
    oversized = client.post(
        "/api/admin/library-items/audio-upload-url",
        json=_audio_claim(size_bytes=MAX_LIBRARY_AUDIO_SIZE_BYTES + 1),
    )
    assert oversized.status_code == 413
    assert fake_storage.presigns == []


def test_wrong_type_and_oversized_cover_are_rejected(
    db, make_user, fake_storage, monkeypatch
):
    client = _client(db, make_user(role=Role.SUPERADMIN))
    item = _create(client, fake_storage, title="Cover validation item").json()

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


def test_440_mb_audio_never_enters_the_app_process(db, make_user, fake_storage):
    client = _client(db, make_user(role=Role.SUPERADMIN))
    claim = _audio_claim(size_bytes=440 * 1024 * 1024, original_filename="all-night.mp3")
    direct_fields = _grant_and_complete(client, fake_storage, claim)
    direct_fields.update({"type": "sleep", "title": "All Night Beneath the Moon"})

    response = client.post("/api/admin/library-items", data=direct_fields)
    assert response.status_code == 201, response.text
    item = db.get(LibraryItem, response.json()["id"])
    assert item.audio_size_bytes == 440 * 1024 * 1024
    assert fake_storage.cover_puts == []
    assert fake_storage.presigns[-1]["content_length"] == item.audio_size_bytes


def test_key_is_immutable_after_creation(db, make_user, fake_storage):
    client = _client(db, make_user(role=Role.SUPERADMIN))
    created = _create(client, fake_storage, title="Stable Address").json()
    response = client.patch(
        f"/api/admin/library-items/{created['id']}",
        data={"key": "changed-address", "title": "A new title"},
    )
    assert response.status_code == 400
    db.expire_all()
    assert db.get(LibraryItem, created["id"]).key == "stable-address"


def test_admin_routes_use_manage_settings_permission(db, make_user, fake_storage):
    # MANAGE_SETTINGS is superadmin-only: the ADMIN role no longer holds it.
    assert _client(db, make_user(role=Role.ADMIN)).get("/api/admin/library-items").status_code == 403
    assert _client(db, make_user(role=Role.SUPERADMIN)).get("/api/admin/library-items").status_code == 200
    assert _client(db, make_user(role=Role.USER)).get("/api/admin/library-items").status_code == 403
    assert _client(db, make_user(role=Role.PSYCHIC)).get("/api/admin/library-items").status_code == 403
    denied = _client(db, make_user(role=Role.USER)).post(
        "/api/admin/library-items/audio-upload-url",
        json=_audio_claim(),
    )
    assert denied.status_code == 403


def test_admin_role_is_refused_on_every_admin_library_route(db, make_user, fake_storage):
    """ADMIN no longer holds MANAGE_SETTINGS: every admin shelf route answers
    403 before anything is signed, stored or written."""
    client = _client(db, make_user(role=Role.ADMIN))
    denied = "Access denied. Requires permission: manage_settings"
    for method, path, kwargs in (
        ("GET", "/api/admin/library-items", {}),
        ("POST", "/api/admin/library-items/audio-upload-url", {"json": _audio_claim()}),
        ("POST", "/api/admin/library-items", {"data": {"type": "meditation", "title": "Tone"}}),
        ("POST", "/api/admin/library-items/video-upload-url", {"json": _video_claim()}),
        ("POST", "/api/admin/library-items/video", {"data": {"title": "Reel"}}),
        ("PATCH", "/api/admin/library-items/1", {"data": {"title": "Renamed"}}),
        ("DELETE", "/api/admin/library-items/1", {}),
    ):
        response = client.request(method, path, **kwargs)
        assert response.status_code == 403, (method, path, response.text)
        assert response.json()["detail"] == denied
    assert db.query(LibraryItem).count() == 0
    assert fake_storage.presigns == []
    assert fake_storage.cover_puts == []
    assert fake_storage.deleted == []


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


def _video_claim(
    data: bytes = b"\x00\x00\x00\x18ftypmp42" + bytes(64),
    *,
    content_type: str = "video/mp4",
    size_bytes: int | None = None,
    original_filename: str = "reel.mp4",
) -> dict:
    return {
        "content_type": content_type,
        "size_bytes": len(data) if size_bytes is None else size_bytes,
        "sha256": hashlib.sha256(data).hexdigest(),
        "content_md5": base64.b64encode(hashlib.md5(data).digest()).decode(),
        "duration_seconds": 6.0,
        "width": 720,
        "height": 1280,
        "original_filename": original_filename,
    }


def _video_form(grant: dict, claim: dict) -> dict:
    return {
        "video_key": grant["object_key"],
        "video_content_type": claim["content_type"],
        "video_size_bytes": str(claim["size_bytes"]),
        "video_sha256": claim["sha256"],
        "video_md5": claim["content_md5"],
        "duration_seconds": str(claim["duration_seconds"]),
        "video_width": str(claim["width"]),
        "video_height": str(claim["height"]),
        "video_original_filename": claim["original_filename"],
    }


def _create_video(
    client: TestClient,
    storage: FakeStorage,
    *,
    title: str,
    enabled: bool = True,
    published_at: datetime | None = None,
):
    claim = _video_claim(original_filename=f"{title}.mp4")
    response = client.post("/api/admin/library-items/video-upload-url", json=claim)
    assert response.status_code == 200, response.text
    grant = response.json()
    storage.complete_direct_upload(grant["object_key"], claim)
    data = _video_form(grant, claim)
    data.update({"title": title, "enabled": str(enabled).lower()})
    if published_at is not None:
        data["published_at"] = published_at.isoformat()
    return client.post("/api/admin/library-items/video", data=data)


def test_video_upload_url_signs_mp4_and_refuses_other_types_and_oversize(
    db, make_user, fake_storage
):
    client = _client(db, make_user(role=Role.SUPERADMIN))
    granted = client.post("/api/admin/library-items/video-upload-url", json=_video_claim())
    assert granted.status_code == 200, granted.text
    grant = granted.json()
    assert grant["object_key"].startswith("library/video/")
    assert grant["object_key"].endswith(".mp4")
    assert set(grant) == {"object_key", "upload_url", "method", "expires_in_seconds", "headers"}
    assert fake_storage.presigns[-1]["content_type"] == "video/mp4"

    wrong = client.post(
        "/api/admin/library-items/video-upload-url",
        json=_video_claim(content_type="video/quicktime"),
    )
    assert wrong.status_code == 415
    assert wrong.json() == {"detail": "Upload an MP4 video file."}
    at_cap = client.post(
        "/api/admin/library-items/video-upload-url",
        json=_video_claim(size_bytes=MAX_LIBRARY_VIDEO_SIZE_BYTES),
    )
    assert at_cap.status_code == 200
    oversized = client.post(
        "/api/admin/library-items/video-upload-url",
        json=_video_claim(size_bytes=MAX_LIBRARY_VIDEO_SIZE_BYTES + 1),
    )
    assert oversized.status_code == 413
    assert oversized.json() == {"detail": "Library video files must be no larger than 300 MB."}
    assert len(fake_storage.presigns) == 2


def test_video_create_runs_the_verification_gate_before_writing_a_row(
    db, make_user, fake_storage
):
    client = _client(db, make_user(role=Role.SUPERADMIN))
    claim = _video_claim()
    grant = client.post("/api/admin/library-items/video-upload-url", json=claim).json()
    data = _video_form(grant, claim)
    data["title"] = "First reel"

    not_uploaded = client.post("/api/admin/library-items/video", data=data)
    assert not_uploaded.status_code == 409
    assert not_uploaded.json() == {"detail": "The direct video upload has not completed in storage yet."}

    for wrong in (
        {"size_bytes": claim["size_bytes"] + 1},
        {"content_md5": "AAAAAAAAAAAAAAAAAAAAAA=="},
        {"content_type": "video/webm"},
    ):
        fake_storage.complete_direct_upload(grant["object_key"], {**claim, **wrong})
        assert client.post("/api/admin/library-items/video", data=data).status_code == 409
    foreign_key = client.post(
        "/api/admin/library-items/video",
        data={**data, "video_key": "library/audio/" + "a" * 32 + ".mp3"},
    )
    assert foreign_key.status_code == 400
    assert db.query(LibraryItem).count() == 0

    fake_storage.complete_direct_upload(grant["object_key"], claim)
    created = client.post("/api/admin/library-items/video", data=data)
    assert created.status_code == 201, created.text
    body = created.json()
    assert body["type"] == "reel"
    assert body["video_file_path"] == grant["object_key"]
    assert body["video_url"] == "https://media.example.test/" + grant["object_key"]
    assert (body["video_width"], body["video_height"]) == (720, 1280)
    assert body["audio_file_path"] is None and body["audio_url"] is None

    reused = client.post("/api/admin/library-items/video", data={**data, "title": "Again"})
    assert reused.status_code == 409
    assert reused.json() == {"detail": "That direct video upload has already been used."}
    assert db.query(LibraryItem).count() == 1


def test_public_reels_list_newest_first_and_audio_list_excludes_video(
    db, make_user, fake_storage
):
    client = _client(db, make_user(role=Role.SUPERADMIN))
    empty = client.get("/api/library-items/reels")
    assert empty.status_code == 200 and empty.json() == []

    now = datetime.now(timezone.utc)
    older = _create_video(client, fake_storage, title="Older reel", published_at=now - timedelta(days=2)).json()
    newer = _create_video(client, fake_storage, title="Newer reel", published_at=now - timedelta(hours=1)).json()
    _create_video(client, fake_storage, title="Hidden reel", enabled=False, published_at=now - timedelta(days=1))
    _create_video(client, fake_storage, title="Draft reel")
    _create_video(client, fake_storage, title="Future reel", published_at=now + timedelta(days=1))
    audio = _create(client, fake_storage, title="Evening tone", published_at=now - timedelta(days=1)).json()

    reels = client.get("/api/library-items/reels")
    assert reels.status_code == 200
    assert [item["key"] for item in reels.json()] == [newer["key"], older["key"]]
    assert set(reels.json()[0]) == {
        "key",
        "type",
        "title",
        "description",
        "video_url",
        "cover_url",
        "duration_seconds",
        "video_width",
        "video_height",
        "published_at",
    }
    assert reels.json()[0]["video_url"] == "https://media.example.test/" + newer["video_file_path"]

    audio_list = client.get("/api/library-items")
    assert [item["key"] for item in audio_list.json()] == [audio["key"]]
    assert "video" not in audio_list.text

    one_reel = client.get(f"/api/library-items/{newer['key']}")
    assert one_reel.status_code == 200
    assert "video_url" in one_reel.json() and "audio_url" not in one_reel.json()
    one_audio = client.get(f"/api/library-items/{audio['key']}")
    assert "audio_url" in one_audio.json() and "video_url" not in one_audio.json()


def test_video_item_update_keeps_video_columns_and_delete_removes_video(
    db, make_user, fake_storage
):
    client = _client(db, make_user(role=Role.SUPERADMIN))
    created = _create_video(client, fake_storage, title="Editable reel").json()
    updated = client.patch(
        f"/api/admin/library-items/{created['id']}",
        data={"title": "Edited reel", "sort_order": "3", "enabled": "false"},
        files={"cover_image": ("cover.png", _png(), "image/png")},
    )
    assert updated.status_code == 200, updated.text
    body = updated.json()
    assert body["title"] == "Edited reel"
    assert body["cover_image_path"].startswith("library/covers/")
    for field in (
        "video_file_path",
        "video_content_type",
        "video_size_bytes",
        "video_sha256",
        "video_width",
        "video_height",
    ):
        assert body[field] == created[field]

    audio_claim = _audio_claim()
    audio_fields = _grant_and_complete(client, fake_storage, audio_claim)
    refused = client.patch(f"/api/admin/library-items/{created['id']}", data=audio_fields)
    assert refused.status_code == 400
    assert refused.json() == {"detail": "This item is a video. It has no audio to replace."}

    assert client.delete(f"/api/admin/library-items/{created['id']}").status_code == 204
    assert created["video_file_path"] in fake_storage.deleted
    assert body["cover_image_path"] in fake_storage.deleted
    assert None not in fake_storage.deleted


def test_every_item_holds_exactly_one_complete_medium(db):
    audio = {
        "audio_file_path": "library/audio/a.mp3",
        "audio_content_type": "audio/mpeg",
        "audio_size_bytes": 10,
        "audio_sha256": "a" * 64,
    }
    video = {
        "video_file_path": "library/video/v.mp4",
        "video_content_type": "video/mp4",
        "video_size_bytes": 10,
        "video_sha256": "b" * 64,
    }

    def insert(key: str, media: dict) -> None:
        db.add(LibraryItem(key=key, type="reel", title="T", duration_seconds=6, **media))
        db.commit()

    for key, media in (
        ("both", {**audio, **video}),
        ("neither", {}),
        ("video-without-sha", {**video, "video_sha256": None}),
    ):
        with pytest.raises(IntegrityError):
            insert(key, media)
        db.rollback()
    insert("audio", audio)
    insert("video", video)
    assert db.query(LibraryItem).count() == 2


def test_video_migration_is_reversible_and_refuses_to_drop_videos(monkeypatch):
    versions = Path(__file__).parents[1] / "alembic" / "versions"

    def load(name):
        spec = spec_from_file_location(name, versions / f"{name}.py")
        module = module_from_spec(spec)
        spec.loader.exec_module(module)
        return module

    base = load("e2f3a4b5c6d7_add_library_items")
    video = load("f0a1b2c3d4e5_add_library_item_video")
    assert video.down_revision == "d9e0f1a2b3c4"

    engine = create_engine("sqlite://")
    with engine.begin() as connection:
        operations = Operations(MigrationContext.configure(connection))
        monkeypatch.setattr(base, "op", operations)
        monkeypatch.setattr(video, "op", operations)
        base.upgrade()
        connection.execute(
            text(
                "INSERT INTO library_items (key, type, title, audio_file_path, audio_content_type, "
                "audio_size_bytes, audio_sha256, duration_seconds) "
                "VALUES ('tone', 'meditation', 'Tone', 'library/audio/t.mp3', 'audio/mpeg', 10, :sha, 6)"
            ),
            {"sha": "a" * 64},
        )

        video.upgrade()
        columns = {column["name"] for column in inspect(connection).get_columns("library_items")}
        assert {
            "video_file_path",
            "video_content_type",
            "video_size_bytes",
            "video_sha256",
            "video_width",
            "video_height",
        } <= columns
        connection.execute(
            text(
                "INSERT INTO library_items (key, type, title, video_file_path, video_content_type, "
                "video_size_bytes, video_sha256, duration_seconds) "
                "VALUES ('reel', 'reel', 'Reel', 'library/video/r.mp4', 'video/mp4', 10, :sha, 6)"
            ),
            {"sha": "b" * 64},
        )
        with pytest.raises(RuntimeError):
            video.downgrade()

        connection.execute(text("DELETE FROM library_items WHERE key = 'reel'"))
        video.downgrade()
        columns = {column["name"] for column in inspect(connection).get_columns("library_items")}
        assert not any(name.startswith("video_") for name in columns)
        assert connection.execute(text("SELECT key FROM library_items")).scalars().all() == ["tone"]
        video.upgrade()
    engine.dispose()


class _UnreachableClient:
    """A boto client whose endpoint cannot be reached, as botocore reports it."""

    def __init__(self, error) -> None:
        self.error = error

    def head_object(self, **_kwargs):
        raise self.error

    def delete_object(self, **_kwargs):
        raise self.error

    def upload_fileobj(self, *_args, **_kwargs):
        raise self.error


@pytest.mark.parametrize(
    "error",
    [
        EndpointConnectionError(endpoint_url="http://storage.invalid"),
        ConnectTimeoutError(endpoint_url="http://storage.invalid"),
        ReadTimeoutError(endpoint_url="http://storage.invalid"),
    ],
)
def test_unreachable_storage_is_one_error_for_head_put_and_delete(error):
    storage = ObjectStorage(
        client=_UnreachableClient(error),
        bucket="bucket",
        public_base_url="https://media.example.test",
    )
    with pytest.raises(StorageUnreachableError):
        storage.head_object("library/video/x.mp4")
    with pytest.raises(StorageUnreachableError):
        storage.delete_object("library/video/x.mp4")
    with pytest.raises(StorageUnreachableError):
        storage.put_object("library/covers/x.webp", BytesIO(b"x"), content_type="image/webp")


def test_storage_client_fails_fast_when_the_endpoint_is_unreachable():
    from app.config import get_app_settings

    settings = get_app_settings().model_copy(
        update={
            "R2_ENDPOINT": "http://storage.example.test",
            "R2_BUCKET": "bucket",
            "R2_ACCESS_KEY_ID": "id",
            "R2_SECRET_ACCESS_KEY": "secret",
            "R2_PUBLIC_BASE_URL": "https://media.example.test",
        }
    )
    config = ObjectStorage.from_settings(settings)._client.meta.config
    assert config.retries["total_max_attempts"] <= 2
    assert config.connect_timeout <= 1


def test_create_routes_answer_503_and_write_nothing_when_storage_is_unreachable(
    db, make_user, fake_storage
):
    client = _client(db, make_user(role=Role.SUPERADMIN))
    audio_form = _grant_and_complete(client, fake_storage, _audio_claim())
    audio_form.update({"type": "meditation", "title": "Tone"})
    video_claim = _video_claim()
    grant = client.post("/api/admin/library-items/video-upload-url", json=video_claim).json()
    video_form = {**_video_form(grant, video_claim), "title": "Reel"}

    def unreachable(key):
        raise StorageUnreachableError(key)

    fake_storage.head_object = unreachable
    for url, form in (
        ("/api/admin/library-items", audio_form),
        ("/api/admin/library-items/video", video_form),
    ):
        response = client.post(url, data=form)
        assert response.status_code == 503
        assert response.json() == {"detail": "Storage could not be reached. Try again."}
    assert db.query(LibraryItem).count() == 0
