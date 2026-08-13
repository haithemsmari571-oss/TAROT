from datetime import datetime, timezone
from io import BytesIO
import json
from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, Depends, File, HTTPException, Query, Request, UploadFile
from fastapi.responses import RedirectResponse
from PIL import Image, ImageOps, UnidentifiedImageError
from sqlalchemy import func, or_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.config import get_app_settings
from app.database.client import get_db
from app.dependencies.authorization import require_superadmin
from app.models.article import Article, ArticleAuditEvent, ArticleSlugRedirect, ArticleVersion
from app.models.user import User
from app.schemas.articles import ArticleDraftInput, ArticleTransitionInput
from app.services.article_content import estimated_reading_minutes, render_article_body, sanitize_article_html

public_router = APIRouter()
admin_router = APIRouter(dependencies=[Depends(require_superadmin)])

MAX_ARTICLE_IMAGE_BYTES = 8 * 1024 * 1024
MAX_ARTICLE_IMAGE_PIXELS = 24_000_000


def _view(article: Article, version: ArticleVersion):
    body_html, toc = render_article_body(version.body, version.body_format)
    return {
        "id": article.id,
        "slug": version.slug,
        "published_slug": article.published_slug,
        "category": version.category,
        "status": article.status,
        "featured": version.featured,
        "published_version_id": article.published_version_id,
        "has_unpublished_changes": article.published_version_id != version.id,
        "published_at": article.published_at,
        "updated_at": version.created_at,
        "version": version.version_number,
        "version_id": version.id,
        "title": version.title,
        "excerpt": version.excerpt,
        "body": version.body,
        "body_format": version.body_format,
        "body_html": body_html,
        "toc": toc,
        "reading_minutes": estimated_reading_minutes(version.body, version.body_format),
        "author": version.author,
        "seo_title": version.seo_title,
        "meta_description": version.meta_description,
        "canonical_override": version.canonical_override,
        "cover_image": version.cover_image,
        "cover_alt": version.cover_alt,
        "social_image": version.social_image,
        "series_name": version.series_name,
        "series_part": version.series_part,
        "calculator_cta": version.calculator_cta,
        "reading_cta": version.reading_cta,
        "related_slugs": json.loads(version.related_slugs or "[]"),
    }


def _summary_view(article: Article, version: ArticleVersion):
    view = _view(article, version)
    for key in ("body", "body_html", "toc"):
        view.pop(key, None)
    return view


def _latest(db: Session, article: Article):
    return (
        db.query(ArticleVersion)
        .filter_by(article_id=article.id)
        .order_by(ArticleVersion.version_number.desc())
        .first()
    )


def _state(article: Article) -> dict:
    return {
        "status": article.status,
        "published_version_id": article.published_version_id,
        "slug": article.slug,
        "published_slug": article.published_slug,
    }


def _audit(
    db: Session,
    *,
    article: Article,
    version_id: int | None,
    actor: User,
    action: str,
    prior: dict,
    key: str,
):
    db.add(
        ArticleAuditEvent(
            article_id=article.id,
            version_id=version_id,
            actor_id=actor.id,
            action=action,
            prior_state=json.dumps(prior, sort_keys=True),
            resulting_state=json.dumps(_state(article), sort_keys=True),
            idempotency_key=key,
        )
    )


def _idempotent_article(
    db: Session,
    key: str,
    action: str,
    article_id: int | None = None,
) -> Article | None:
    event = db.query(ArticleAuditEvent).filter_by(idempotency_key=key).first()
    if event and event.action != action:
        raise HTTPException(409, "That request key was already used for a different article action.")
    if event and article_id is not None and event.article_id != article_id:
        raise HTTPException(409, "That request key belongs to a different article.")
    return db.get(Article, event.article_id) if event else None


def _slug_conflict(db: Session, slug: str, article_id: int | None = None):
    query = db.query(Article).filter(or_(Article.slug == slug, Article.published_slug == slug))
    if article_id is not None:
        query = query.filter(Article.id != article_id)
    article = query.first()
    if article:
        return article
    redirect_query = db.query(ArticleSlugRedirect).filter_by(old_slug=slug)
    if article_id is not None:
        redirect_query = redirect_query.filter(ArticleSlugRedirect.article_id != article_id)
    return redirect_query.first()


def _validate_related(db: Session, payload: ArticleDraftInput, article_id: int | None = None) -> None:
    if payload.slug in payload.related_slugs:
        raise HTTPException(422, "An article cannot be related to itself.")
    if not payload.related_slugs:
        return
    rows = db.query(Article.slug, Article.id).filter(Article.slug.in_(payload.related_slugs)).all()
    found = {slug for slug, row_id in rows if row_id != article_id}
    missing = sorted(set(payload.related_slugs) - found)
    if missing:
        raise HTTPException(422, f"Choose existing related articles. Not found: {', '.join(missing)}.")


def _version_values(payload: ArticleDraftInput) -> dict:
    values = payload.model_dump(
        exclude={
            "slug",
            "category",
            "featured",
            "related_slugs",
            "idempotency_key",
            "expected_latest_version",
        }
    )
    values["seo_title"] = payload.seo_title.strip() or payload.title.strip()
    values["meta_description"] = payload.meta_description.strip() or payload.excerpt.strip()
    if payload.body_format == "html":
        values["body"] = sanitize_article_html(payload.body)
    return values


def _published_query(db: Session):
    return (
        db.query(Article, ArticleVersion)
        .join(ArticleVersion, ArticleVersion.id == Article.published_version_id)
        .filter(Article.status == "published", Article.published_version_id.is_not(None))
    )


@public_router.get("")
def published_articles(
    q: str = Query(default="", max_length=160),
    category: str | None = Query(default=None, max_length=60),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=9, ge=1, le=30),
    db: Session = Depends(get_db),
):
    query = _published_query(db)
    if category:
        query = query.filter(Article.published_category == category)
    search = q.strip()
    if search:
        pattern = f"%{search.casefold()}%"
        query = query.filter(
            or_(
                func.lower(ArticleVersion.title).like(pattern),
                func.lower(ArticleVersion.excerpt).like(pattern),
                func.lower(ArticleVersion.body).like(pattern),
            )
        )
    total = query.count()
    rows = (
        query.order_by(Article.published_at.desc(), Article.id.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )

    featured_rows = []
    if page == 1 and not search:
        featured_query = _published_query(db).filter(Article.published_featured.is_(True))
        if category:
            featured_query = featured_query.filter(Article.published_category == category)
        featured_rows = featured_query.order_by(Article.published_at.desc()).limit(3).all()

    return {
        "items": [_summary_view(article, version) for article, version in rows],
        "featured": [_summary_view(article, version) for article, version in featured_rows],
        "total": total,
        "page": page,
        "page_size": page_size,
        "has_more": page * page_size < total,
        "query": search,
        "category": category,
    }


@public_router.get("/{slug}")
def published_article(slug: str, request: Request, db: Session = Depends(get_db)):
    article = db.query(Article).filter_by(published_slug=slug, status="published").first()
    if not article or not article.published_version_id:
        redirect = db.query(ArticleSlugRedirect).filter_by(old_slug=slug).first()
        target = db.get(Article, redirect.article_id) if redirect else None
        if target and target.status == "published" and target.published_slug:
            return RedirectResponse(
                request.url_for("published_article", slug=target.published_slug),
                status_code=307,
            )
        raise HTTPException(404, "Article not found.")
    version = db.get(ArticleVersion, article.published_version_id)
    result = _view(article, version)
    requested = result["related_slugs"]
    related_query = _published_query(db).filter(Article.id != article.id)
    related_rows: list[tuple[Article, ArticleVersion]] = []
    if requested:
        related_rows = related_query.filter(Article.published_slug.in_(requested)).limit(6).all()
        order = {value: index for index, value in enumerate(requested)}
        related_rows.sort(key=lambda pair: order.get(pair[0].published_slug or "", 999))
    if not related_rows:
        related_rows = (
            related_query.filter(Article.published_category == version.category)
            .order_by(Article.published_at.desc())
            .limit(3)
            .all()
        )
    result["related"] = [_summary_view(row, row_version) for row, row_version in related_rows]
    return result


@admin_router.get("")
def list_articles(db: Session = Depends(get_db)):
    return [
        _view(article, _latest(db, article))
        for article in db.query(Article).order_by(Article.updated_at.desc()).all()
    ]


@admin_router.post("/media")
async def upload_article_media(
    request: Request,
    file: UploadFile = File(...),
):
    if file.content_type not in {"image/jpeg", "image/png", "image/webp"}:
        raise HTTPException(415, "Choose a JPEG, PNG or WebP image.")
    raw = await file.read(MAX_ARTICLE_IMAGE_BYTES + 1)
    if not raw:
        raise HTTPException(400, "The selected image is empty.")
    if len(raw) > MAX_ARTICLE_IMAGE_BYTES:
        raise HTTPException(413, "Article images must be no larger than 8 MB.")
    try:
        image = Image.open(BytesIO(raw))
        image.verify()
        image = Image.open(BytesIO(raw))
        if image.width * image.height > MAX_ARTICLE_IMAGE_PIXELS:
            raise HTTPException(413, "That image has too many pixels. Choose a smaller image.")
        image = ImageOps.exif_transpose(image)
        image.thumbnail((2400, 2400), Image.Resampling.LANCZOS)
        if image.mode not in {"RGB", "RGBA"}:
            image = image.convert("RGBA" if "transparency" in image.info else "RGB")
        output = BytesIO()
        image.save(output, format="WEBP", quality=86, method=6)
    except HTTPException:
        raise
    except (UnidentifiedImageError, OSError, ValueError):
        raise HTTPException(415, "The selected file is not a valid JPEG, PNG or WebP image.")

    media_dir: Path = get_app_settings().MEDIA_DIR
    media_dir.mkdir(parents=True, exist_ok=True)
    filename = f"article_{uuid4()}.webp"
    (media_dir / filename).write_bytes(output.getvalue())
    path = f"/api/media/uploads/{filename}"
    return {
        "path": path,
        "url": str(request.base_url).rstrip("/") + path,
        "filename": filename,
        "content_type": "image/webp",
        "size": len(output.getvalue()),
    }


@admin_router.post("")
def create_draft(
    payload: ArticleDraftInput,
    db: Session = Depends(get_db),
    actor: User = Depends(require_superadmin),
):
    repeated = _idempotent_article(db, payload.idempotency_key, "draft_created")
    if repeated:
        return _view(repeated, _latest(db, repeated))
    if _slug_conflict(db, payload.slug):
        raise HTTPException(409, "That article address is already in use.")
    _validate_related(db, payload)
    try:
        article = Article(
            slug=payload.slug,
            category=payload.category,
            status="draft",
            featured=payload.featured,
        )
        db.add(article)
        db.flush()
        version = ArticleVersion(
            article_id=article.id,
            version_number=1,
            slug=payload.slug,
            category=payload.category,
            featured=payload.featured,
            **_version_values(payload),
            related_slugs=json.dumps(payload.related_slugs),
        )
        db.add(version)
        db.flush()
        _audit(
            db,
            article=article,
            version_id=version.id,
            actor=actor,
            action="draft_created",
            prior={},
            key=payload.idempotency_key,
        )
        db.commit()
    except IntegrityError:
        db.rollback()
        repeated = _idempotent_article(db, payload.idempotency_key, "draft_created")
        if repeated:
            return _view(repeated, _latest(db, repeated))
        raise HTTPException(409, "That article address is already in use.")
    db.refresh(article)
    db.refresh(version)
    return _view(article, version)


@admin_router.put("/{article_id}")
def save_draft(
    article_id: int,
    payload: ArticleDraftInput,
    db: Session = Depends(get_db),
    actor: User = Depends(require_superadmin),
):
    repeated = _idempotent_article(db, payload.idempotency_key, "draft_saved", article_id)
    if repeated:
        return _view(repeated, _latest(db, repeated))
    article = db.query(Article).filter_by(id=article_id).with_for_update().first()
    if not article:
        raise HTTPException(404, "Article not found.")
    if article.status == "archived":
        raise HTTPException(409, "Restore this article before editing it.")
    if _slug_conflict(db, payload.slug, article.id):
        raise HTTPException(409, "That article address is already in use.")
    _validate_related(db, payload, article.id)
    current_number = db.query(func.max(ArticleVersion.version_number)).filter_by(article_id=article.id).scalar() or 0
    if payload.expected_latest_version is not None and payload.expected_latest_version != current_number:
        raise HTTPException(409, "This article changed after you opened it. Refresh before saving.")
    prior = _state(article)
    article.slug, article.category, article.featured = payload.slug, payload.category, payload.featured
    version = ArticleVersion(
        article_id=article.id,
        version_number=current_number + 1,
        slug=payload.slug,
        category=payload.category,
        featured=payload.featured,
        **_version_values(payload),
        related_slugs=json.dumps(payload.related_slugs),
    )
    db.add(version)
    db.flush()
    _audit(
        db,
        article=article,
        version_id=version.id,
        actor=actor,
        action="draft_saved",
        prior=prior,
        key=payload.idempotency_key,
    )
    db.commit()
    db.refresh(version)
    return _view(article, version)


@admin_router.get("/{article_id}/versions")
def versions(article_id: int, db: Session = Depends(get_db)):
    article = db.get(Article, article_id)
    if not article:
        raise HTTPException(404, "Article not found.")
    return [
        _view(article, version)
        for version in db.query(ArticleVersion)
        .filter_by(article_id=article_id)
        .order_by(ArticleVersion.version_number.desc())
        .all()
    ]


@admin_router.get("/{article_id}/audit")
def article_audit(article_id: int, db: Session = Depends(get_db)):
    return [
        {
            "id": row.id,
            "action": row.action,
            "article_id": row.article_id,
            "version_id": row.version_id,
            "actor_id": row.actor_id,
            "prior_state": json.loads(row.prior_state),
            "resulting_state": json.loads(row.resulting_state),
            "created_at": row.created_at,
        }
        for row in db.query(ArticleAuditEvent)
        .filter_by(article_id=article_id)
        .order_by(ArticleAuditEvent.id.desc())
        .all()
    ]


@admin_router.post("/{article_id}/publish/{version_id}")
def publish(
    article_id: int,
    version_id: int,
    payload: ArticleTransitionInput,
    db: Session = Depends(get_db),
    actor: User = Depends(require_superadmin),
):
    repeated = _idempotent_article(db, payload.idempotency_key, "published", article_id)
    if repeated:
        return _view(repeated, db.get(ArticleVersion, repeated.published_version_id))
    article = db.query(Article).filter_by(id=article_id).with_for_update().first()
    version = db.get(ArticleVersion, version_id)
    if not article or not version or version.article_id != article_id:
        raise HTTPException(404, "Article version not found.")
    if (
        article.status not in {"draft", "published"}
        or article.status != payload.expected_status
        or payload.expected_version_id != version_id
    ):
        raise HTTPException(409, "The article state changed. Refresh before publishing.")
    if _latest(db, article).id != version_id or (
        article.status == "published" and article.published_version_id == version_id
    ):
        raise HTTPException(409, "Only the latest unpublished draft can be published.")
    if _slug_conflict(db, version.slug, article.id):
        raise HTTPException(409, "That public article address is already in use.")

    prior = _state(article)
    old_slug = article.published_slug
    db.query(ArticleSlugRedirect).filter_by(article_id=article.id, old_slug=version.slug).delete()
    if old_slug and old_slug != version.slug:
        existing = db.query(ArticleSlugRedirect).filter_by(old_slug=old_slug).first()
        if not existing:
            db.add(ArticleSlugRedirect(article_id=article.id, old_slug=old_slug))
    article.published_version_id, article.status = version.id, "published"
    article.published_slug = version.slug
    article.published_category = version.category
    article.published_featured = version.featured
    article.published_at = article.published_at or datetime.now(timezone.utc)
    _audit(
        db,
        article=article,
        version_id=version.id,
        actor=actor,
        action="published",
        prior=prior,
        key=payload.idempotency_key,
    )
    db.commit()
    return _view(article, version)


def _transition(
    article_id: int,
    payload: ArticleTransitionInput,
    action: str,
    resulting_status: str,
    db: Session,
    actor: User,
):
    repeated = _idempotent_article(db, payload.idempotency_key, action, article_id)
    if repeated:
        return {"id": repeated.id, "status": repeated.status, "idempotent_replay": True}
    article = db.query(Article).filter_by(id=article_id).with_for_update().first()
    if not article:
        raise HTTPException(404, "Article not found.")
    allowed = {"unpublished": {"published"}, "archived": {"draft", "published"}, "restored": {"archived"}}[action]
    if article.status not in allowed:
        raise HTTPException(409, f"This article cannot be {action} from its current state.")
    if article.status != payload.expected_status or payload.expected_version_id != article.published_version_id:
        raise HTTPException(409, "The article state changed. Refresh before continuing.")
    prior = _state(article)
    article.status = resulting_status
    _audit(
        db,
        article=article,
        version_id=article.published_version_id,
        actor=actor,
        action=action,
        prior=prior,
        key=payload.idempotency_key,
    )
    db.commit()
    return {"id": article.id, "status": article.status}


@admin_router.post("/{article_id}/unpublish")
def unpublish(
    article_id: int,
    payload: ArticleTransitionInput,
    db: Session = Depends(get_db),
    actor: User = Depends(require_superadmin),
):
    return _transition(article_id, payload, "unpublished", "draft", db, actor)


@admin_router.post("/{article_id}/archive")
def archive(
    article_id: int,
    payload: ArticleTransitionInput,
    db: Session = Depends(get_db),
    actor: User = Depends(require_superadmin),
):
    return _transition(article_id, payload, "archived", "archived", db, actor)


@admin_router.post("/{article_id}/restore")
def restore(
    article_id: int,
    payload: ArticleTransitionInput,
    db: Session = Depends(get_db),
    actor: User = Depends(require_superadmin),
):
    return _transition(article_id, payload, "restored", "draft", db, actor)
