"""Readers from the owner's phone (ROUND54): GET, POST and PATCH
/api/admin/readers under real auth, beside the public psychics router, on the
in-memory database. A new reader is made by the shared create_psychic, gets the
site's reset email (send_email recorded) and never a password on the phone;
ethnicity reaches every client-facing answer whenever it is filled in (ROUND55)."""

import json
from io import BytesIO

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from PIL import Image

from app.database.client import get_db
from app.enums.role import Role
from app.models import User
from app.models.auth_link_token import RESET_PASSWORD_PURPOSE, AuthLinkToken
from app.models.category import Category
from app.routers import owner_readers as owner_readers_router
from app.routers import psychics as psychics_router
from app.schemas.owner_readers import DEFAULT_LANGUAGES, DEFAULT_PRICE_PER_MESSAGE
from app.services import auth as auth_service
from app.services import medias
from app.utils.security import create_access_token

READERS = "/api/admin/readers"


def _picture(fmt: str = "PNG", size=(40, 40)) -> bytes:
    output = BytesIO()
    Image.new("RGB", size, (74, 44, 90)).save(output, format=fmt)
    return output.getvalue()


def _bearer(user):
    return {"Authorization": f"Bearer {create_access_token({'sub': str(user.id)})}"}


@pytest.fixture
def owner(db, make_user, monkeypatch, tmp_path):
    media_dir = tmp_path / "media" / "uploads"
    media_dir.mkdir(parents=True)
    monkeypatch.setattr(medias, "MEDIA_DIR", media_dir)
    sent = []

    async def _send_email(recepientEmail, template_key, vars, subject=None):
        sent.append({"to": [r.email for r in recepientEmail], "template": template_key, "vars": vars})

    monkeypatch.setattr(auth_service, "send_email", _send_email)
    superadmin = make_user(role=Role.SUPERADMIN)
    tarot, love = Category(title="Tarot"), Category(title="Love and timing")
    db.add_all([tarot, love])
    db.commit()
    app = FastAPI()
    app.include_router(owner_readers_router.router, prefix="/api/admin")
    app.include_router(psychics_router.router, prefix="/api/psychic")
    app.dependency_overrides[get_db] = lambda: db
    http = TestClient(app, raise_server_exceptions=False)

    class Owner:
        pass

    o = Owner()
    o.db, o.http, o.sent, o.media_dir, o.make_user = db, http, sent, media_dir, make_user
    o.superadmin, o.tarot, o.love = superadmin, tarot, love
    o.headers = _bearer(superadmin)

    def create(fields, photo=None, headers=None):
        return http.post(
            READERS,
            data={"reader": json.dumps(fields)},
            files={"photo": ("IMG_0001.png", photo if photo is not None else _picture(), "image/png")},
            headers=o.headers if headers is None else headers,
        )

    def patch(reader_id, fields=None, photo=None, headers=None):
        return http.patch(
            f"{READERS}/{reader_id}",
            data={"reader": json.dumps(fields)} if fields is not None else None,
            files={"photo": ("new.jpg", photo, "image/jpeg")} if photo is not None else None,
            headers=o.headers if headers is None else headers,
        )

    o.create, o.patch = create, patch
    return o


FULL = {
    "name": "Celeste",
    "email": "Celeste@Readers.example",
    "bio": "Tarot and timing.\nTwenty years at the cards.",
    "price_per_message": 3,
    "ethnicity": "British Indian",
    "years_experience": 20,
    "zodiac_sign": "Scorpio",
    "languages": ["English", "French", "Hindi"],
}


def test_every_route_refuses_anyone_but_the_owner(owner):
    reader = owner.create({**FULL, "categories_ids": [owner.tarot.id]}).json()
    readers_before = owner.db.query(User).filter(User.role == Role.PSYCHIC).count()
    calls = [
        lambda h: owner.http.get(READERS, headers=h),
        lambda h: owner.create({**FULL, "name": "Other", "email": "other@readers.example"}, headers=h),
        lambda h: owner.patch(reader["id"], {"is_listed": False}, headers=h),
    ]
    for call in calls:
        assert call({}).status_code == 401
        for role in (Role.USER, Role.PSYCHIC, Role.ADMIN):
            assert call(_bearer(owner.make_user(role=role))).status_code == 403
    owner.db.expire_all()
    assert owner.db.query(User).filter(User.role == Role.PSYCHIC).count() == readers_before + 3
    assert owner.db.query(User).filter(User.username == "Other").count() == 0
    assert owner.db.get(User, reader["id"]).is_listed is True


def test_create_makes_a_reader_through_the_shared_path_and_sends_the_reset_email(owner):
    response = owner.create({**FULL, "categories_ids": [owner.tarot.id, owner.love.id]})
    assert response.status_code == 201, response.text
    body = response.json()
    assert "password" not in json.dumps(body).lower().replace("password_email_sent", "")
    assert body["password_email_sent"] is True
    assert body["name"] == "Celeste" and body["email"] == "celeste@readers.example"
    assert body["bio"] == FULL["bio"]
    assert body["price_per_message"] == 3
    assert [c["title"] for c in body["categories"]] == ["Tarot", "Love and timing"]
    assert body["ethnicity"] == "British Indian" and "show_ethnicity" not in body
    assert (body["years_experience"], body["zodiac_sign"]) == (20, "Scorpio")
    assert body["languages"] == ["English", "French", "Hindi"]
    assert body["is_listed"] is True

    reader = owner.db.get(User, body["id"])
    assert reader.role == Role.PSYCHIC and reader.is_verified is True
    assert reader.show_ethnicity is True
    assert reader.password_hash and reader.password_hash != "hash"
    # Stored where reader pictures are, under our own name and the real format.
    saved = list(owner.media_dir.iterdir())
    assert len(saved) == 1 and saved[0].name.endswith("_reader.png")
    assert reader.profile_picture_path == str(saved[0])
    assert body["picture_url"].endswith(saved[0].name)

    assert [(mail["to"], mail["template"]) for mail in owner.sent] == [(["celeste@readers.example"], "forgot_password")]
    assert owner.sent[0]["vars"]["username"] == "Celeste"
    links = owner.db.query(AuthLinkToken).filter(AuthLinkToken.user_id == reader.id).all()
    assert [link.purpose for link in links] == [RESET_PASSWORD_PURPOSE]


def test_a_new_reader_starts_at_the_defaults(owner):
    response = owner.create({"name": "Maren", "email": "maren@readers.example"})
    assert response.status_code == 201, response.text
    body = response.json()
    assert body["price_per_message"] == DEFAULT_PRICE_PER_MESSAGE
    assert body["languages"] == list(DEFAULT_LANGUAGES)
    assert body["ethnicity"] is None and body["years_experience"] is None and body["zodiac_sign"] is None
    listed = owner.http.get(READERS, headers=owner.headers).json()
    assert listed["defaults"] == {"price_per_message": DEFAULT_PRICE_PER_MESSAGE, "languages": list(DEFAULT_LANGUAGES)}
    assert listed["limits"] == {"ethnicity_max_length": 60, "years_experience_max": 60, "language_name_max_length": 40}


def test_ethnicity_reaches_clients_whenever_it_is_filled_in(owner):
    reader_id = owner.create(FULL).json()["id"]

    def public():
        one = owner.http.get(f"/api/psychic/{reader_id}").json()
        roster = owner.http.get("/api/psychic/").json()["items"]
        listed = next(item for item in roster if item["id"] == reader_id)
        return one["ethnicity"], listed["ethnicity"]

    assert public() == ("British Indian", "British Indian")
    one = owner.http.get(f"/api/psychic/{reader_id}").json()
    assert (one["zodiac_sign"], one["years_experience"], one["languages"]) == ("Scorpio", 20, ["English", "French", "Hindi"])
    assert "show_ethnicity" not in one
    owned = owner.http.get(READERS, headers=owner.headers).json()["items"][0]
    assert owned["ethnicity"] == "British Indian" and "show_ethnicity" not in owned

    # The kept column is read nowhere: a reader stored with it off (ROUND54's
    # unticked box) shows her ethnicity, and an old phone sending it changes nothing.
    reader = owner.db.get(User, reader_id)
    reader.show_ethnicity = False
    owner.db.commit()
    assert public() == ("British Indian", "British Indian")
    assert owner.patch(reader_id, {"show_ethnicity": False}).status_code == 200
    assert public() == ("British Indian", "British Indian")
    owner.db.expire_all()
    assert owner.db.get(User, reader_id).show_ethnicity is True

    assert owner.patch(reader_id, {"ethnicity": None}).json()["ethnicity"] is None
    assert public() == (None, None)
    assert owner.patch(reader_id, {"ethnicity": "Irish"}).status_code == 200
    assert public() == ("Irish", "Irish")


def test_an_edit_changes_only_what_is_sent_and_keeps_a_long_bio(owner):
    reader = owner.make_user(role=Role.PSYCHIC)
    long_bio = "word " * 120
    reader.bio, reader.price_per_message = long_bio, 2.5
    owner.db.commit()
    response = owner.patch(reader.id, {"zodiac_sign": "Leo", "years_experience": 0})
    assert response.status_code == 200, response.text
    owner.db.refresh(reader)
    assert reader.bio == long_bio and reader.price_per_message == 2.5
    assert (reader.zodiac_sign, reader.years_experience) == ("Leo", 0)
    assert reader.ethnicity is None and reader.languages is None
    response = owner.patch(reader.id, {
        "name": "Delphine Moon",
        "bio": "Short now.",
        "price_per_message": 4.5,
        "categories_ids": [owner.love.id],
        "languages": [" french ", "French", "", "Arabic"],
    })
    assert response.status_code == 200, response.text
    body = response.json()
    assert (body["name"], body["bio"], body["price_per_message"]) == ("Delphine Moon", "Short now.", 4.5)
    assert [c["id"] for c in body["categories"]] == [owner.love.id]
    assert body["languages"] == ["french", "Arabic"]


def test_hide_and_show_move_her_off_and_back_onto_the_roster(owner):
    reader_id = owner.create(FULL).json()["id"]

    def on_roster():
        return reader_id in [item["id"] for item in owner.http.get("/api/psychic/").json()["items"]]

    assert on_roster()
    assert owner.patch(reader_id, {"is_listed": False}).json()["is_listed"] is False
    assert not on_roster()
    assert [item["is_listed"] for item in owner.http.get(READERS, headers=owner.headers).json()["items"]] == [False]
    assert owner.patch(reader_id, {"is_listed": True}).json()["is_listed"] is True
    assert on_roster()


def test_a_new_photo_replaces_the_old_file(owner):
    reader_id = owner.create(FULL).json()["id"]
    (old,) = list(owner.media_dir.iterdir())
    response = owner.patch(reader_id, photo=_picture("JPEG"))
    assert response.status_code == 200, response.text
    (new,) = list(owner.media_dir.iterdir())
    assert new != old and new.name.endswith("_reader.jpg")


def test_refusals_change_nothing(owner):
    first = owner.create(FULL).json()
    client = owner.make_user()
    nova = {**FULL, "name": "Nova", "email": "nova@readers.example"}
    cases = [
        (owner.create({**FULL, "name": "celeste", "email": "new@readers.example"}), 409, "NAME_TAKEN"),
        (owner.create({**FULL, "name": "Nova", "email": "CELESTE@readers.example"}), 409, "EMAIL_TAKEN"),
        (owner.create({**nova, "categories_ids": [999]}), 422, "UNKNOWN_CATEGORY"),
        (owner.create(nova, photo=b"<html><script>x</script></html>"), 415, "PHOTO_NOT_ACCEPTED"),
        (owner.create(nova, photo=_picture("GIF")), 415, "PHOTO_NOT_ACCEPTED"),
        (owner.create(nova, photo=b"0" * (medias.MAX_PICTURE_BYTES + 1)), 413, "PHOTO_TOO_LARGE"),
        (owner.patch(first["id"] + 999, {"is_listed": False}), 404, "READER_NOT_FOUND"),
        (owner.patch(client.id, {"is_listed": False}), 404, "READER_NOT_FOUND"),
        # Her own name again is no clash.
        (owner.patch(first["id"], {"name": "Celeste"}), 200, None),
    ]
    for response, status, detail in cases:
        assert response.status_code == status, response.text
        if detail:
            assert response.json()["detail"] == detail
    for fields in (
        {"zodiac_sign": "Ophiuchus"},
        {"years_experience": 61},
        {"years_experience": -1},
        {"ethnicity": "x" * 61},
        {"name": "   "},
        {"name": None},
        {"price_per_message": 0},
        {"price_per_message": None},
        {"languages": ["x" * 41]},
    ):
        assert owner.patch(first["id"], fields).status_code == 422, fields
    assert owner.http.patch(f"{READERS}/{first['id']}", data={"reader": "not json"}, headers=owner.headers).status_code == 422
    assert owner.db.query(User).filter(User.role == Role.PSYCHIC).count() == 1
    assert len(list(owner.media_dir.iterdir())) == 1
    owner.db.expire_all()
    stored = owner.db.get(User, first["id"])
    assert (stored.username, stored.zodiac_sign, stored.years_experience) == ("Celeste", "Scorpio", 20)


def test_a_failed_email_still_makes_the_reader_and_says_so(owner, monkeypatch):
    async def _down(**_):
        raise RuntimeError("mail server down")

    monkeypatch.setattr(auth_service, "send_email", _down)
    response = owner.create(FULL)
    assert response.status_code == 201, response.text
    assert response.json()["password_email_sent"] is False
    assert owner.db.get(User, response.json()["id"]) is not None
