"""POST /api/profile/me/picture stores the path of the file it saved; PATCH
/api/profile/me can never set that path."""

from io import BytesIO

from fastapi import FastAPI
from fastapi.testclient import TestClient
from PIL import Image

from app.database.client import get_db
from app.dependencies.get_current_user import get_current_user
from app.routers import profile as profile_router


def _png() -> bytes:
    output = BytesIO()
    Image.new("RGB", (40, 40), (74, 44, 90)).save(output, format="PNG")
    return output.getvalue()


def _client(db, user) -> TestClient:
    app = FastAPI()
    app.include_router(profile_router.router, prefix="/api/profile")
    app.dependency_overrides[get_db] = lambda: db
    app.dependency_overrides[get_current_user] = lambda: user
    return TestClient(app, raise_server_exceptions=False)


def test_upload_stores_the_saved_path_and_answers_its_url(db, make_user, monkeypatch, tmp_path):
    media_dir = tmp_path / "media" / "uploads"
    monkeypatch.setattr(profile_router.settings, "MEDIA_DIR", media_dir)
    monkeypatch.setattr(profile_router.settings, "APP_BASE_URL", "http://api.example.test/api")
    user = make_user()
    response = _client(db, user).post(
        "/api/profile/me/picture",
        files={"file": ("sophie.png", _png(), "image/png")},
    )
    assert response.status_code == 200, response.text
    db.refresh(user)
    stored = user.profile_picture_path
    assert stored is not None
    saved = list(media_dir.iterdir())
    assert len(saved) == 1
    assert stored == saved[0].as_posix()
    assert response.json()["profile_picture_path"] == f"http://api.example.test/api/{stored}"


def test_patch_carrying_profile_picture_path_is_ignored(db, make_user):
    user = make_user()
    user.profile_picture_path = "media/uploads/kept.png"
    db.commit()
    response = _client(db, user).patch(
        "/api/profile/me",
        json={"bio": "Hello", "profile_picture_path": "media/uploads/evil.png"},
    )
    assert response.status_code == 200, response.text
    db.refresh(user)
    assert user.bio == "Hello"
    assert user.profile_picture_path == "media/uploads/kept.png"
    assert "profile_picture_path" not in profile_router.UserProfileUpdate.model_fields
