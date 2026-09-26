"""ROUND19's follow-ups: the owner's list of reviews (superadmin only, newest
first, with the reader's name), a review's stars cannot be cleared, and the
admin dashboard's average counts approved reviews only. The real routers
behind a FastAPI test client on the in-memory database, with the harness of
tests/test_review_rules.py.
"""

from datetime import datetime, timedelta, timezone

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.database.client import get_db
from app.dependencies.get_current_user import get_current_user
from app.enums.role import Role
from app.models.review import Review, REVIEW_APPROVED, REVIEW_HIDDEN, REVIEW_PENDING
from app.routers import dashboard as dashboard_router
from tests.test_review_rules import (
    FORBIDDEN_KEYS,
    PUBLIC_KEYS,
    _chat,
    _client,
    _earned,
    _paid,
    _post,
    _reader,
)

OWNER_KEYS = PUBLIC_KEYS | {"user_id", "status", "psychic_name"}
START = datetime(2026, 9, 1, 12, 0, tzinfo=timezone.utc)


def _review(db, make_user, reader, name, status, hours, rating=4):
    """A review by a new client named `name`, written `hours` after START."""
    writer = make_user()
    writer.username = name
    review = Review(
        user_id=writer.id, psychic_id=reader.id, rating=rating, comment=f"{name} wrote this.",
        status=status, created_at=START + timedelta(hours=hours),
    )
    db.add(review)
    db.commit()
    return review


def _owner(db, make_user):
    return _client(db, make_user(role=Role.SUPERADMIN))


@pytest.mark.parametrize("role", [Role.USER, Role.PSYCHIC, Role.ADMIN])
def test_only_a_superadmin_may_list_reviews(db, make_user, role):
    reader = _reader(make_user)
    _review(db, make_user, reader, "sophie", REVIEW_PENDING, 0)
    viewer = _client(db, make_user(role=role))

    for query in ("", "?status=pending"):
        response = viewer.get(f"/api/admin/reviews{query}")
        assert response.status_code == 403, response.text
        assert response.json() == {"detail": "Superadmin access required for this endpoint"}
        assert _client(db, None).get(f"/api/admin/reviews{query}").status_code == 401


def test_the_owner_lists_reviews_newest_first_with_the_readers_name(db, make_user):
    amrit = _reader(make_user, name="Amrit")
    delphine = _reader(make_user, name="Delphine")
    first = _review(db, make_user, amrit, "sophie", REVIEW_PENDING, 0, rating=5)
    second = _review(db, make_user, delphine, "rose", REVIEW_APPROVED, 1)
    third = _review(db, make_user, delphine, "maya", REVIEW_PENDING, 2, rating=2)
    fourth = _review(db, make_user, amrit, "lena", REVIEW_HIDDEN, 3)
    owner = _owner(db, make_user)

    pending = owner.get("/api/admin/reviews?status=pending")
    assert pending.status_code == 200, pending.text
    body = pending.json()
    assert [
        (item["id"], item["status"], item["psychic_name"], item["username"], item["user_id"], item["rating"])
        for item in body
    ] == [
        (third.id, REVIEW_PENDING, "Delphine", "M.", third.user_id, 2),
        (first.id, REVIEW_PENDING, "Amrit", "S.", first.user_id, 5),
    ]
    assert body[0]["comment"] == "maya wrote this."
    for item in body:
        assert set(item) == OWNER_KEYS
        assert not set(item) & FORBIDDEN_KEYS

    def ids(query):
        response = owner.get(f"/api/admin/reviews{query}")
        assert response.status_code == 200, response.text
        return [item["id"] for item in response.json()]

    assert ids("") == [fourth.id, third.id, second.id, first.id]
    assert ids("?status=approved") == [second.id]
    assert ids("?status=hidden") == [fourth.id]
    assert ids("?limit=2") == [fourth.id, third.id]
    assert ids("?skip=2&limit=2") == [second.id, first.id]
    assert ids("?status=pending&skip=1") == [first.id]


def test_the_owner_list_refuses_an_unknown_status_and_an_out_of_range_page(db, make_user):
    from app.routers.reviews import OWNER_LIST_LIMIT

    owner = _owner(db, make_user)
    for query in ("?status=deleted", "?status=", "?skip=-1", "?limit=0", f"?limit={OWNER_LIST_LIMIT + 1}"):
        assert owner.get(f"/api/admin/reviews{query}").status_code == 422, query
    assert owner.get(f"/api/admin/reviews?limit={OWNER_LIST_LIMIT}").status_code == 200


def test_what_the_owner_approves_leaves_the_pending_list(db, make_user):
    reader = _reader(make_user)
    client = _earned(db, make_user, reader)
    assert _post(db, client, reader, rating=4, comment="She saw it at once.").status_code == 200
    owner = _owner(db, make_user)

    waiting = owner.get("/api/admin/reviews?status=pending").json()
    assert [(item["psychic_name"], item["username"], item["rating"]) for item in waiting] == [("Amrit", "S.", 4)]

    assert owner.post(f"/api/admin/reviews/{waiting[0]['id']}/approve").status_code == 200
    assert owner.get("/api/admin/reviews?status=pending").json() == []
    assert [item["id"] for item in owner.get("/api/admin/reviews?status=approved").json()] == [waiting[0]["id"]]
    assert [item["id"] for item in _client(db, None).get(f"/api/reviews/psychic/{reader.id}").json()] == [waiting[0]["id"]]


def test_a_reviews_stars_cannot_be_cleared(db, make_user):
    reader = _reader(make_user)
    client = _earned(db, make_user, reader)
    review_id = _post(db, client, reader, rating=5, comment="Kind and clear.").json()["id"]
    assert _owner(db, make_user).post(f"/api/admin/reviews/{review_id}/approve").status_code == 200
    mine = _client(db, client)

    for body in ({"rating": None}, {"rating": None, "comment": "Changed my mind."}):
        response = mine.put(f"/api/reviews/{review_id}", json=body)
        assert response.status_code == 422, response.text
        assert response.json()["detail"][0]["loc"] == ["body", "rating"]
    db.expire_all()
    review = db.get(Review, review_id)
    assert (review.rating, review.comment, review.status) == (5, "Kind and clear.", REVIEW_APPROVED)

    # Leaving the stars out still works: only the words change.
    words_only = mine.put(f"/api/reviews/{review_id}", json={"comment": "Kinder than I expected."})
    assert words_only.status_code == 200, words_only.text
    db.expire_all()
    review = db.get(Review, review_id)
    assert (review.rating, review.comment, review.status) == (5, "Kinder than I expected.", REVIEW_PENDING)


def test_the_dashboard_average_counts_approved_reviews_only(db, make_user):
    reviewed = _reader(make_user, name="Amrit")
    unapproved = _reader(make_user, name="Delphine")
    for reader in (reviewed, unapproved):
        client = make_user(balance=20)
        _paid(db, _chat(db, client, reader), client)  # a completed debit: she is on the dashboard
    for status, rating in ((REVIEW_APPROVED, 5), (REVIEW_APPROVED, 3), (REVIEW_PENDING, 1), (REVIEW_HIDDEN, 1)):
        db.add(Review(user_id=make_user().id, psychic_id=reviewed.id, rating=rating, status=status))
    for status in (REVIEW_PENDING, REVIEW_HIDDEN):
        db.add(Review(user_id=make_user().id, psychic_id=unapproved.id, rating=1, status=status))
    db.commit()

    app = FastAPI()
    app.include_router(dashboard_router.router, prefix="/api/admin")
    app.dependency_overrides[get_db] = lambda: db
    admin = make_user(role=Role.ADMIN)
    app.dependency_overrides[get_current_user] = lambda: admin
    response = TestClient(app).get("/api/admin/dashboard/stats")
    assert response.status_code == 200, response.text

    averages = {item["id"]: item["averageRating"] for item in response.json()["topPsychics"]["items"]}
    assert averages == {reviewed.id: 4.0, unapproved.id: 0.0}
