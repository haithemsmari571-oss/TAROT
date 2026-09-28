"""ROUND36 security fixes — each test fails on the pre-fix code and passes after.

Covered:
- POST /api/profile/me/picture: a non-image (HTML/SVG) is refused, and a real
  image is stored with an extension derived from the decoded format, never the
  client filename (stored-XSS fix).
- GET /api/media/uploads/{f}: X-Content-Type-Options: nosniff always, and a
  browser-executable file (.html/.svg) is served as an attachment octet-stream,
  while an image stays inline (defence in depth for already-stored files).
- get_current_user and both websocket authenticators reject a refresh token
  used as a bearer (token-type check), and the sockets reject a suspended /
  self-deleted account.
- Email template variables (e.g. a crafted username) are HTML-escaped.
"""

import asyncio
from io import BytesIO

import jwt
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from PIL import Image

from app.database.client import get_db
from app.dependencies.get_current_user import get_current_user
from app.enums.user_status import UserStatus
from app.routers import medias as medias_module
from app.routers import profile as profile_module
from app.routers.chats import authenticate_websocket_user as chat_socket_auth
from app.routers.notifications import (
    authenticate_websocket_user as notification_socket_auth,
)
from app.services.email import _fill_body_variables
from app.utils.security import create_access_token, create_refresh_token


def _png_bytes() -> bytes:
    buf = BytesIO()
    Image.new("RGB", (4, 4), (10, 20, 30)).save(buf, format="PNG")
    return buf.getvalue()


def _multipart(name: str, content: bytes, content_type: str):
    return {"file": (name, content, content_type)}


# ── profile picture upload ────────────────────────────────────────────────────
def _profile_client(db, user, tmp_path, monkeypatch):
    monkeypatch.setattr(profile_module.settings, "MEDIA_DIR", tmp_path)
    app = FastAPI()
    app.include_router(profile_module.router, prefix="/api/profile")
    app.dependency_overrides[get_db] = lambda: db
    app.dependency_overrides[get_current_user] = lambda: user
    return TestClient(app, raise_server_exceptions=False)


def test_profile_picture_rejects_html_disguised_as_image(db, make_user, tmp_path, monkeypatch):
    user = make_user()
    http = _profile_client(db, user, tmp_path, monkeypatch)
    html_file = b"<!doctype html><script>alert(1)</script>"
    resp = http.post("/api/profile/me/picture", files=_multipart("x.png", html_file, "image/png"))
    assert resp.status_code == 400
    # Nothing was written to the media dir.
    assert list(tmp_path.glob("*")) == []


def test_profile_picture_rejects_svg(db, make_user, tmp_path, monkeypatch):
    user = make_user()
    http = _profile_client(db, user, tmp_path, monkeypatch)
    svg = b"<svg xmlns='http://www.w3.org/2000/svg'><script>alert(1)</script></svg>"
    resp = http.post("/api/profile/me/picture", files=_multipart("x.png", svg, "image/png"))
    assert resp.status_code == 400
    assert list(tmp_path.glob("*")) == []


def test_profile_picture_extension_comes_from_the_decoded_image_not_the_filename(
    db, make_user, tmp_path, monkeypatch
):
    user = make_user()
    http = _profile_client(db, user, tmp_path, monkeypatch)
    # A real PNG whose filename claims to be .html must be stored as .png.
    resp = http.post("/api/profile/me/picture", files=_multipart("evil.html", _png_bytes(), "image/png"))
    assert resp.status_code == 200
    written = list(tmp_path.glob("*"))
    assert len(written) == 1
    assert written[0].suffix == ".png"
    assert not written[0].name.endswith(".html")


# ── media serving hardening ────────────────────────────────────────────────────
def _media_client(tmp_path, monkeypatch):
    monkeypatch.setattr(medias_module, "MEDIA_DIR", tmp_path)
    app = FastAPI()
    app.include_router(medias_module.router, prefix="/api/media")
    return TestClient(app, raise_server_exceptions=False)


def test_media_serves_html_as_an_attachment_not_inline(tmp_path, monkeypatch):
    http = _media_client(tmp_path, monkeypatch)
    (tmp_path / "legacy.html").write_bytes(b"<script>alert(1)</script>")
    resp = http.get("/api/media/uploads/legacy.html")
    assert resp.status_code == 200
    assert resp.headers.get("x-content-type-options") == "nosniff"
    assert resp.headers.get("content-type", "").startswith("application/octet-stream")
    assert "attachment" in resp.headers.get("content-disposition", "")


def test_media_serves_svg_as_an_attachment_not_inline(tmp_path, monkeypatch):
    http = _media_client(tmp_path, monkeypatch)
    (tmp_path / "legacy.svg").write_bytes(b"<svg xmlns='http://www.w3.org/2000/svg'></svg>")
    resp = http.get("/api/media/uploads/legacy.svg")
    assert resp.status_code == 200
    assert resp.headers.get("content-type", "").startswith("application/octet-stream")
    assert "attachment" in resp.headers.get("content-disposition", "")


def test_media_still_serves_a_png_inline_with_nosniff(tmp_path, monkeypatch):
    http = _media_client(tmp_path, monkeypatch)
    (tmp_path / "pic.png").write_bytes(_png_bytes())
    resp = http.get("/api/media/uploads/pic.png")
    assert resp.status_code == 200
    assert resp.headers.get("x-content-type-options") == "nosniff"
    assert resp.headers.get("content-type", "").startswith("image/png")
    assert "inline" in resp.headers.get("content-disposition", "")


# ── refresh token must not act as an access token ──────────────────────────────
def _profile_me_client(db):
    app = FastAPI()
    app.include_router(profile_module.router, prefix="/api/profile")
    app.dependency_overrides[get_db] = lambda: db
    return TestClient(app, raise_server_exceptions=False)


def test_access_token_reaches_profile_me_but_refresh_token_does_not(db, make_user):
    user = make_user()
    http = _profile_me_client(db)
    access = create_access_token({"sub": str(user.id), "role": user.role.value})
    refresh = create_refresh_token({"sub": str(user.id), "role": user.role.value})
    ok = http.get("/api/profile/me", headers={"Authorization": f"Bearer {access}"})
    assert ok.status_code == 200
    denied = http.get("/api/profile/me", headers={"Authorization": f"Bearer {refresh}"})
    assert denied.status_code == 401


# ── websocket authenticators ───────────────────────────────────────────────────
@pytest.mark.parametrize("authenticate", [chat_socket_auth, notification_socket_auth])
def test_socket_rejects_a_refresh_token(db, make_user, authenticate):
    user = make_user()
    refresh = create_refresh_token({"sub": str(user.id), "role": user.role.value})
    with pytest.raises(jwt.InvalidTokenError):
        asyncio.run(authenticate(refresh, db))


@pytest.mark.parametrize("authenticate", [chat_socket_auth, notification_socket_auth])
def test_socket_rejects_a_suspended_account(db, make_user, authenticate):
    user = make_user()
    user.status = UserStatus.SUSPENDED
    db.commit()
    access = create_access_token({"sub": str(user.id), "role": user.role.value})
    with pytest.raises(ValueError):
        asyncio.run(authenticate(access, db))


@pytest.mark.parametrize("authenticate", [chat_socket_auth, notification_socket_auth])
def test_socket_still_accepts_a_normal_access_token(db, make_user, authenticate):
    user = make_user()
    access = create_access_token({"sub": str(user.id), "role": user.role.value})
    signed_in = asyncio.run(authenticate(access, db))
    assert signed_in.id == user.id


# ── email variable escaping ────────────────────────────────────────────────────
def test_email_variables_are_html_escaped():
    filled = _fill_body_variables(
        "Hi {{username}}, click {{link}}",
        {"username": "<script>alert(1)</script>", "link": "https://x/y?a=1&b=2"},
    )
    assert "<script>" not in filled
    assert "&lt;script&gt;" in filled
    # a normal URL stays usable in an href (only & is entity-encoded)
    assert "a=1&amp;b=2" in filled
