"""Stage 1 security fixes: psychic-route authentication + admin user-edit gate.

Covers the two fixes:
1. /api/psychic/* writes (POST/PATCH/DELETE) now require authentication —
   MANAGE_PSYCHICS for create/delete/any-update, or a PSYCHIC updating their
   own profile. GET endpoints stay public (customer browse).
2. PATCH /api/admin/users/{id} no longer 403s an ADMIN whose payload merely
   echoes the current balance back (the edit form always does); only a real
   balance/password CHANGE stays superadmin-only.

Same harness as the other router tests: a minimal FastAPI app with the router
mounted and the DB / current-user dependencies overridden.
"""

import json

from fastapi import FastAPI
from fastapi.testclient import TestClient

import app.services.psychics as psychic_service_module
from app.database.client import get_db
from app.dependencies.get_current_user import get_current_user
from app.enums.role import Role
from app.routers import psychic_router, user_router


def build_client(db, current_user=None):
    """TestClient over the two routers under test. current_user=None leaves the
    real HTTPBearer/get_current_user chain in place (anonymous requests)."""
    test_app = FastAPI()
    test_app.include_router(psychic_router, prefix="/api/psychic")
    test_app.include_router(user_router, prefix="/api/admin")
    test_app.dependency_overrides[get_db] = lambda: db
    if current_user is not None:
        test_app.dependency_overrides[get_current_user] = lambda: current_user
    return TestClient(test_app, raise_server_exceptions=False)


VALID_PSYCHIC_CREATE = json.dumps(
    {
        "username": "newpsychic",
        "email": "newpsychic@test.co",
        "price_per_second": 0.05,
        "bio": "bio",
        "is_online": True,
        "password": "Secret123!",
        "categories_ids": [],
        "availability": [],
    }
)


def _stub_services(monkeypatch):
    """Auth is the unit under test — stub the service layer so happy paths do
    not touch disk (profile-picture upload) or need seeded psychic rows."""
    monkeypatch.setattr(
        psychic_service_module, "create_psychic", lambda db, data, pic: {"id": 999}
    )
    monkeypatch.setattr(
        psychic_service_module,
        "update_psychic",
        lambda db, pid, data=None, pic=None: {"id": pid},
    )
    monkeypatch.setattr(
        psychic_service_module, "delete_psychic", lambda db, pid: None
    )


# ── Psychic routes: public reads stay public ────────────────────────────────
def test_psychic_list_stays_public(db):
    client = build_client(db)  # anonymous
    assert client.get("/api/psychic/").status_code == 200


# ── Psychic routes: writes now require auth ─────────────────────────────────
def test_psychic_writes_reject_anonymous(db, monkeypatch):
    _stub_services(monkeypatch)
    client = build_client(db)  # anonymous — real HTTPBearer chain
    create = client.post(
        "/api/psychic/",
        data={"psychic_data": VALID_PSYCHIC_CREATE},
        files={"profile_picture": ("p.png", b"png-bytes", "image/png")},
    )
    assert create.status_code == 401, create.text
    assert client.patch("/api/psychic/1").status_code == 401
    assert client.delete("/api/psychic/1").status_code == 401


def test_psychic_writes_reject_normal_user(db, make_user, monkeypatch):
    _stub_services(monkeypatch)
    client = build_client(db, make_user(role=Role.USER))
    create = client.post(
        "/api/psychic/",
        data={"psychic_data": VALID_PSYCHIC_CREATE},
        files={"profile_picture": ("p.png", b"png-bytes", "image/png")},
    )
    assert create.status_code == 403, create.text
    assert client.patch("/api/psychic/1").status_code == 403
    assert client.delete("/api/psychic/1").status_code == 403


def test_psychic_create_delete_are_admin_only_even_for_psychics(
    db, make_user, monkeypatch
):
    _stub_services(monkeypatch)
    psychic = make_user(role=Role.PSYCHIC)
    client = build_client(db, psychic)
    create = client.post(
        "/api/psychic/",
        data={"psychic_data": VALID_PSYCHIC_CREATE},
        files={"profile_picture": ("p.png", b"png-bytes", "image/png")},
    )
    assert create.status_code == 403, create.text
    assert client.delete(f"/api/psychic/{psychic.id}").status_code == 403


def test_psychic_can_update_only_their_own_profile(db, make_user, monkeypatch):
    _stub_services(monkeypatch)
    psychic = make_user(role=Role.PSYCHIC)
    other = make_user(role=Role.PSYCHIC)
    client = build_client(db, psychic)
    assert client.patch(f"/api/psychic/{psychic.id}").status_code == 200
    assert client.patch(f"/api/psychic/{other.id}").status_code == 403


def test_psychic_self_update_strips_order_and_email(db, make_user, monkeypatch):
    """Stage-1.1 rider: a psychic editing their own profile cannot change
    marketplace ranking or login email; rate stays self-service by design."""
    captured = {}
    monkeypatch.setattr(
        psychic_service_module,
        "update_psychic",
        lambda db, pid, data=None, pic=None: captured.update(data=data) or {"id": pid},
    )
    psychic = make_user(role=Role.PSYCHIC)
    client = build_client(db, psychic)
    resp = client.patch(
        f"/api/psychic/{psychic.id}",
        data={
            "psychic_data": json.dumps(
                {
                    "bio": "my new bio",
                    "price_per_second": 0.09,
                    "order": 1,
                    "email": "hijack@test.co",
                }
            )
        },
    )
    assert resp.status_code == 200, resp.text
    sent = captured["data"]
    assert "order" not in sent.model_fields_set
    assert "email" not in sent.model_fields_set
    assert sent.bio == "my new bio"
    assert sent.price_per_second == 0.09  # rate self-service is intended


def test_admin_update_keeps_order_and_email(db, make_user, monkeypatch):
    captured = {}
    monkeypatch.setattr(
        psychic_service_module,
        "update_psychic",
        lambda db, pid, data=None, pic=None: captured.update(data=data) or {"id": pid},
    )
    client = build_client(db, make_user(role=Role.ADMIN))
    resp = client.patch(
        "/api/psychic/1",
        data={"psychic_data": json.dumps({"order": 3, "email": "moved@test.co"})},
    )
    assert resp.status_code == 200, resp.text
    sent = captured["data"]
    assert sent.order == 3
    assert sent.email == "moved@test.co"


def test_admin_can_write_psychics(db, make_user, monkeypatch):
    _stub_services(monkeypatch)
    client = build_client(db, make_user(role=Role.ADMIN))
    create = client.post(
        "/api/psychic/",
        data={"psychic_data": VALID_PSYCHIC_CREATE},
        files={"profile_picture": ("p.png", b"png-bytes", "image/png")},
    )
    assert create.status_code == 200, create.text
    assert client.patch("/api/psychic/1").status_code == 200
    assert client.delete("/api/psychic/1").status_code == 204


# ── Admin user edit: unchanged balance no longer 403s an ADMIN ──────────────
def test_superadmin_can_write_psychics(db, make_user, monkeypatch):
    """SUPERADMIN holds every Permission, so it must pass the MANAGE_PSYCHICS
    gate on all three write verbs. Asserted explicitly rather than inferred from
    `Role.SUPERADMIN: list(Permission)` — a future narrowing of that map should
    fail a test, not silently lock the owner out of psychic management."""
    _stub_services(monkeypatch)
    superadmin = make_user(role=Role.SUPERADMIN)
    target = make_user(role=Role.PSYCHIC)
    client = build_client(db, superadmin)

    create = client.post(
        "/api/psychic/",
        data={"psychic_data": VALID_PSYCHIC_CREATE},
        files={"profile_picture": ("p.png", b"png-bytes", "image/png")},
    )
    assert create.status_code == 200, create.text
    assert client.patch(f"/api/psychic/{target.id}").status_code == 200
    assert client.delete(f"/api/psychic/{target.id}").status_code == 204


def test_psychic_write_gate_is_mounted_on_every_write_verb(db, make_user, monkeypatch):
    """Belt-and-braces against the original bug class: assert the dependency is
    actually PRESENT on POST/PATCH/DELETE, so deleting it would fail here even
    if some future test happened to pass for another reason. Reads stay open."""
    from app.routers import psychic_router

    guarded, open_routes = {}, {}
    for route in psychic_router.routes:
        names = {
            d.call.__name__ if hasattr(d.call, "__name__") else repr(d.call)
            for d in getattr(route, "dependant", None).dependencies
        } if getattr(route, "dependant", None) else set()
        # The gate appears either as require_psychic_update_access or as the
        # closure require_permission() returns (_check_permission).
        gated = bool(names & {"require_psychic_update_access", "_check_permission"})
        for method in route.methods:
            (guarded if gated else open_routes)[(method, route.path)] = names

    writes = {(m, p) for (m, p) in list(guarded) + list(open_routes) if m in {"POST", "PATCH", "PUT", "DELETE"}}
    assert writes, "expected write routes on the psychic router"
    ungated_writes = [k for k in writes if k in open_routes]
    assert ungated_writes == [], f"UNAUTHENTICATED write routes: {ungated_writes}"
    # And the public browse endpoints are still public.
    assert any(m == "GET" for (m, _p) in open_routes)


def test_admin_edit_with_echoed_balance_succeeds(db, make_user):
    admin = make_user(role=Role.ADMIN)
    target = make_user(balance=40, role=Role.USER)
    client = build_client(db, admin)
    resp = client.patch(
        f"/api/admin/users/{target.id}",
        json={
            "username": "renamed",
            "email": target.email,
            "bio": "updated bio",
            "balance": 40,  # echoed back unchanged — the exact bug scenario
        },
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["username"] == "renamed"


def test_admin_edit_changing_balance_still_forbidden(db, make_user):
    admin = make_user(role=Role.ADMIN)
    target = make_user(balance=40, role=Role.USER)
    client = build_client(db, admin)
    resp = client.patch(
        f"/api/admin/users/{target.id}",
        json={"username": target.username, "email": target.email, "balance": 75},
    )
    assert resp.status_code == 403


def test_admin_edit_setting_password_still_forbidden(db, make_user):
    admin = make_user(role=Role.ADMIN)
    target = make_user(role=Role.USER)
    client = build_client(db, admin)
    resp = client.patch(
        f"/api/admin/users/{target.id}",
        json={"username": target.username, "email": target.email, "password": "NewPass123!"},
    )
    assert resp.status_code == 403


def test_superadmin_balance_change_still_works_and_hits_ledger(db, make_user):
    superadmin = make_user(role=Role.SUPERADMIN)
    target = make_user(balance=40, role=Role.USER)
    client = build_client(db, superadmin)
    resp = client.patch(
        f"/api/admin/users/{target.id}",
        json={"username": target.username, "email": target.email, "balance": 65},
    )
    assert resp.status_code == 200, resp.text
    db.refresh(target)
    assert float(target.balance) == 65.0

    from app.models.transaction import Transaction

    ledger = db.query(Transaction).filter(Transaction.user_id == target.id).all()

    def _meta(t):
        raw = t.transaction_metadata
        if isinstance(raw, str):
            return json.loads(raw) if raw else {}
        return raw or {}

    assert any(
        _meta(t).get("adjustment_type") == "admin_edit" for t in ledger
    ), "balance change must be recorded as a ledger adjustment"


def test_admin_still_cannot_manage_other_admins(db, make_user):
    admin = make_user(role=Role.ADMIN)
    other_admin = make_user(role=Role.ADMIN)
    client = build_client(db, admin)
    resp = client.patch(
        f"/api/admin/users/{other_admin.id}",
        json={"username": "x", "email": other_admin.email},
    )
    assert resp.status_code == 403


def test_admin_user_contract_exposes_paid_credit_and_total(db, make_user):
    superadmin = make_user(role=Role.SUPERADMIN)
    target = make_user(balance=12.5, credit_balance=3.25, role=Role.USER)
    client = build_client(db, superadmin)

    listed = client.get(f"/api/admin/users?search={target.username}")
    assert listed.status_code == 200, listed.text
    row = next(item for item in listed.json()["users"] if item["id"] == target.id)
    assert row["balance"] == 12.5
    assert row["credit_balance"] == 3.25
    assert row["total_balance"] == 15.75

    detail = client.get(f"/api/admin/users/{target.id}")
    assert detail.status_code == 200, detail.text
    assert detail.json()["balance"] == 12.5
    assert detail.json()["credit_balance"] == 3.25
    assert detail.json()["total_balance"] == 15.75


def test_gift_reports_total_balance_everywhere(db, make_user, monkeypatch):
    from app.models.notification import Notification
    from app.notification_manager import notification_manager

    superadmin = make_user(role=Role.SUPERADMIN)
    target = make_user(balance=10, credit_balance=3, role=Role.USER)
    sent = {}

    async def capture(message, user_id):
        sent.update(message=message, user_id=user_id)

    monkeypatch.setattr(notification_manager, "send_to_user", capture)
    client = build_client(db, superadmin)
    response = client.post(
        f"/api/admin/users/{target.id}/gift",
        json={"amount": 2.5, "message": "Synthetic regression gift"},
    )

    assert response.status_code == 200, response.text
    payload = response.json()
    assert payload["paid_balance"] == 10
    assert payload["credit_balance"] == 5.5
    assert payload["total_balance"] == 15.5
    assert payload["new_balance"] == 15.5

    db.refresh(target)
    assert float(target.balance) == 10
    assert float(target.credit_balance) == 5.5
    notification = (
        db.query(Notification)
        .filter(Notification.user_id == target.id)
        .order_by(Notification.id.desc())
        .first()
    )
    assert notification.data["new_balance"] == 15.5
    assert sent["user_id"] == target.id
    assert sent["message"]["data"]["new_balance"] == 15.5
