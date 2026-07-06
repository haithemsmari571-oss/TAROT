"""Admin Task Manager + Claims Queue endpoints.

Exercised through a real FastAPI app (only the admin_tasks router mounted) with
the DB and current-user dependencies overridden. This covers permissions, task
CRUD/duplicate, and approve/reject/bulk crediting end-to-end.
"""

from fastapi import FastAPI
from fastapi.responses import JSONResponse
from fastapi.testclient import TestClient

from app.database.client import get_db
from app.dependencies.get_current_user import get_current_user
from app.exceptions.domain import DomainError
from app.enums.claim_status import ClaimStatus
from app.enums.role import Role
from app.enums.task_frequency import TaskFrequency
from app.enums.verification_type import VerificationType
from app.models import Task
from app.routers import admin_tasks_router
from app.services import stardust_rewards as sr
from app.services import tasks as task_svc


def build_client(db, current_user):
    """A TestClient whose DB is the in-memory test session and whose auth returns
    ``current_user`` (used to exercise the permission dependency for real)."""
    app = FastAPI()
    app.include_router(admin_tasks_router, prefix="/api/admin")
    app.dependency_overrides[get_db] = lambda: db
    app.dependency_overrides[get_current_user] = lambda: current_user

    # Mirror main.py so domain errors surface with their real status codes.
    @app.exception_handler(DomainError)
    async def _domain_handler(request, exc: DomainError):
        return JSONResponse(status_code=exc.status_code, content={"message": exc.message})

    return TestClient(app, raise_server_exceptions=False)


# ── Permissions ──────────────────────────────────────────────────────────────
def test_non_admin_forbidden(db, make_user):
    user = make_user(role=Role.USER)
    client = build_client(db, user)
    assert client.get("/api/admin/tasks").status_code == 403
    assert client.post("/api/admin/tasks", json={"title": "x", "reward": 1}).status_code == 403


def test_admin_allowed(db, make_user):
    admin = make_user(role=Role.ADMIN)
    client = build_client(db, admin)
    assert client.get("/api/admin/tasks").status_code == 200


# ── Task CRUD + duplicate ────────────────────────────────────────────────────
def test_task_crud_and_duplicate(db, make_user):
    admin = make_user(role=Role.ADMIN)
    client = build_client(db, admin)

    # Create a manual (screenshot) task — no trigger event needed.
    create = client.post(
        "/api/admin/tasks",
        json={
            "title": "Share today's card",
            "description": "Post to your story",
            "icon": "📸",
            "reward": 5,
            "verification_type": "SCREENSHOT",
            "frequency": "ONCE_PER_WINDOW",
            "status": "ACTIVE",
            "rotation_weight": 2,
        },
    )
    assert create.status_code == 200, create.text
    task = create.json()
    assert task["reward"] == 5
    assert task["trigger_event"] is None  # manual tasks carry no trigger

    task_id = task["id"]

    # List
    listed = client.get("/api/admin/tasks").json()
    assert any(t["id"] == task_id for t in listed)

    # Update reward
    upd = client.put(f"/api/admin/tasks/{task_id}", json={"reward": 8})
    assert upd.status_code == 200
    assert upd.json()["reward"] == 8

    # Duplicate → new inactive copy
    dup = client.post(f"/api/admin/tasks/{task_id}/duplicate")
    assert dup.status_code == 200
    dup_body = dup.json()
    assert dup_body["id"] != task_id
    assert dup_body["status"] == "INACTIVE"
    assert "(copy)" in dup_body["title"]

    # Delete original
    assert client.delete(f"/api/admin/tasks/{task_id}").status_code == 200


def test_auto_task_requires_trigger_event(db, make_user):
    admin = make_user(role=Role.ADMIN)
    client = build_client(db, admin)

    resp = client.post(
        "/api/admin/tasks",
        json={
            "title": "Pull a card",
            "reward": 3,
            "verification_type": "AUTO",
            # trigger_event deliberately omitted
            "frequency": "ONCE_PER_DAY",
            "status": "ACTIVE",
        },
    )
    assert resp.status_code == 400


# ── Claims Queue: approve / reject / bulk ────────────────────────────────────
def _pending_manual_claim(db, make_user):
    """A user + a manual task + a submitted pending claim."""
    user = make_user(role=Role.USER)
    task = Task(
        title="Share to IG",
        reward=5,
        verification_type=VerificationType.SCREENSHOT,
        frequency=TaskFrequency.UNLIMITED,
    )
    db.add(task)
    db.commit()
    db.refresh(task)
    claim = task_svc.create_claim(db, user.id, task.id, evidence_handle="@seeker")
    return user, task, claim


def test_approve_credits_from_task_record(db, make_user):
    admin = make_user(role=Role.ADMIN)
    user, task, claim = _pending_manual_claim(db, make_user)
    client = build_client(db, admin)

    resp = client.post(f"/api/admin/claims/{claim.id}/approve")
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["status"] == "APPROVED"
    assert body["reward_amount"] == 5
    # Credited through the step-1 earned-Stardust ledger.
    assert sr.get_earned_stardust_balance(db, user.id) == 5


def test_reject_records_reason_and_no_credit(db, make_user):
    admin = make_user(role=Role.ADMIN)
    user, task, claim = _pending_manual_claim(db, make_user)
    client = build_client(db, admin)

    resp = client.post(
        f"/api/admin/claims/{claim.id}/reject", json={"reason": "Not tagged"}
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "REJECTED"
    assert sr.get_earned_stardust_balance(db, user.id) == 0


def test_pending_queue_lists_evidence(db, make_user):
    admin = make_user(role=Role.ADMIN)
    user, task, claim = _pending_manual_claim(db, make_user)
    client = build_client(db, admin)

    queue = client.get("/api/admin/claims").json()
    assert len(queue) == 1
    row = queue[0]
    assert row["username"] == user.username
    assert row["task_title"] == "Share to IG"
    assert row["evidence_handle"] == "@seeker"
    assert row["submitted_at"] is not None


def test_bulk_approve(db, make_user):
    admin = make_user(role=Role.ADMIN)
    u1, t1, c1 = _pending_manual_claim(db, make_user)
    u2, t2, c2 = _pending_manual_claim(db, make_user)
    client = build_client(db, admin)

    resp = client.post(
        "/api/admin/claims/bulk-approve", json={"claim_ids": [c1.id, c2.id]}
    )
    assert resp.status_code == 200
    result = resp.json()
    assert set(result["approved"]) == {c1.id, c2.id}
    assert result["skipped"] == []
    assert sr.get_earned_stardust_balance(db, u1.id) == 5
    assert sr.get_earned_stardust_balance(db, u2.id) == 5
