"""Stage 1 security fixes: psychic-route authentication + admin user-edit gate.

Covers the two fixes:
1. /api/psychic/* writes (POST/PATCH/DELETE) now require authentication —
   MANAGE_PSYCHICS for create/delete/any-update, or a PSYCHIC updating their
   own profile. GET endpoints stay public (customer browse).
2. PATCH /api/admin/users/{id} no longer 403s an ADMIN whose payload merely
   echoes the current balance back (the edit form always does); only a real
   balance/password CHANGE stays superadmin-only.
3. Readers are superadmin-only: an ADMIN may not write psychics, create a
   PSYCHIC user, or list or act on a PSYCHIC row through /api/admin/users.
4. Nobody changes their own role through PATCH /api/admin/users/{id}.

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
        psychic_service_module,
        "create_psychic",
        lambda db, data, pic, viewer=None: {"id": 999},
    )
    monkeypatch.setattr(
        psychic_service_module,
        "update_psychic",
        lambda db, pid, data=None, pic=None, viewer=None: {"id": pid},
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
    marketplace ranking or login email. Rate, online hours and the online
    flag are admin-only too: readers are company personas."""
    captured = {}
    monkeypatch.setattr(
        psychic_service_module,
        "update_psychic",
        lambda db, pid, data=None, pic=None, viewer=None: captured.update(data=data)
        or {"id": pid},
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
                    "price_per_message": 9.99,
                    "online_from": "08:00:00",
                    "online_to": "20:00:00",
                    "is_online": False,
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
    for field in (
        "price_per_second",
        "price_per_message",
        "online_from",
        "online_to",
        "is_online",
    ):
        assert field not in sent.model_fields_set, field
    assert sent.bio == "my new bio"


def test_superadmin_update_keeps_order_and_email(db, make_user, monkeypatch):
    # Readers are superadmin-only: the operator here is the SUPERADMIN.
    captured = {}
    monkeypatch.setattr(
        psychic_service_module,
        "update_psychic",
        lambda db, pid, data=None, pic=None, viewer=None: captured.update(data=data)
        or {"id": pid},
    )
    client = build_client(db, make_user(role=Role.SUPERADMIN))
    resp = client.patch(
        "/api/psychic/1",
        data={"psychic_data": json.dumps({"order": 3, "email": "moved@test.co"})},
    )
    assert resp.status_code == 200, resp.text
    sent = captured["data"]
    assert sent.order == 3
    assert sent.email == "moved@test.co"


def test_admin_role_cannot_write_psychics(db, make_user, monkeypatch):
    """ADMIN no longer holds MANAGE_PSYCHICS: every write verb on the psychic
    router answers 403 and the service layer is never reached."""
    called = []
    for name in ("create_psychic", "update_psychic", "delete_psychic"):
        monkeypatch.setattr(
            psychic_service_module,
            name,
            lambda *args, _name=name, **kwargs: called.append(_name),
        )
    client = build_client(db, make_user(role=Role.ADMIN))
    create = client.post(
        "/api/psychic/",
        data={"psychic_data": VALID_PSYCHIC_CREATE},
        files={"profile_picture": ("p.png", b"png-bytes", "image/png")},
    )
    assert create.status_code == 403, create.text
    assert create.json()["detail"] == "Access denied. Requires permission: manage_psychics"
    update = client.patch(
        "/api/psychic/1", data={"psychic_data": json.dumps({"order": 3})}
    )
    assert update.status_code == 403, update.text
    assert update.json()["detail"] == "Not authorized to modify psychic profiles"
    delete = client.delete("/api/psychic/1")
    assert delete.status_code == 403, delete.text
    assert delete.json()["detail"] == "Access denied. Requires permission: manage_psychics"
    assert called == []


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
    # The bare id the former test_admin_can_write_psychics wrote to.
    assert client.patch("/api/psychic/1").status_code == 200
    assert client.delete("/api/psychic/1").status_code == 204


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


# ── Readers are superadmin-only on the user-admin routes too ────────────────
def test_admin_cannot_manage_a_psychic_row(db, make_user):
    """ADMIN keeps MANAGE_USERS, but the target check refuses a reader's row
    the way it refuses an admin's, before anything is written."""
    admin = make_user(role=Role.ADMIN)
    psychic = make_user(role=Role.PSYCHIC)
    fields = ("username", "bio", "price_per_message", "is_online", "status", "is_verified")
    before = {f: getattr(psychic, f) for f in fields}
    client = build_client(db, admin)

    resp = client.patch(
        f"/api/admin/users/{psychic.id}",
        json={
            "username": "renamed",
            "bio": "admin edit",
            "price_per_message": 9.99,
            "is_online": False,
        },
    )
    assert resp.status_code == 403, resp.text
    assert resp.json()["detail"] == "Cannot manage psychics"
    for method, path in (
        ("GET", f"/api/admin/users/{psychic.id}"),
        ("PATCH", f"/api/admin/users/{psychic.id}/suspend"),
        ("PATCH", f"/api/admin/users/{psychic.id}/activate"),
        ("POST", f"/api/admin/users/{psychic.id}/verify"),
    ):
        refused = client.request(method, path)
        assert refused.status_code == 403, (method, path, refused.text)
        assert refused.json()["detail"] == "Cannot manage psychics"

    db.refresh(psychic)
    assert {f: getattr(psychic, f) for f in fields} == before


def test_admin_cannot_create_a_psychic(db, make_user):
    from app.models.user import User

    client = build_client(db, make_user(role=Role.ADMIN))
    resp = client.post(
        "/api/admin/users",
        json={
            "username": "newreader",
            "email": "newreader@test.co",
            "password": "Secret123!",
            "role": "PSYCHIC",
            "price_per_message": 2.5,
        },
    )
    assert resp.status_code == 403, resp.text
    assert resp.json()["detail"] == "Cannot create users with psychic role"
    assert db.query(User).filter(User.email == "newreader@test.co").count() == 0


def test_admin_still_manages_a_user_row(db, make_user):
    admin = make_user(role=Role.ADMIN)
    target = make_user(role=Role.USER)
    client = build_client(db, admin)

    assert client.get(f"/api/admin/users/{target.id}").status_code == 200
    resp = client.patch(f"/api/admin/users/{target.id}", json={"bio": "admin edit"})
    assert resp.status_code == 200, resp.text
    assert resp.json()["bio"] == "admin edit"
    assert client.post(f"/api/admin/users/{target.id}/verify").json()["is_verified"] is True
    assert client.patch(f"/api/admin/users/{target.id}/suspend").json()["status"] == "SUSPENDED"
    assert client.patch(f"/api/admin/users/{target.id}/activate").json()["status"] == "ACTIVE"
    created = client.post(
        "/api/admin/users",
        json={
            "username": "newclient",
            "email": "newclient@test.co",
            "password": "Secret123!",
            "role": "USER",
        },
    )
    assert created.status_code == 200, created.text
    assert created.json()["role"] == "USER"


def test_superadmin_still_manages_a_psychic_row(db, make_user):
    superadmin = make_user(role=Role.SUPERADMIN)
    psychic = make_user(role=Role.PSYCHIC)
    client = build_client(db, superadmin)

    assert client.get(f"/api/admin/users/{psychic.id}").status_code == 200
    resp = client.patch(
        f"/api/admin/users/{psychic.id}",
        json={"bio": "superadmin edit", "price_per_message": 3.5},
    )
    assert resp.status_code == 200, resp.text
    db.refresh(psychic)
    assert psychic.bio == "superadmin edit"
    assert float(psychic.price_per_message) == 3.5
    created = client.post(
        "/api/admin/users",
        json={
            "username": "newreader",
            "email": "newreader@test.co",
            "password": "Secret123!",
            "role": "PSYCHIC",
            "price_per_message": 2.5,
        },
    )
    assert created.status_code == 200, created.text
    assert created.json()["role"] == "PSYCHIC"


def test_admin_user_list_leaves_out_psychic_rows(db, make_user):
    """The list agrees with the detail route: an ADMIN is shown no reader row,
    as no admin or superadmin row. The SUPERADMIN still sees every row."""
    admin = make_user(role=Role.ADMIN)
    superadmin = make_user(role=Role.SUPERADMIN)
    psychic = make_user(role=Role.PSYCHIC)
    client_user = make_user(role=Role.USER)

    listed = build_client(db, admin).get("/api/admin/users")
    assert listed.status_code == 200, listed.text
    assert [u["id"] for u in listed.json()["users"]] == [client_user.id]
    assert listed.json()["total"] == 1
    filtered = build_client(db, admin).get("/api/admin/users?role=PSYCHIC")
    assert filtered.status_code == 200, filtered.text
    assert filtered.json()["users"] == []
    assert filtered.json()["total"] == 0

    everyone = build_client(db, superadmin).get("/api/admin/users")
    assert everyone.status_code == 200, everyone.text
    assert {u["id"] for u in everyone.json()["users"]} == {
        admin.id,
        superadmin.id,
        psychic.id,
        client_user.id,
    }


# ── Nobody changes their own role through the general update ────────────────
def test_superadmin_cannot_change_own_role_through_update(db, make_user):
    """PATCH /users/{id} refuses a caller's own role change with the 400 that
    PATCH /users/{id}/role gives, before anything is written. Every other
    self-edit still goes through."""
    superadmin = make_user(role=Role.SUPERADMIN)
    client = build_client(db, superadmin)

    refused = client.patch(
        f"/api/admin/users/{superadmin.id}", json={"role": "USER", "bio": "self edit"}
    )
    assert refused.status_code == 400, refused.text
    assert refused.json()["detail"] == "Cannot change your own role"
    role_route = client.patch(f"/api/admin/users/{superadmin.id}/role", json={"role": "USER"})
    assert role_route.status_code == 400, role_route.text
    assert role_route.json()["detail"] == refused.json()["detail"]
    db.refresh(superadmin)
    assert superadmin.role == Role.SUPERADMIN
    assert superadmin.bio is None

    renamed = client.patch(
        f"/api/admin/users/{superadmin.id}", json={"username": "owner", "bio": "self edit"}
    )
    assert renamed.status_code == 200, renamed.text
    assert renamed.json()["username"] == "owner"
    assert renamed.json()["bio"] == "self edit"
    # The current role sent back unchanged is not a change.
    echoed = client.patch(
        f"/api/admin/users/{superadmin.id}", json={"role": "SUPERADMIN", "bio": "echo"}
    )
    assert echoed.status_code == 200, echoed.text
    assert echoed.json()["role"] == "SUPERADMIN"

    # Another user's role is still the superadmin's to change here.
    target = make_user(role=Role.USER)
    changed = client.patch(f"/api/admin/users/{target.id}", json={"role": "PSYCHIC"})
    assert changed.status_code == 200, changed.text
    assert changed.json()["role"] == "PSYCHIC"


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
