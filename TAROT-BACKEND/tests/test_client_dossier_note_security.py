"""Regression coverage for cross-client dossier-note editing."""

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.database.client import get_db
from app.dependencies.get_current_user import get_current_user
from app.enums.role import Role
from app.routers.client_dossier import router as client_dossier_router
from app.services.client_dossier import create_client_note


def _client(db, current_user):
    app = FastAPI()
    app.include_router(client_dossier_router, prefix="/api")
    app.dependency_overrides[get_db] = lambda: db
    app.dependency_overrides[get_current_user] = lambda: current_user
    return TestClient(app, raise_server_exceptions=False)


def _note(db, client_id, author_id, body="Original synthetic note"):
    return create_client_note(
        db=db,
        client_id=client_id,
        author_psychic_id=author_id,
        chat_id=None,
        note=body,
        title="Synthetic note",
    )


def test_same_client_note_update_succeeds(db, make_user):
    psychic = make_user(role=Role.PSYCHIC)
    dossier_owner = make_user(role=Role.USER)
    note = _note(db, dossier_owner.id, psychic.id)

    response = _client(db, psychic).patch(
        f"/api/clients/{dossier_owner.id}/notes/{note.id}",
        json={"note": "Updated synthetic note"},
    )

    assert response.status_code == 200, response.text
    db.refresh(note)
    assert note.note == "Updated synthetic note"


def test_cross_client_note_update_is_privacy_safe_not_found(db, make_user):
    psychic = make_user(role=Role.PSYCHIC)
    requested_client = make_user(role=Role.USER)
    actual_owner = make_user(role=Role.USER)
    note = _note(db, actual_owner.id, psychic.id)

    response = _client(db, psychic).patch(
        f"/api/clients/{requested_client.id}/notes/{note.id}",
        json={"note": "Attempted cross-client edit"},
    )

    assert response.status_code == 404
    assert response.json() == {"detail": "Note not found"}
    db.refresh(note)
    assert note.note == "Original synthetic note"


def test_missing_note_update_is_privacy_safe_not_found(db, make_user):
    psychic = make_user(role=Role.PSYCHIC)
    dossier_owner = make_user(role=Role.USER)

    response = _client(db, psychic).patch(
        f"/api/clients/{dossier_owner.id}/notes/999999999",
        json={"note": "Missing note"},
    )

    assert response.status_code == 404
    assert response.json() == {"detail": "Note not found"}


def test_unauthorized_user_remains_rejected(db, make_user):
    normal_user = make_user(role=Role.USER)
    dossier_owner = make_user(role=Role.USER)
    psychic_author = make_user(role=Role.PSYCHIC)
    note = _note(db, dossier_owner.id, psychic_author.id)

    response = _client(db, normal_user).patch(
        f"/api/clients/{dossier_owner.id}/notes/{note.id}",
        json={"note": "Unauthorized edit"},
    )

    assert response.status_code == 403
    db.refresh(note)
    assert note.note == "Original synthetic note"
