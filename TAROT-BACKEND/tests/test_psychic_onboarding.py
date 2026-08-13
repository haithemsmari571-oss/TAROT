"""Stage 4 — bulk psychic onboarding (create-first-then-review, no AI).

Covers the pure manifest parse/match, the stage→review→confirm flow through the
router (with auth + DB overridden like the other admin tests), offline-by-default
creation, per-minute→per-second rate conversion, error rows, edit-to-fix, and
idempotent confirm.
"""

import io

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.database.client import get_db
from app.dependencies.get_current_user import get_current_user
from app.enums.role import Role
from app.models import Category, PsychicOnboardingDraft, User
from app.routers import admin_onboarding_router
from app.services import psychic_onboarding as svc


# ── Pure parse/match ─────────────────────────────────────────────────────────
MANIFEST = (
    "image_filename,display_name,price_per_minute,bio\n"
    "sarah.jpg,Sarah Moon,3.50,Reads tarot with warmth.\n"
    "mike.png,Mike Star,2,Astrologer and numerologist.\n"
)


def test_parse_matches_images_and_flags_missing():
    rows = svc.parse_manifest(MANIFEST, image_names={"sarah.jpg", "mike.png"})
    assert len(rows) == 2
    assert not rows[0].has_errors
    assert rows[0].display_name == "Sarah Moon"
    assert rows[0].price_per_minute == 3.5

    # Missing image → error on that row only.
    rows2 = svc.parse_manifest(MANIFEST, image_names={"sarah.jpg"})
    assert rows2[0].has_errors is False
    assert rows2[1].has_errors is True
    assert "was not among the uploaded files" in rows2[1].problems[0]


def test_parse_accepts_aliases_and_bad_rate():
    manifest = (
        "photo,name,rate,bio\n"
        "a.jpg,Ann,notanumber,hi\n"
        "b.jpg,Bo,-5,hi\n"
    )
    rows = svc.parse_manifest(manifest, image_names={"a.jpg", "b.jpg"})
    assert "is not a number" in " ".join(rows[0].problems)
    assert "greater than 0" in " ".join(rows[1].problems)


def test_parse_rejects_manifest_missing_required_columns():
    rows = svc.parse_manifest("foo,bar\n1,2\n", image_names=set())
    assert len(rows) == 1 and rows[0].has_errors
    assert "must have at least an image column" in rows[0].problems[0]


def test_parse_bio_from_file():
    manifest = "image,name,rate,bio_filename\nx.jpg,Xander,4,xander.txt\n"
    rows = svc.parse_manifest(manifest, image_names={"x.jpg"}, bio_files={"xander.txt": "Long bio here."})
    assert rows[0].bio == "Long bio here."
    assert not rows[0].has_errors


# ── Router flow ──────────────────────────────────────────────────────────────
def build_client(db, current_user):
    app = FastAPI()
    app.include_router(admin_onboarding_router, prefix="/api/admin")
    app.dependency_overrides[get_db] = lambda: db
    app.dependency_overrides[get_current_user] = lambda: current_user
    return TestClient(app, raise_server_exceptions=False)


def _files(manifest_text, images, bios=None):
    files = [("manifest", ("manifest.csv", io.BytesIO(manifest_text.encode()), "text/csv"))]
    for name, data in images.items():
        files.append(("images", (name, io.BytesIO(data), "image/jpeg")))
    for name, text in (bios or {}).items():
        files.append(("bio_files", (name, io.BytesIO(text.encode()), "text/plain")))
    return files


def test_non_admin_cannot_stage(db, make_user):
    client = build_client(db, make_user(role=Role.USER))
    resp = client.post("/api/admin/onboarding/psychics/stage", files=_files(MANIFEST, {"sarah.jpg": b"x", "mike.png": b"y"}))
    assert resp.status_code == 403


def test_stage_review_confirm_creates_offline_psychics(db, make_user):
    admin = make_user(role=Role.ADMIN)
    client = build_client(db, admin)

    stage = client.post(
        "/api/admin/onboarding/psychics/stage",
        files=_files(MANIFEST, {"sarah.jpg": b"img-bytes", "mike.png": b"img-bytes"}),
    )
    assert stage.status_code == 200, stage.text
    summary = stage.json()
    assert summary["total"] == 2 and summary["ready"] == 2 and summary["errors"] == 0
    batch_id = summary["batch_id"]
    # Nothing created yet.
    assert db.query(User).filter(User.role == Role.PSYCHIC).count() == 0
    # Generated identifiers present, image matched to a preview URL.
    assert all(d["username"] and d["email"] and d["preview_url"] for d in summary["drafts"])

    confirm = client.post(f"/api/admin/onboarding/psychics/batches/{batch_id}/confirm")
    assert confirm.status_code == 200, confirm.text
    assert confirm.json()["created"] == 2

    psychics = db.query(User).filter(User.role == Role.PSYCHIC).all()
    assert len(psychics) == 2
    sarah = next(p for p in psychics if p.username.startswith("sarah"))
    assert sarah.is_online is False  # created dark
    assert sarah.email.endswith("@readers.askvalentina.co.uk")
    assert round(sarah.price_per_second, 6) == round(3.5 / 60, 6)  # per-minute → per-second
    assert sarah.bio == "Reads tarot with warmth."


def test_confirm_is_idempotent(db, make_user):
    client = build_client(db, make_user(role=Role.ADMIN))
    batch_id = client.post(
        "/api/admin/onboarding/psychics/stage",
        files=_files(MANIFEST, {"sarah.jpg": b"i", "mike.png": b"i"}),
    ).json()["batch_id"]

    first = client.post(f"/api/admin/onboarding/psychics/batches/{batch_id}/confirm").json()
    second = client.post(f"/api/admin/onboarding/psychics/batches/{batch_id}/confirm").json()
    assert first["created"] == 2
    assert second["created"] == 0 and second["skipped"] == 2  # no duplicates
    assert db.query(User).filter(User.role == Role.PSYCHIC).count() == 2


def test_error_row_can_be_fixed_then_created(db, make_user):
    client = build_client(db, make_user(role=Role.ADMIN))
    # mike.png image intentionally NOT uploaded → row 2 errors.
    stage = client.post(
        "/api/admin/onboarding/psychics/stage",
        files=_files(MANIFEST, {"sarah.jpg": b"i"}),
    ).json()
    assert stage["errors"] == 1
    err_draft = next(d for d in stage["drafts"] if d["status"] == "error")

    # A missing image can't be fixed by editing text — confirm skips it.
    confirmed = client.post(f"/api/admin/onboarding/psychics/batches/{stage['batch_id']}/confirm").json()
    assert confirmed["created"] == 1 and confirmed["skipped"] == 1

    # Editing a bad rate on a row WITH an image flips it back to pending.
    good_manifest = "image,name,rate,bio\nz.jpg,Zed,badrate,hi\n"
    b2 = client.post("/api/admin/onboarding/psychics/stage", files=_files(good_manifest, {"z.jpg": b"i"})).json()
    d = b2["drafts"][0]
    assert d["status"] == "error"
    patched = client.patch(f"/api/admin/onboarding/psychics/drafts/{d['id']}", json={"price_per_minute": 5})
    assert patched.status_code == 200 and patched.json()["status"] == "pending"


def test_categories_are_linked_when_they_exist(db, make_user):
    db.add(Category(title="Love"))
    db.commit()
    client = build_client(db, make_user(role=Role.ADMIN))
    manifest = "image,name,rate,bio,categories\nc.jpg,Cleo,3,hi,Love\n"
    batch_id = client.post("/api/admin/onboarding/psychics/stage", files=_files(manifest, {"c.jpg": b"i"})).json()["batch_id"]
    client.post(f"/api/admin/onboarding/psychics/batches/{batch_id}/confirm")
    cleo = db.query(User).filter(User.role == Role.PSYCHIC).first()
    assert len(cleo.categories) == 1
    assert cleo.categories[0].category.title == "Love"


def test_unknown_batch_404(db, make_user):
    client = build_client(db, make_user(role=Role.ADMIN))
    assert client.get("/api/admin/onboarding/psychics/batches/nope").status_code == 404
    assert client.post("/api/admin/onboarding/psychics/batches/nope/confirm").status_code == 404
