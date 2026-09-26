"""One stored reader address that today's email check would refuse never turns
the admin reader list into a 500 (ROUND26 decision 2, option A).

Local reader 79 holds an @example.invalid address from an old test fixture. An
admin caller sees reader emails, and PsychicRead used to validate them as
EmailStr on the way out, so the whole of GET /api/psychic/ answered 500. The
read now takes the stored text as it is; the row is not changed, and creating
or editing a reader still checks the address. The real psychics router on the
in-memory database.
"""

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.database.client import get_db
from app.dependencies.get_current_user import get_optional_current_user
from app.enums.role import Role
from app.models import User
from app.routers import psychics as psychics_router
from app.schemas.psychic import PsychicUpdate

STORED = "end_control_reader_fee70ab6@example.invalid"  # reader 79's address, locally


def _client(db, viewer) -> TestClient:
    app = FastAPI()
    app.include_router(psychics_router.router, prefix="/api/psychic")
    app.dependency_overrides[get_db] = lambda: db
    app.dependency_overrides[get_optional_current_user] = lambda: viewer
    return TestClient(app, raise_server_exceptions=False)


@pytest.fixture
def readers(db, make_user):
    odd = make_user(role=Role.PSYCHIC)
    odd.username, odd.email, odd.price_per_message, odd.is_listed = "end_control", STORED, 2.5, True
    plain = make_user(role=Role.PSYCHIC)
    plain.username, plain.email, plain.price_per_message, plain.is_listed = "Amrit", "amrit@test.co", 2.5, True
    db.commit()
    return odd, plain


@pytest.mark.parametrize("role", [Role.SUPERADMIN, Role.ADMIN])
def test_an_admin_gets_the_whole_list_with_the_stored_address(db, make_user, readers, role):
    odd, plain = readers
    admin = make_user(role=role)

    response = _client(db, admin).get("/api/psychic/", params={"skip": 0, "limit": 200})

    assert response.status_code == 200, response.text
    emails = {item["id"]: item["email"] for item in response.json()["items"]}
    assert emails == {odd.id: STORED, plain.id: "amrit@test.co"}


def test_an_admin_gets_that_reader_on_her_own(db, make_user, readers):
    odd, _ = readers
    response = _client(db, make_user(role=Role.SUPERADMIN)).get(f"/api/psychic/{odd.id}")

    assert response.status_code == 200, response.text
    assert response.json()["email"] == STORED


@pytest.mark.parametrize("viewer_role", [None, Role.USER])
def test_the_public_and_clients_still_see_no_email(db, make_user, readers, viewer_role):
    viewer = make_user(role=viewer_role) if viewer_role else None
    response = _client(db, viewer).get("/api/psychic/")

    assert response.status_code == 200, response.text
    assert [item["email"] for item in response.json()["items"]] == [None, None]


def test_the_stored_row_is_left_as_it_is_and_writes_still_check_the_address(db, make_user, readers):
    odd, _ = readers
    _client(db, make_user(role=Role.SUPERADMIN)).get("/api/psychic/")
    db.expire_all()

    assert db.get(User, odd.id).email == STORED
    with pytest.raises(ValidationError):
        PsychicUpdate(email=STORED)
    assert PsychicUpdate(email="amrit@test.co").email == "amrit@test.co"
