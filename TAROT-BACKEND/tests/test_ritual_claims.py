"""Screenshot/handle claim pipeline: client submission → pending → admin resolve,
plus the 24h resubmission guard and evidence cleanup."""

import io
from datetime import timedelta

import pytest
from fastapi import FastAPI
from fastapi.responses import JSONResponse
from fastapi.testclient import TestClient
from PIL import Image

from app.database.client import get_db
from app.dependencies.get_current_user import get_current_user
from app.enums.claim_status import ClaimStatus
from app.enums.task_frequency import TaskFrequency
from app.enums.verification_type import VerificationType
from app.exceptions.domain import DomainError
from app.exceptions.tasks import TaskNotClaimableError
from app.models import Claim, Task
from app.routers import constellation_router
from app.services import stardust_rewards as sr
from app.services import tasks as task_svc


@pytest.fixture
def media_tmp(tmp_path):
    from app.config import get_app_settings

    s = get_app_settings()
    old = s.MEDIA_DIR
    s.MEDIA_DIR = tmp_path
    yield tmp_path
    s.MEDIA_DIR = old


def build_client(db, user):
    app = FastAPI()
    app.include_router(constellation_router, prefix="/api")
    app.dependency_overrides[get_db] = lambda: db
    app.dependency_overrides[get_current_user] = lambda: user

    @app.exception_handler(DomainError)
    async def _h(request, exc: DomainError):
        return JSONResponse(status_code=exc.status_code, content={"message": exc.message})

    return TestClient(app, raise_server_exceptions=False)


def _screenshot_task(db, freq=TaskFrequency.UNLIMITED):
    t = Task(
        title="Share to your story",
        reward=5,
        verification_type=VerificationType.SCREENSHOT,
        frequency=freq,
    )
    db.add(t)
    db.commit()
    db.refresh(t)
    return t


def _big_png():
    img = Image.new("RGB", (2600, 1800), (60, 20, 90))
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


# ── Screenshot submission ────────────────────────────────────────────────────
def test_submit_screenshot_creates_pending_and_compresses(db, make_user, media_tmp):
    user = make_user()
    task = _screenshot_task(db)
    client = build_client(db, user)

    raw = _big_png()
    resp = client.post(
        f"/api/constellation/rituals/{task.id}/claim",
        files=[("screenshots", ("photo.png", raw, "image/png"))],
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["status"] == "PENDING"

    claim = db.query(Claim).filter(Claim.task_id == task.id).one()
    assert claim.status == ClaimStatus.PENDING
    assert claim.evidence_path and claim.evidence_path.startswith("/uploads/")

    # A compressed JPEG was stored (smaller than the raw upload).
    stored = media_tmp / claim.evidence_path.split("/")[-1]
    assert stored.exists()
    assert stored.stat().st_size < len(raw)
    assert Image.open(stored).format == "JPEG"


def test_submit_multiple_images_and_message(db, make_user, media_tmp):
    user = make_user()
    task = _screenshot_task(db)
    client = build_client(db, user)

    files = [
        ("screenshots", (f"p{i}.png", _big_png(), "image/png")) for i in range(3)
    ]
    resp = client.post(
        f"/api/constellation/rituals/{task.id}/claim",
        files=files,
        data={"message": "posted it to my story, tagged you!"},
    )
    assert resp.status_code == 200, resp.text

    claim = db.query(Claim).filter(Claim.task_id == task.id).one()
    assert len(claim.evidence_paths) == 3  # all three stored
    assert claim.message == "posted it to my story, tagged you!"
    # Each image was compressed to a JPEG on disk.
    for p in claim.evidence_paths:
        assert (media_tmp / p.split("/")[-1]).exists()


def test_message_is_capped_at_300(db, make_user):
    from app.services import tasks as ts

    user = make_user()
    task = Task(
        title="x", reward=1, verification_type=VerificationType.HANDLE,
        frequency=TaskFrequency.UNLIMITED,
    )
    db.add(task)
    db.commit()
    db.refresh(task)
    claim = ts.create_claim(
        db, user.id, task.id, evidence_handle="@h", message="a" * 500
    )
    assert len(claim.message) == 300


def test_submit_handle_creates_pending(db, make_user):
    user = make_user()
    task = Task(
        title="Tag us on IG",
        reward=5,
        verification_type=VerificationType.HANDLE,
        frequency=TaskFrequency.UNLIMITED,
    )
    db.add(task)
    db.commit()
    db.refresh(task)
    client = build_client(db, user)

    resp = client.post(
        f"/api/constellation/rituals/{task.id}/claim", data={"handle": "@seeker"}
    )
    assert resp.status_code == 200
    claim = db.query(Claim).filter(Claim.task_id == task.id).one()
    assert claim.evidence_handle == "@seeker"
    assert claim.status == ClaimStatus.PENDING


def test_second_submission_while_pending_blocked(db, make_user, media_tmp):
    user = make_user()
    task = _screenshot_task(db)
    client = build_client(db, user)
    url = f"/api/constellation/rituals/{task.id}/claim"

    r1 = client.post(url, files=[("screenshots", ("a.png", _big_png(), "image/png"))])
    assert r1.status_code == 200
    # A second submission while one is still pending is refused.
    r2 = client.post(url, files=[("screenshots", ("b.png", _big_png(), "image/png"))])
    assert r2.status_code == 409


def test_pending_persists_until_resolved(db, make_user):
    user = make_user()
    admin = make_user()
    task = Task(
        title="Tag us", reward=4, verification_type=VerificationType.HANDLE,
        frequency=TaskFrequency.UNLIMITED,
    )
    db.add(task)
    db.commit()
    db.refresh(task)
    client = build_client(db, user)

    client.post(f"/api/constellation/rituals/{task.id}/claim", data={"handle": "@x"})
    # Still pending in the admin queue; no Stardust yet.
    pending = task_svc.list_claims(db, ClaimStatus.PENDING)
    assert len(pending) == 1
    assert sr.get_earned_stardust_balance(db, user.id) == 0

    # Approve → credited + no longer pending.
    task_svc.approve_claim(db, pending[0]["id"], admin_user_id=admin.id)
    assert sr.get_earned_stardust_balance(db, user.id) == 4
    assert task_svc.list_claims(db, ClaimStatus.PENDING) == []


# ── Approved-claim celebration (shown exactly once) ──────────────────────────
def test_approved_claim_yields_one_celebration(db, make_user):
    user = make_user()
    admin = make_user()
    task = _screenshot_task(db)  # reward 5
    c = task_svc.create_claim(db, user.id, task.id, evidence_handle="a")
    task_svc.approve_claim(db, c.id, admin_user_id=admin.id)

    client = build_client(db, user)
    first = client.get("/api/constellation/celebrations").json()["celebrations"]
    assert len(first) == 1
    assert first[0]["kind"] == "claim"
    assert first[0]["amount"] == 5

    # Non-destructive: still pending until acknowledged (survives reloads).
    again = client.get("/api/constellation/celebrations").json()["celebrations"]
    assert len(again) == 1

    # Acknowledge → gone for good.
    client.post("/api/constellation/celebrations/ack", json={"ids": [first[0]["id"]]})
    after = client.get("/api/constellation/celebrations").json()["celebrations"]
    assert after == []


# ── 24h double-pay guard on resubmission (service level, controlled time) ─────
def test_resubmission_blocked_within_24h_after_approval(db, make_user):
    from datetime import datetime, timezone

    user = make_user()
    admin = make_user()
    task = _screenshot_task(db)
    t0 = datetime(2026, 7, 6, 9, 0, tzinfo=timezone.utc)

    c1 = task_svc.create_claim(db, user.id, task.id, evidence_handle="a", now=t0)
    task_svc.approve_claim(db, c1.id, admin_user_id=admin.id, now=t0)

    # Resubmit 3 hours later → blocked by the silent 24h guard.
    with pytest.raises(TaskNotClaimableError):
        task_svc.create_claim(db, user.id, task.id, evidence_handle="b", now=t0 + timedelta(hours=3))

    # 25 hours later → allowed again.
    c3 = task_svc.create_claim(db, user.id, task.id, evidence_handle="c", now=t0 + timedelta(hours=25))
    assert c3.status == ClaimStatus.PENDING


# ── Evidence auto-delete ~60 days after resolution ───────────────────────────
def test_cleanup_deletes_old_evidence(db, make_user, media_tmp):
    from datetime import datetime, timezone

    user = make_user()
    admin = make_user()
    task = _screenshot_task(db)

    # Create a resolved claim with a real evidence file, resolved 61 days ago.
    f = media_tmp / "claim_old.jpg"
    f.write_bytes(b"x" * 100)
    now = datetime(2026, 7, 6, 12, 0, tzinfo=timezone.utc)
    claim = Claim(
        user_id=user.id,
        task_id=task.id,
        status=ClaimStatus.APPROVED,
        evidence_path="/uploads/claim_old.jpg",
        resolved_at=now - timedelta(days=61),
    )
    db.add(claim)
    db.commit()

    result = task_svc.cleanup_resolved_evidence(db, now=now)
    assert result["claims_cleared"] == 1
    assert not f.exists()
    db.refresh(claim)
    assert claim.evidence_path is None
