from fastapi import FastAPI
from fastapi.testclient import TestClient
from io import BytesIO
from types import SimpleNamespace

from PIL import Image

from app.database.client import get_db
from app.dependencies.get_current_user import get_current_user
from app.enums.role import Role
from app.models.article import Article, ArticleAuditEvent, ArticleVersion
from app.routers.articles import admin_router, public_router
from app.routers.public_seo import router as public_seo_router


BASE = {
    "slug": "synthetic-local-numerology",
    "category": "Numerology",
    "title": "Synthetic local numerology article",
    "excerpt": "Synthetic local copy used only to test the editorial workflow.",
    "body": "## Synthetic heading\n\nA harmless local paragraph with <script>alert(1)</script> as inert text.",
    "author": "Synthetic Editor",
    "seo_title": "Synthetic Local Numerology | Ask Valentina",
    "meta_description": "Synthetic local metadata used only to test the article publication workflow.",
    "idempotency_key": "article-create-synthetic-0001",
}


def client_for(db, user):
    app = FastAPI()
    app.include_router(public_router, prefix="/api/articles")
    app.include_router(admin_router, prefix="/api/admin/articles")
    app.include_router(public_seo_router)
    app.dependency_overrides[get_db] = lambda: db
    app.dependency_overrides[get_current_user] = lambda: user
    return TestClient(app, raise_server_exceptions=False)


def test_article_direct_lifecycle_is_idempotent_audited_and_public_snapshot_safe(db, make_user):
    owner = make_user(role=Role.SUPERADMIN)
    client = client_for(db, owner)

    created = client.post("/api/admin/articles", json=BASE)
    assert created.status_code == 200
    draft = created.json()
    assert draft["status"] == "draft"
    assert draft["has_unpublished_changes"] is True
    assert db.query(ArticleVersion).count() == 1
    assert db.query(ArticleAuditEvent).count() == 1

    replay = client.post("/api/admin/articles", json=BASE)
    assert replay.status_code == 200
    assert replay.json()["version_id"] == draft["version_id"]
    assert db.query(ArticleVersion).count() == 1
    assert db.query(ArticleAuditEvent).count() == 1

    publish_body = {
        "idempotency_key": "article-publish-synthetic-0001",
        "expected_status": "draft",
        "expected_version_id": draft["version_id"],
    }
    published = client.post(
        f"/api/admin/articles/{draft['id']}/publish/{draft['version_id']}",
        json=publish_body,
    )
    assert published.status_code == 200
    assert published.json()["status"] == "published"
    assert db.query(ArticleAuditEvent).filter_by(action="published").count() == 1
    assert client.post(
        f"/api/admin/articles/{draft['id']}/publish/{draft['version_id']}",
        json=publish_body,
    ).status_code == 200
    assert db.query(ArticleAuditEvent).filter_by(action="published").count() == 1

    crawler = client.get("/articles/synthetic-local-numerology/")
    assert crawler.status_code == 200
    assert "Synthetic local numerology article" in crawler.text
    assert '<meta property="og:title"' in crawler.text
    assert '<script type="application/ld+json">' in crawler.text
    assert "<script>alert(1)</script>" not in crawler.text
    assert "&lt;script&gt;alert(1)&lt;/script&gt;" in crawler.text
    assert "synthetic-local-numerology" in client.get("/sitemap.xml").text

    # Saving changes to a live article creates v2 but leaves v1, including its
    # URL and visible body, unchanged until the owner publishes v2.
    changed = {
        **BASE,
        "slug": "synthetic-local-numerology-updated",
        "title": "Synthetic private version two",
        "idempotency_key": "article-save-synthetic-0002",
        "expected_latest_version": 1,
    }
    saved = client.put(f"/api/admin/articles/{draft['id']}", json=changed)
    assert saved.status_code == 200
    version_two = saved.json()
    assert version_two["status"] == "published"
    assert version_two["has_unpublished_changes"] is True
    assert client.get("/articles/synthetic-local-numerology/").status_code == 200
    assert client.get("/articles/synthetic-local-numerology-updated/").status_code == 404

    publish_two = {
        "idempotency_key": "article-publish-synthetic-0002",
        "expected_status": "published",
        "expected_version_id": version_two["version_id"],
    }
    assert client.post(
        f"/api/admin/articles/{draft['id']}/publish/{version_two['version_id']}",
        json=publish_two,
    ).status_code == 200
    old_address = client.get("/articles/synthetic-local-numerology/", follow_redirects=False)
    assert old_address.status_code == 308
    assert old_address.headers["location"] == "/articles/synthetic-local-numerology-updated/"
    assert "Synthetic private version two" in client.get("/articles/synthetic-local-numerology-updated/").text

    unpublish = {
        "idempotency_key": "article-unpublish-synthetic-0001",
        "expected_status": "published",
        "expected_version_id": version_two["version_id"],
    }
    assert client.post(f"/api/admin/articles/{draft['id']}/unpublish", json=unpublish).status_code == 200
    assert client.post(f"/api/admin/articles/{draft['id']}/unpublish", json=unpublish).status_code == 200
    assert db.query(ArticleAuditEvent).filter_by(action="unpublished").count() == 1
    assert client.get("/articles/synthetic-local-numerology-updated/").status_code == 404
    assert "synthetic-local-numerology-updated" not in client.get("/sitemap.xml").text

    archive = {
        "idempotency_key": "article-archive-synthetic-0001",
        "expected_status": "draft",
        "expected_version_id": version_two["version_id"],
    }
    assert client.post(f"/api/admin/articles/{draft['id']}/archive", json=archive).json()["status"] == "archived"
    assert db.query(ArticleAuditEvent).filter_by(action="archived").count() == 1
    restore = {
        "idempotency_key": "article-restore-synthetic-0001",
        "expected_status": "archived",
        "expected_version_id": version_two["version_id"],
    }
    assert client.post(f"/api/admin/articles/{draft['id']}/restore", json=restore).json()["status"] == "draft"
    republish = {
        "idempotency_key": "article-republish-synthetic-0001",
        "expected_status": "draft",
        "expected_version_id": version_two["version_id"],
    }
    republished = client.post(
        f"/api/admin/articles/{draft['id']}/publish/{version_two['version_id']}",
        json=republish,
    )
    assert republished.status_code == 200
    assert republished.json()["status"] == "published"
    assert db.query(ArticleVersion).filter_by(article_id=draft["id"]).count() == 2
    assert db.query(ArticleAuditEvent).filter_by(action="published").count() == 3

    audit = client.get(f"/api/admin/articles/{draft['id']}/audit").json()
    assert {row["action"] for row in audit} >= {
        "draft_created", "draft_saved", "published", "unpublished", "archived", "restored"
    }
    assert all(row["actor_id"] == owner.id and row["created_at"] for row in audit)


def test_article_admin_routes_reject_non_superadmins(db, make_user):
    for role in (Role.USER, Role.PSYCHIC, Role.ADMIN):
        response = client_for(db, make_user(role=role)).get("/api/admin/articles")
        assert response.status_code == 403

    unauthenticated = FastAPI()
    unauthenticated.include_router(admin_router, prefix="/api/admin/articles")
    unauthenticated.dependency_overrides[get_db] = lambda: db
    response = TestClient(unauthenticated, raise_server_exceptions=False).get("/api/admin/articles")
    assert response.status_code in {401, 403}


def test_article_publish_validates_version_ownership_and_slug_collisions(db, make_user):
    client = client_for(db, make_user(role=Role.SUPERADMIN))
    first = client.post("/api/admin/articles", json=BASE).json()
    second_payload = {
        **BASE,
        "slug": "second-synthetic-article",
        "title": "Second synthetic article",
        "idempotency_key": "article-create-synthetic-0002",
    }
    second = client.post("/api/admin/articles", json=second_payload).json()
    wrong_version = client.post(
        f"/api/admin/articles/{first['id']}/publish/{second['version_id']}",
        json={
            "idempotency_key": "article-publish-wrong-version",
            "expected_status": "draft",
            "expected_version_id": second["version_id"],
        },
    )
    assert wrong_version.status_code == 404

    collision = client.put(
        f"/api/admin/articles/{second['id']}",
        json={
            **second_payload,
            "slug": BASE["slug"],
            "idempotency_key": "article-save-slug-collision",
            "expected_latest_version": 1,
        },
    )
    assert collision.status_code == 409


def _create_and_publish(client, *, slug, title, category="Numerology", body=None, featured=False, related=None):
    payload = {
        **BASE,
        "slug": slug,
        "title": title,
        "category": category,
        "body": body or f"## {title}\n\nSynthetic searchable body for {title}.",
        "featured": featured,
        "related_slugs": related or [],
        "idempotency_key": f"create-{slug}-synthetic",
    }
    draft = client.post("/api/admin/articles", json=payload).json()
    published = client.post(
        f"/api/admin/articles/{draft['id']}/publish/{draft['version_id']}",
        json={
            "idempotency_key": f"publish-{slug}-synthetic",
            "expected_status": "draft",
            "expected_version_id": draft["version_id"],
        },
    )
    assert published.status_code == 200
    return published.json()


def test_public_search_is_paginated_case_insensitive_combines_category_and_excludes_private(db, make_user):
    client = client_for(db, make_user(role=Role.SUPERADMIN))
    _create_and_publish(
        client,
        slug="synthetic-moon-cycle",
        title="Moon Cycle Numerology",
        body="## Moon cycle\n\nA unique LANTERN phrase appears in this searchable body.",
        featured=True,
    )
    _create_and_publish(
        client,
        slug="synthetic-tarot-lantern",
        title="Tarot Lantern",
        category="Tarot",
        body="## Tarot\n\nAnother lantern phrase.",
    )
    private = client.post("/api/admin/articles", json={
        **BASE,
        "slug": "private-lantern-draft",
        "title": "Private Lantern Draft",
        "body": "## Private\n\nThis lantern must never be public.",
        "idempotency_key": "create-private-lantern",
    })
    assert private.status_code == 200

    first = client.get("/api/articles", params={"q": "LANTERN", "page": 1, "page_size": 1}).json()
    assert first["total"] == 2
    assert len(first["items"]) == 1
    assert first["has_more"] is True
    assert first["featured"] == []
    second = client.get("/api/articles", params={"q": "lantern", "page": 2, "page_size": 1}).json()
    assert len(second["items"]) == 1
    assert second["has_more"] is False
    assert "private-lantern-draft" not in {item["slug"] for item in [*first["items"], *second["items"]]}

    numerology = client.get("/api/articles", params={"q": "lantern", "category": "Numerology"}).json()
    assert numerology["total"] == 1
    assert numerology["items"][0]["slug"] == "synthetic-moon-cycle"
    library = client.get("/api/articles").json()
    assert library["featured"][0]["slug"] == "synthetic-moon-cycle"


def test_visual_editor_html_is_sanitized_related_articles_are_validated_and_versions_remain_immutable(db, make_user):
    client = client_for(db, make_user(role=Role.SUPERADMIN))
    related = _create_and_publish(client, slug="synthetic-related-reading", title="Synthetic Related Reading")
    payload = {
        **BASE,
        "slug": "synthetic-rich-article",
        "title": "Synthetic Rich Article",
        "body_format": "html",
        "body": '<h2>Safe heading</h2><p>Useful <strong>copy</strong>.</p><script>alert(1)</script><img src="javascript:alert(2)">',
        "related_slugs": [related["slug"]],
        "idempotency_key": "create-synthetic-rich-article",
    }
    created = client.post("/api/admin/articles", json=payload)
    assert created.status_code == 200
    draft = created.json()
    assert draft["body_format"] == "html"
    assert "<script" not in draft["body"]
    assert "javascript:" not in draft["body_html"]
    assert draft["toc"] == [{"level": 2, "text": "Safe heading", "id": "safe-heading"}]
    first_body = db.get(ArticleVersion, draft["version_id"]).body

    changed = client.put(f"/api/admin/articles/{draft['id']}", json={
        **payload,
        "body": "<h2>New safe heading</h2><p>This is the second immutable visual version.</p>",
        "idempotency_key": "save-synthetic-rich-article-v2",
        "expected_latest_version": 1,
    })
    assert changed.status_code == 200
    assert db.get(ArticleVersion, draft["version_id"]).body == first_body
    assert db.query(ArticleVersion).filter_by(article_id=draft["id"]).count() == 2

    missing_related = client.post("/api/admin/articles", json={
        **BASE,
        "slug": "bad-related-selection",
        "title": "Bad related selection",
        "related_slugs": ["does-not-exist"],
        "idempotency_key": "create-bad-related-selection",
    })
    assert missing_related.status_code == 422


def test_article_cover_upload_validates_real_images_and_uses_safe_filename(db, make_user, tmp_path, monkeypatch):
    monkeypatch.setattr(
        "app.routers.articles.get_app_settings",
        lambda: SimpleNamespace(MEDIA_DIR=tmp_path),
    )
    client = client_for(db, make_user(role=Role.SUPERADMIN))
    rejected = client.post(
        "/api/admin/articles/media",
        files={"file": ("not-an-image.png", b"not a png", "image/png")},
    )
    assert rejected.status_code == 415

    buffer = BytesIO()
    Image.new("RGB", (80, 50), (74, 44, 90)).save(buffer, format="PNG")
    accepted = client.post(
        "/api/admin/articles/media",
        files={"file": ("../../unsafe name.png", buffer.getvalue(), "image/png")},
    )
    assert accepted.status_code == 200
    body = accepted.json()
    assert body["path"].startswith("/api/media/uploads/article_")
    assert body["path"].endswith(".webp")
    assert ".." not in body["filename"] and "unsafe" not in body["filename"]
    assert (tmp_path / body["filename"]).is_file()
