"""Who may review a reader, and what the public sees (ROUND15 section 2).

A client may review a reader once the reader has answered one of her paid
messages. A review waits, pending, until the owner approves it; only approved
reviews reach the public list, the summary and the single review. The owner
approves or hides through superadmin-only routes. One review per client per
reader, held by the database too. The real reviews and psychics routers behind
a FastAPI test client on the in-memory database, the harness of
tests/test_review_privacy.py.
"""

import pytest
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient
from sqlalchemy.exc import IntegrityError

from app.database.client import get_db
from app.dependencies.get_current_user import get_current_user, get_optional_current_user
from app.enums.author_type import AuthorType
from app.enums.chat_status import ChatStatus
from app.enums.response_mode import ResponseMode
from app.enums.role import Role
from app.enums.transaction_status import TransactionStatus
from app.enums.transaction_type import TransactionType
from app.exceptions.domain import DomainError
from app.models.chat import Chat
from app.models.message import Message
from app.models.review import Review, REVIEW_APPROVED, REVIEW_HIDDEN, REVIEW_PENDING
from app.models.transaction import Transaction
from app.routers import psychics as psychics_router
from app.routers import reviews as reviews_router
from app.services.ai.reading_single import UNREACHABLE_NOTICE
from app.services.psychics import get_psychics

NOT_EARNED = "You can review a reader once she has answered one of your paid messages"
FORBIDDEN_KEYS = {"email", "password", "password_hash", "hashed_password", "token", "date_of_birth"}
PUBLIC_KEYS = {"id", "psychic_id", "rating", "comment", "created_at", "username"}


def _client(db, user) -> TestClient:
    from app.main import domain_exception_handler

    app = FastAPI()
    app.add_exception_handler(DomainError, domain_exception_handler)
    app.include_router(reviews_router.router, prefix="/api/reviews")
    app.include_router(reviews_router.admin_router, prefix="/api/admin")
    app.include_router(psychics_router.router, prefix="/api/psychic")
    app.dependency_overrides[get_db] = lambda: db

    def _current():
        if user is None:
            raise HTTPException(status_code=401, detail="Not authenticated")
        return user

    app.dependency_overrides[get_current_user] = _current
    app.dependency_overrides[get_optional_current_user] = lambda: user
    return TestClient(app, raise_server_exceptions=False)


def _reader(make_user, name="Amrit"):
    reader = make_user(role=Role.PSYCHIC)
    reader.username = name
    reader.is_listed = True
    return reader


def _chat(db, client, reader):
    chat = Chat(
        user_id=client.id, psychic_id=reader.id,
        status=ChatStatus.ACTIVE, response_mode=ResponseMode.SABRI,
    )
    db.add(chat)
    db.flush()
    # The reader's free opener, as per_message_start.find_or_open_conversation writes it.
    db.add(Message(chat_id=chat.id, sender_id=reader.id, content="Hello, I'm here with you.",
                   author_type=AuthorType.SYSTEM))
    db.commit()
    return chat


def _paid(db, chat, client, status=TransactionStatus.COMPLETED):
    """One client message and its msg_fee debit, as per_message_billing.charge_client_message stores them."""
    message = Message(chat_id=chat.id, sender_id=client.id, content="What does tonight hold?")
    db.add(message)
    db.flush()
    db.add(Transaction(
        user_id=client.id, transaction_type=TransactionType.DEBIT, amount=2.5,
        balance_before=20, balance_after=17.5, status=status,
        related_chat_id=chat.id, related_message_id=message.id,
        idempotency_key=f"msg_fee:{message.id}",
    ))
    db.commit()
    return message


def _reply(db, chat, reader, content="There is someone on your mind.", author_type=AuthorType.AI_DRAFTED):
    message = Message(chat_id=chat.id, sender_id=reader.id, content=content, author_type=author_type)
    db.add(message)
    db.commit()
    return message


def _earned(db, make_user, reader, name="sophie"):
    """A client whose paid message this reader has answered."""
    client = make_user(balance=20)
    client.username = name
    chat = _chat(db, client, reader)
    _paid(db, chat, client)
    _reply(db, chat, reader)
    return client


def _post(db, user, reader, rating=5, comment="Kind and clear."):
    return _client(db, user).post(
        "/api/reviews/", json={"psychic_id": reader.id, "rating": rating, "comment": comment}
    )


def _can_review(db, user, reader):
    response = _client(db, user).get(f"/api/psychic/{reader.id}")
    assert response.status_code == 200, response.text
    return response.json()["can_review"]


def _refused(response):
    assert response.status_code == 403, response.text
    assert response.json() == {"message": NOT_EARNED}


def test_only_the_free_opener_earns_no_review(db, make_user):
    reader = _reader(make_user)
    client = make_user(balance=20)
    _chat(db, client, reader)

    assert _can_review(db, client, reader) is False
    _refused(_post(db, client, reader))
    assert db.query(Review).count() == 0


def test_a_paid_message_not_yet_answered_earns_no_review(db, make_user):
    reader = _reader(make_user)
    client = make_user(balance=20)
    chat = _chat(db, client, reader)
    _paid(db, chat, client)

    assert _can_review(db, client, reader) is False
    _refused(_post(db, client, reader))


def test_a_refunded_message_earns_no_review_even_when_the_reader_wrote_after_it(db, make_user):
    reader = _reader(make_user)
    client = make_user(balance=20)
    chat = _chat(db, client, reader)
    _paid(db, chat, client, status=TransactionStatus.REVERSED)
    _reply(db, chat, reader)

    assert _can_review(db, client, reader) is False
    _refused(_post(db, client, reader))


def test_the_refund_notice_is_not_an_answer(db, make_user):
    reader = _reader(make_user)
    client = make_user(balance=20)
    chat = _chat(db, client, reader)
    _paid(db, chat, client, status=TransactionStatus.REVERSED)
    _paid(db, chat, client)  # still COMPLETED, waiting for its reply
    # The first message's failed reply was refunded and announced after the second was sent.
    _reply(db, chat, reader, content=UNREACHABLE_NOTICE)

    assert _can_review(db, client, reader) is False
    _refused(_post(db, client, reader))


def test_a_reader_message_before_the_paid_message_is_not_an_answer(db, make_user):
    reader = _reader(make_user)
    client = make_user(balance=20)
    chat = _chat(db, client, reader)
    _reply(db, chat, reader, author_type=AuthorType.HUMAN_PSYCHIC)
    _paid(db, chat, client)

    assert _can_review(db, client, reader) is False
    _refused(_post(db, client, reader))


def test_an_answer_in_another_readers_chat_does_not_count(db, make_user):
    reader = _reader(make_user)
    other = _reader(make_user, name="Delphine")
    client = _earned(db, make_user, other)
    _chat(db, client, reader)

    assert _can_review(db, client, other) is True
    assert _can_review(db, client, reader) is False
    _refused(_post(db, client, reader))


@pytest.mark.parametrize("role", [Role.PSYCHIC, Role.ADMIN, Role.SUPERADMIN])
def test_only_a_client_may_review(db, make_user, role):
    reader = _reader(make_user)
    viewer = make_user(balance=20, role=role)
    chat = _chat(db, viewer, reader)
    _paid(db, chat, viewer)
    _reply(db, chat, reader)

    assert _can_review(db, viewer, reader) is False
    _refused(_post(db, viewer, reader))


def test_an_answered_paid_message_earns_a_review_that_waits_for_the_owner(db, make_user):
    reader = _reader(make_user)
    client = _earned(db, make_user, reader)

    assert _can_review(db, client, reader) is True
    assert _can_review(db, None, reader) is False
    response = _post(db, client, reader, rating=4)
    assert response.status_code == 200, response.text
    created = response.json()
    assert created["status"] == REVIEW_PENDING
    assert db.get(Review, created["id"]).status == REVIEW_PENDING

    # Nothing public until the owner approves it.
    guest = _client(db, None)
    assert guest.get(f"/api/reviews/psychic/{reader.id}").json() == []
    summary = guest.get(f"/api/reviews/psychic/{reader.id}/summary").json()
    assert (summary["total_reviews"], summary["average_rating"]) == (0, 0.0)
    assert guest.get(f"/api/reviews/{created['id']}").status_code == 404

    # She sees her own, with where it stands.
    mine = _client(db, client).get("/api/reviews/my-reviews").json()
    assert [(item["id"], item["status"], item["rating"]) for item in mine] == [(created["id"], REVIEW_PENDING, 4)]
    assert set(mine[0]) == PUBLIC_KEYS | {"psychic_name", "status"}


def test_one_review_per_client_per_reader(db, make_user):
    reader = _reader(make_user)
    client = _earned(db, make_user, reader)
    assert _post(db, client, reader).status_code == 200

    assert _can_review(db, client, reader) is False
    second = _post(db, client, reader, rating=1)
    assert second.status_code == 400
    assert second.json() == {"message": "You have already reviewed this psychic"}

    # And the database holds the pair, whatever the code checks first.
    db.add(Review(user_id=client.id, psychic_id=reader.id, rating=2))
    with pytest.raises(IntegrityError):
        db.commit()
    db.rollback()
    assert db.query(Review).count() == 1


@pytest.mark.parametrize("role", [Role.USER, Role.PSYCHIC, Role.ADMIN])
def test_only_a_superadmin_may_approve_or_hide(db, make_user, role):
    reader = _reader(make_user)
    client = _earned(db, make_user, reader)
    review_id = _post(db, client, reader).json()["id"]
    viewer = make_user(role=role)

    for action in ("approve", "hide"):
        response = _client(db, viewer).post(f"/api/admin/reviews/{review_id}/{action}")
        assert response.status_code == 403, response.text
        response = _client(db, None).post(f"/api/admin/reviews/{review_id}/{action}")
        assert response.status_code == 401, response.text
    assert db.get(Review, review_id).status == REVIEW_PENDING


def test_approve_shows_it_and_hide_takes_it_off(db, make_user):
    reader = _reader(make_user)
    client = _earned(db, make_user, reader)
    review_id = _post(db, client, reader, rating=4, comment="She saw it at once.").json()["id"]
    owner = _client(db, make_user(role=Role.SUPERADMIN))
    guest = _client(db, None)

    approved = owner.post(f"/api/admin/reviews/{review_id}/approve")
    assert approved.status_code == 200, approved.text
    body = approved.json()
    assert set(body) == PUBLIC_KEYS | {"user_id", "status"}
    assert not set(body) & FORBIDDEN_KEYS
    assert (body["status"], body["user_id"], body["username"]) == (REVIEW_APPROVED, client.id, "S.")

    listed = guest.get(f"/api/reviews/psychic/{reader.id}").json()
    assert [(item["id"], item["username"], item["rating"], item["comment"]) for item in listed] == [
        (review_id, "S.", 4, "She saw it at once.")
    ]
    summary = guest.get(f"/api/reviews/psychic/{reader.id}/summary").json()
    assert (summary["total_reviews"], summary["average_rating"], summary["rating_distribution"]["4"]) == (1, 4.0, 1)
    assert guest.get(f"/api/reviews/{review_id}").status_code == 200

    hidden = owner.post(f"/api/admin/reviews/{review_id}/hide")
    assert hidden.status_code == 200, hidden.text
    assert hidden.json()["status"] == REVIEW_HIDDEN
    assert guest.get(f"/api/reviews/psychic/{reader.id}").json() == []
    assert guest.get(f"/api/reviews/psychic/{reader.id}/summary").json()["total_reviews"] == 0
    assert guest.get(f"/api/reviews/{review_id}").status_code == 404
    assert [item["status"] for item in _client(db, client).get("/api/reviews/my-reviews").json()] == [REVIEW_HIDDEN]

    assert owner.post("/api/admin/reviews/999999/approve").status_code == 404


def test_the_list_and_the_summary_count_only_approved_reviews(db, make_user):
    reader = _reader(make_user)
    for status, rating in ((REVIEW_APPROVED, 5), (REVIEW_PENDING, 1), (REVIEW_HIDDEN, 1), (REVIEW_APPROVED, 3)):
        db.add(Review(user_id=make_user().id, psychic_id=reader.id, rating=rating, status=status))
    db.commit()

    guest = _client(db, None)
    assert sorted(item["rating"] for item in guest.get(f"/api/reviews/psychic/{reader.id}").json()) == [3, 5]
    summary = guest.get(f"/api/reviews/psychic/{reader.id}/summary").json()
    assert (summary["total_reviews"], summary["average_rating"]) == (2, 4.0)
    assert summary["rating_distribution"] == {"1": 0, "2": 0, "3": 1, "4": 0, "5": 1}


def test_an_edit_waits_for_the_owner_again(db, make_user):
    reader = _reader(make_user)
    client = _earned(db, make_user, reader)
    review_id = _post(db, client, reader).json()["id"]
    owner = _client(db, make_user(role=Role.SUPERADMIN))
    assert owner.post(f"/api/admin/reviews/{review_id}/approve").status_code == 200
    mine = _client(db, client)

    unchanged = mine.put(f"/api/reviews/{review_id}", json={"rating": 5, "comment": "Kind and clear."})
    assert unchanged.status_code == 200, unchanged.text
    assert db.get(Review, review_id).status == REVIEW_APPROVED

    edited = mine.put(f"/api/reviews/{review_id}", json={"rating": 3, "comment": "Kind, then vague."})
    assert edited.status_code == 200, edited.text
    assert edited.json()["status"] == REVIEW_PENDING
    assert db.get(Review, review_id).status == REVIEW_PENDING
    assert _client(db, None).get(f"/api/reviews/psychic/{reader.id}").json() == []

    assert mine.delete(f"/api/reviews/{review_id}").status_code == 200
    assert db.get(Review, review_id) is None
    # Deleting frees the pair: she may write again.
    assert _can_review(db, client, reader) is True


def test_the_roster_carries_no_can_review(db, make_user):
    reader = _reader(make_user)
    client = _earned(db, make_user, reader)

    roster = get_psychics(db, [], viewer=client)
    assert [(item.id, item.can_review) for item in roster["items"]] == [(reader.id, None)]
