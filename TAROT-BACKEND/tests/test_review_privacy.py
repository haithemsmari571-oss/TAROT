"""The review routes carry no personal key.

GET /api/reviews/psychic/{id} and GET /api/reviews/{id} are public, and GET
/api/reviews/my-reviews is the writer's own. They used to encode the Review
object itself, with the writer's or the reader's whole users row loaded onto
it, so email and password_hash reached the JSON. The real reviews router
behind a FastAPI test client on the in-memory database, the harness of
tests/test_profile_picture.py:21-26.
"""

from datetime import date

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.database.client import get_db
from app.dependencies.get_current_user import get_current_user
from app.enums.role import Role
from app.models.review import Review
from app.routers import reviews as reviews_router

FORBIDDEN_KEYS = {"email", "password", "password_hash", "hashed_password", "token", "date_of_birth"}
PUBLIC_KEYS = {"id", "psychic_id", "rating", "comment", "created_at", "username"}


def _client(db, user) -> TestClient:
    app = FastAPI()
    app.include_router(reviews_router.router, prefix="/api/reviews")
    app.dependency_overrides[get_db] = lambda: db
    app.dependency_overrides[get_current_user] = lambda: user
    return TestClient(app, raise_server_exceptions=False)


def _keys(value) -> set:
    """Every key anywhere in a JSON value, however deep."""
    if isinstance(value, list):
        return set().union(*(_keys(item) for item in value))
    if isinstance(value, dict):
        return set(value).union(*(_keys(item) for item in value.values()))
    return set()


def _review(db, make_user):
    writer = make_user()
    writer.username = "sophie"
    writer.date_of_birth = date(1990, 1, 1)
    reader = make_user(role=Role.PSYCHIC)
    reader.username = "Amrit"
    reader.date_of_birth = date(1980, 1, 1)
    review = Review(user_id=writer.id, psychic_id=reader.id, rating=5, comment="Kind and clear.")
    db.add(review)
    db.commit()
    return writer, reader, review


def test_public_review_list_carries_no_personal_key(db, make_user):
    writer, reader, review = _review(db, make_user)

    response = _client(db, None).get(f"/api/reviews/psychic/{reader.id}")

    assert response.status_code == 200, response.text
    body = response.json()
    assert not _keys(body) & FORBIDDEN_KEYS
    assert [set(item) for item in body] == [PUBLIC_KEYS]
    assert body[0]["id"] == review.id
    assert body[0]["psychic_id"] == reader.id
    assert body[0]["rating"] == 5
    assert body[0]["comment"] == "Kind and clear."
    assert body[0]["username"] == "S."


def test_my_reviews_carries_no_personal_key(db, make_user):
    writer, reader, review = _review(db, make_user)

    response = _client(db, writer).get("/api/reviews/my-reviews")

    assert response.status_code == 200, response.text
    body = response.json()
    assert not _keys(body) & FORBIDDEN_KEYS
    assert [set(item) for item in body] == [PUBLIC_KEYS | {"psychic_name"}]
    assert body[0]["id"] == review.id
    assert body[0]["username"] == "S."
    assert body[0]["psychic_name"] == "Amrit"


def test_single_review_carries_no_personal_key(db, make_user):
    writer, reader, review = _review(db, make_user)

    response = _client(db, None).get(f"/api/reviews/{review.id}")

    assert response.status_code == 200, response.text
    body = response.json()
    assert not _keys(body) & FORBIDDEN_KEYS
    assert set(body) == PUBLIC_KEYS
    assert body["username"] == "S."
