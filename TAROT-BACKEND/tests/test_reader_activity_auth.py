"""Reader Activity / Earnings (GET /api/admin/psychics/activity) — SUPERADMIN only.

This endpoint had ZERO test coverage: nothing asserted it was reachable, nothing
asserted its gate. It is mounted (admin_psychic_router at prefix /api/admin in
main.py), so the full path is /api/admin/psychics/activity, and it is the
codebase's SUPERADMIN-only tier — distinct from psychic *management*, which is
ADMIN-level via MANAGE_PSYCHICS.

Also pins the response shape, since the CRM's Money & Stats page is being
designed against it.
"""

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.database.client import get_db
from app.dependencies.get_current_user import get_current_user
from app.enums.role import Role
from app.routers import admin_psychic_router

PATH = "/api/admin/psychics/activity"


def build_client(db, current_user=None):
    """current_user=None leaves the real bearer chain in place (anonymous)."""
    test_app = FastAPI()
    test_app.include_router(admin_psychic_router, prefix="/api/admin")
    test_app.dependency_overrides[get_db] = lambda: db
    if current_user is not None:
        test_app.dependency_overrides[get_current_user] = lambda: current_user
    return TestClient(test_app, raise_server_exceptions=False)


def test_superadmin_can_read_reader_activity(db, make_user):
    """Reachable — proves the router is genuinely mounted, not just imported."""
    client = build_client(db, make_user(role=Role.SUPERADMIN))
    resp = client.get(PATH)
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert set(body) == {"period", "psychics", "totals"}
    assert body["period"] == "all"
    assert isinstance(body["psychics"], list)
    assert set(body["totals"]) == {
        "psychic_count",
        "active_count",
        "minutes_read",
        "sessions",
        "unique_clients",
        "client_spend",
    }


def test_reader_activity_includes_idle_readers_with_zeros(db, make_user):
    """The whole roster is visible, not just readers who billed — the page needs
    idle readers to show up."""
    make_user(role=Role.PSYCHIC)
    make_user(role=Role.PSYCHIC)
    client = build_client(db, make_user(role=Role.SUPERADMIN))
    body = client.get(PATH).json()
    assert body["totals"]["psychic_count"] == 2
    assert body["totals"]["active_count"] == 0
    for row in body["psychics"]:
        assert set(row) == {
            "psychic_id",
            "username",
            "minutes_read",
            "sessions",
            "unique_clients",
            "client_spend",
        }
        assert row["minutes_read"] == 0 and row["client_spend"] == 0.0


def test_reader_activity_accepts_every_documented_period(db, make_user):
    client = build_client(db, make_user(role=Role.SUPERADMIN))
    for period in ("all", "today", "7d", "30d", "month"):
        resp = client.get(PATH, params={"period": period})
        assert resp.status_code == 200, f"{period}: {resp.text}"
        assert resp.json()["period"] == period


def test_reader_activity_rejects_admin(db, make_user):
    """ADMIN may manage psychics but must NOT see earnings — this is the line
    between the two admin tiers in this codebase."""
    resp = build_client(db, make_user(role=Role.ADMIN)).get(PATH)
    assert resp.status_code == 403, resp.text


def test_reader_activity_rejects_psychic_and_normal_user(db, make_user):
    for role in (Role.PSYCHIC, Role.USER):
        resp = build_client(db, make_user(role=role)).get(PATH)
        assert resp.status_code == 403, f"{role}: {resp.text}"


def test_reader_activity_rejects_anonymous(db):
    """No dependency override — the real HTTPBearer/get_current_user chain runs."""
    resp = build_client(db).get(PATH)
    assert resp.status_code in (401, 403), resp.text


def test_route_is_mounted_on_the_REAL_app_at_the_expected_path():
    """The mini-app tests above prove the ROUTER works; this proves main.py
    actually mounts it. Written because a bad grep for the module name
    ("admin_psychics") missed the symbol main.py imports
    ("admin_psychic_router") and produced a false "not mounted" report."""
    from app.main import app as real_app

    paths = {getattr(route, "path", None) for route in real_app.routes}
    assert PATH in paths, f"{PATH} is not mounted on the real app"


def test_reader_activity_gate_is_superadmin_not_merely_authenticated(db):
    """Guards the bug class: assert require_superadmin is actually on the route,
    so removing it fails here even if a role test passed for another reason."""
    names = set()
    for route in admin_psychic_router.routes:
        dependant = getattr(route, "dependant", None)
        if dependant is None or "/psychics/activity" not in route.path:
            continue
        names |= {
            d.call.__name__ if hasattr(d.call, "__name__") else repr(d.call)
            for d in dependant.dependencies
        }
    assert "require_superadmin" in names, f"gate missing; found {names}"
