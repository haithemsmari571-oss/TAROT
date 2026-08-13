"""Server-readable public editorial pages and the dynamic sitemap."""

from html import escape
import json
from urllib.parse import quote, urlencode

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import HTMLResponse, RedirectResponse, Response
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.database.client import get_db
from app.models.article import Article, ArticleSlugRedirect, ArticleVersion
from app.services.article_content import estimated_reading_minutes, render_article_body

router = APIRouter()
SITE = "https://askvalentina.co.uk"
FIXED_PATHS = [
    "/", "/psychics-browse", "/does-he-miss-me", "/will-my-ex-come-back",
    "/articles/",
]
CATEGORY_SLUGS = {
    "numerology": "Numerology",
    "tarot": "Tarot",
    "love-and-relationships": "Love & Relationships",
    "psychic-guidance": "Psychic Guidance",
}


def _head(
    title: str,
    description: str,
    canonical: str,
    *,
    image: str | None = None,
    kind: str = "article",
    robots: str = "index,follow",
    json_ld: list[dict] | None = None,
):
    safe_title = escape(title)
    safe_description = escape(description)
    safe_url = escape(canonical, quote=True)
    safe_image = escape(image or f"{SITE}/logo.svg", quote=True)
    tags = f"""<title>{safe_title}</title><meta name="description" content="{safe_description}">
<link rel="canonical" href="{safe_url}"><meta name="robots" content="{escape(robots, quote=True)}">
<meta property="og:type" content="{kind}"><meta property="og:title" content="{safe_title}">
<meta property="og:description" content="{safe_description}"><meta property="og:url" content="{safe_url}">
<meta property="og:image" content="{safe_image}"><meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="{safe_title}"><meta name="twitter:description" content="{safe_description}">
<meta name="twitter:image" content="{safe_image}">"""
    for block in json_ld or []:
        safe_json = json.dumps(block, ensure_ascii=True).replace("<", "\\u003c")
        tags += f'<script type="application/ld+json">{safe_json}</script>'
    return tags


def _document(head: str, body: str):
    site_header = """<header class="site-header"><a class="brand" href="/">Ask Valentina</a><nav aria-label="Main navigation"><a href="/psychics-browse">Readings</a><a href="/articles/">Articles</a><a href="/numerology/">Numerology</a></nav></header>"""
    return HTMLResponse(
        f"""<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">{head}<style>
*{{box-sizing:border-box}}html{{scroll-behavior:smooth}}body{{margin:0;background:#09090d;color:#f7f1e8;font:16px/1.7 system-ui,sans-serif}}a{{color:inherit}}.site-header{{position:sticky;top:0;z-index:10;display:flex;justify-content:space-between;align-items:center;min-height:68px;padding:0 max(22px,calc((100vw - 1160px)/2));border-bottom:1px solid #ffffff12;background:#0b0b0eea;backdrop-filter:blur(18px)}}.brand{{font:italic 23px Georgia;color:#f0d486;text-decoration:none}}.site-header nav{{display:flex;gap:28px}}.site-header nav a{{color:#cbc5bd;text-decoration:none;font-size:13px}}.site-header nav a:hover{{color:#f0d486}}main{{max-width:1160px;margin:auto;padding:64px 24px 100px}}.crumbs{{display:flex;gap:9px;color:#8f8982;font-size:13px;margin-bottom:42px}}.crumbs a{{color:#c9c2b9}}h1{{font:500 clamp(46px,7vw,82px)/1 Georgia;letter-spacing:-.045em}}.eyebrow{{color:#d9b966;text-transform:uppercase;letter-spacing:.18em;font-size:11px;font-weight:800}}.library-hero{{max-width:900px;padding:28px 0 18px}}.library-hero h1{{margin:10px 0 18px}}.library-hero>p{{max-width:650px;color:#c6bfb7;font-size:18px}}.search{{display:flex;max-width:800px;margin-top:34px;padding:7px;border:1px solid #ffffff25;border-radius:18px;background:#15151b;box-shadow:0 24px 70px #0007}}.search input{{flex:1;min-width:0;border:0;background:transparent;color:#fff;padding:14px 16px;font:inherit;outline:0}}.search button,.more-link,.reset-link{{border:0;border-radius:11px;background:#d9b966;color:#17130d;padding:13px 24px;text-decoration:none;font-weight:800;cursor:pointer}}.filters{{display:flex;gap:9px;overflow-x:auto;margin:28px 0 56px}}.filters a{{flex:0 0 auto;border:1px solid #ffffff18;border-radius:999px;padding:8px 15px;background:#121217;color:#bdb6ad;text-decoration:none;font-size:13px}}.filters a.active{{border-color:#d9b96670;background:#d9b96617;color:#f4d989}}.section-heading{{margin:58px 0 22px}}.section-heading span{{color:#8f8982;text-transform:uppercase;letter-spacing:.15em;font-size:10px;font-weight:800}}.section-heading h2{{margin:4px 0;font:500 38px/1.1 Georgia}}.grid{{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:20px}}.card{{overflow:hidden;border:1px solid #ffffff13;border-radius:21px;background:linear-gradient(145deg,#141419,#0f0f14)}}.card>a{{display:block;aspect-ratio:16/10;overflow:hidden;background:radial-gradient(circle at 30% 20%,#79512b88,transparent 42%),#15151b}}.card>a img{{width:100%;height:100%;object-fit:cover}}.card-content{{padding:22px}}.card h3{{margin:8px 0 10px;font:500 24px/1.12 Georgia}}.card h3 a{{text-decoration:none}}.card p{{color:#aaa39a;font-size:14px}}.card-meta{{display:flex;flex-wrap:wrap;gap:6px 12px;color:#817b74;font-size:11px}}.read-link{{display:inline-block;margin-top:15px;color:#e1c779;text-decoration:none;font-size:13px;font-weight:800}}.pagination{{display:flex;justify-content:center;gap:12px;margin-top:40px}}.empty{{margin:60px 0;padding:70px 22px;border:1px dashed #ffffff1d;border-radius:18px;text-align:center;color:#aaa39a}}.empty h2{{color:#fff;font:500 34px Georgia}}.article{{max-width:820px;margin:auto}}.article-header{{text-align:center}}.article-header h1{{margin:10px 0 20px}}.article-lede{{color:#c8c1b8;font:20px/1.6 Georgia}}.article-meta{{display:flex;justify-content:center;flex-wrap:wrap;gap:8px 18px;color:#8f8982;font-size:12px}}.cover{{width:100%;max-height:540px;object-fit:cover;border-radius:24px;margin:45px 0;box-shadow:0 30px 80px #0008}}.toc{{margin:35px 0;padding:20px;border:1px solid #ffffff15;border-radius:14px;background:#111117}}.toc strong{{display:block;margin-bottom:8px}}.toc a{{display:block;color:#aaa39a;font-size:13px}}.article-body{{color:#d7d1ca;font:17px/1.9 Georgia}}.article-body h2,.article-body h3{{scroll-margin-top:90px;color:#fff;line-height:1.2}}.article-body h2{{margin:2em 0 .7em;font-size:34px}}.article-body h3{{font-size:25px}}.article-body a{{color:#e1c779}}.article-body img{{display:block;max-width:100%;margin:30px auto;border-radius:14px}}blockquote{{border-left:3px solid #d5b76c;margin:2em 0;padding-left:1.25em;color:#eee7dc;font-size:20px;font-style:italic}}.ctas{{display:grid;gap:14px;margin-top:45px}}.cta{{display:grid;gap:5px;border:1px solid #ffffff17;border-radius:17px;padding:22px;background:#121217;text-decoration:none}}.cta.gold{{border-color:#d9b96645;background:#211b13}}.cta small{{color:#8f8982;text-transform:uppercase;letter-spacing:.14em}}.cta strong{{font:500 21px Georgia}}.cta em{{color:#d9b966;font-style:normal}}.related{{margin-top:80px}}@media(max-width:850px){{.grid{{grid-template-columns:repeat(2,minmax(0,1fr))}}}}@media(max-width:600px){{.site-header{{padding:0 16px}}.site-header nav{{gap:13px}}.site-header nav a{{font-size:11px}}main{{padding:38px 17px 72px}}.search{{display:grid}}.filters{{margin-bottom:42px}}.grid{{grid-template-columns:1fr}}.article-header h1{{font-size:48px}}.cover{{margin:32px 0;border-radius:16px}}}}
</style></head><body>{site_header}{body}</body></html>""",
        headers={"Cache-Control": "no-cache"},
    )


def _article_library(
    db: Session,
    category: str | None = None,
    search: str = "",
    page: int = 1,
):
    page_size = 9
    query = (
        db.query(Article, ArticleVersion)
        .join(ArticleVersion, ArticleVersion.id == Article.published_version_id)
        .filter(Article.status == "published", Article.published_version_id.is_not(None))
    )
    if category:
        query = query.filter(Article.published_category == category)
    clean_search = search.strip()[:160]
    if clean_search:
        pattern = f"%{clean_search.casefold()}%"
        query = query.filter(or_(
            func.lower(ArticleVersion.title).like(pattern),
            func.lower(ArticleVersion.excerpt).like(pattern),
            func.lower(ArticleVersion.body).like(pattern),
        ))
    total = query.count()
    rows = (
        query.order_by(Article.published_at.desc(), Article.id.desc())
        .offset((max(1, page) - 1) * page_size)
        .limit(page_size)
        .all()
    )

    def card(article: Article, version: ArticleVersion) -> str:
        image = (
            f'<img src="{escape(version.cover_image, quote=True)}" '
            f'alt="{escape(version.cover_alt or version.title, quote=True)}">'
            if version.cover_image else ""
        )
        minutes = estimated_reading_minutes(version.body, version.body_format)
        updated = version.created_at.date().strftime("%d %b %Y").lstrip("0") if version.created_at else ""
        return (
            f'<article class="card"><a href="/articles/{quote(version.slug)}/">{image}</a>'
            f'<div class="card-content"><span class="eyebrow">{escape(version.category)}</span>'
            f'<h3><a href="/articles/{quote(version.slug)}/">{escape(version.title)}</a></h3>'
            f'<p>{escape(version.excerpt)}</p><div class="card-meta"><span>By {escape(version.author)}</span>'
            f'<span>{updated}</span><span>{minutes} min read</span></div>'
            f'<a class="read-link" href="/articles/{quote(version.slug)}/">Read article →</a></div></article>'
        )

    cards = [card(article, version) for article, version in rows]
    featured = []
    if page == 1 and not clean_search:
        feature_query = (
            db.query(Article, ArticleVersion)
            .join(ArticleVersion, ArticleVersion.id == Article.published_version_id)
            .filter(Article.status == "published", Article.published_featured.is_(True))
        )
        if category:
            feature_query = feature_query.filter(Article.published_category == category)
        featured = [card(article, version) for article, version in feature_query.order_by(Article.published_at.desc()).limit(3).all()]
    heading = category or "Articles"
    category_path = next((slug for slug, name in CATEGORY_SLUGS.items() if name == category), None)
    path = f"/articles/category/{category_path}/" if category_path else "/articles/"
    crumbs = [
        {"@type": "ListItem", "position": 1, "name": "Home", "item": f"{SITE}/"},
        {"@type": "ListItem", "position": 2, "name": "Articles", "item": f"{SITE}/articles/"},
    ]
    if category:
        crumbs.append({"@type": "ListItem", "position": 3, "name": category, "item": f"{SITE}{path}"})
    query_string = f"?{urlencode({'q': clean_search})}" if clean_search else ""
    filters = [f'<a class="{"" if category else "active"}" href="/articles/{query_string}">All</a>']
    for slug, label in CATEGORY_SLUGS.items():
        suffix = f"?{urlencode({'q': clean_search})}" if clean_search else ""
        filters.append(f'<a class="{"active" if category == label else ""}" href="/articles/category/{slug}/{suffix}">{escape(label)}</a>')
    next_query = {"q": clean_search, "page": page + 1}
    prev_query = {"q": clean_search, "page": page - 1}
    next_query = {key: value for key, value in next_query.items() if value}
    prev_query = {key: value for key, value in prev_query.items() if value and value != 1}
    page_links = []
    if page > 1:
        page_links.append(f'<a class="more-link" href="{path}?{urlencode(prev_query)}">← Newer</a>')
    if page * page_size < total:
        page_links.append(f'<a class="more-link" href="{path}?{urlencode(next_query)}">More articles →</a>')
    empty = (
        '<section class="empty"><h2>No articles matched that search.</h2>'
        '<p>Try a broader phrase or reset the library.</p>'
        f'<a class="reset-link" href="{path}">Reset search</a></section>'
    )
    heading = category or "Guidance for the questions that stay with you."
    body = (
        '<main><div class="crumbs"><a href="/">Home</a><span>/</span><span>Articles</span></div>'
        f'<header class="library-hero"><span class="eyebrow">The Ask Valentina library</span><h1>{escape(heading)}</h1>'
        '<p>Thoughtful, grounded reading on numerology, tarot, relationships and spiritual life.</p>'
        f'<form class="search" action="{path}" method="get"><input type="search" name="q" value="{escape(clean_search, quote=True)}" '
        'placeholder="Search a question, topic or number…" aria-label="Search articles"><button type="submit">Search</button></form></header>'
        f'<nav class="filters" aria-label="Article categories">{"".join(filters)}</nav>'
        + (
            f'<section><div class="section-heading"><span>Chosen for you</span><h2>Featured</h2></div><div class="grid">{"".join(featured)}</div></section>'
            if featured else ""
        )
        + (
            f'<section><div class="section-heading"><span>{total} article{"s" if total != 1 else ""}</span>'
            f'<h2>{"Search results for “" + escape(clean_search) + "”" if clean_search else "Recent articles"}</h2></div>'
            f'<div class="grid">{"".join(cards)}</div><div class="pagination">{"".join(page_links)}</div></section>'
            if cards else empty
        )
        + "</main>"
    )
    breadcrumb = {"@context": "https://schema.org", "@type": "BreadcrumbList", "itemListElement": crumbs}
    title = f"{heading} Articles | Ask Valentina" if category else "Articles | Ask Valentina"
    description = (
        f"Read {category.lower()} guidance from Ask Valentina."
        if category else "Numerology, tarot and relationship guidance from Ask Valentina."
    )
    return _document(
        _head(
            title,
            description,
            f"{SITE}{path}",
            kind="website",
            robots="index,follow" if cards else "noindex,follow",
            json_ld=[breadcrumb],
        ),
        body,
    )


@router.get("/articles/", response_class=HTMLResponse)
def article_library(q: str = "", page: int = 1, db: Session = Depends(get_db)):
    return _article_library(db, search=q, page=max(1, page))


@router.get("/articles/category/{category_slug}/", response_class=HTMLResponse)
def article_category(category_slug: str, q: str = "", page: int = 1, db: Session = Depends(get_db)):
    category = CATEGORY_SLUGS.get(category_slug)
    if not category:
        raise HTTPException(404, "Article category not found.")
    return _article_library(db, category, q, max(1, page))


@router.get("/articles/{slug}/", response_class=HTMLResponse)
def article_page(slug: str, db: Session = Depends(get_db)):
    article = db.query(Article).filter_by(published_slug=slug, status="published").first()
    if not article or not article.published_version_id:
        redirect = db.query(ArticleSlugRedirect).filter_by(old_slug=slug).first()
        target = db.get(Article, redirect.article_id) if redirect else None
        if target and target.status == "published" and target.published_slug:
            return RedirectResponse(f"/articles/{quote(target.published_slug)}/", status_code=308)
        raise HTTPException(404, "Article not found.")
    version = db.get(ArticleVersion, article.published_version_id)
    canonical = version.canonical_override or f"{SITE}/articles/{version.slug}/"
    social = version.social_image or version.cover_image
    if social and social.startswith("/"):
        social = f"{SITE}{social}"
    article_ld = {
        "@context": "https://schema.org",
        "@type": "Article",
        "headline": version.title,
        "description": version.excerpt,
        "author": {"@type": "Person", "name": version.author},
        "datePublished": article.published_at.isoformat() if article.published_at else None,
        "dateModified": version.created_at.isoformat() if version.created_at else None,
        "mainEntityOfPage": canonical,
    }
    if version.cover_image:
        article_ld["image"] = f"{SITE}{version.cover_image}" if version.cover_image.startswith("/") else version.cover_image
    breadcrumb = {
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        "itemListElement": [
            {"@type": "ListItem", "position": 1, "name": "Home", "item": f"{SITE}/"},
            {"@type": "ListItem", "position": 2, "name": "Articles", "item": f"{SITE}/articles/"},
            {"@type": "ListItem", "position": 3, "name": version.title, "item": canonical},
        ],
    }
    published_iso = article.published_at.date().isoformat() if article.published_at else ""
    updated_iso = version.created_at.date().isoformat() if version.created_at else ""
    published_text = article.published_at.date().strftime("%d %b %Y").lstrip("0") if article.published_at else ""
    updated_text = version.created_at.date().strftime("%d %b %Y").lstrip("0") if version.created_at else ""
    cover = (
        f'<img class="cover" src="{escape(version.cover_image, quote=True)}" '
        f'alt="{escape(version.cover_alt or version.title, quote=True)}">'
        if version.cover_image else ""
    )
    rendered, toc = render_article_body(version.body, version.body_format)
    toc_html = ""
    if len(toc) > 1:
        toc_html = '<nav class="toc" aria-label="In this article"><strong>In this article</strong>' + "".join(
            f'<a href="#{escape(str(item["id"]), quote=True)}">{escape(str(item["text"]))}</a>'
            for item in toc
        ) + "</nav>"
    series = (
        f'<p>{escape(version.series_name)}'
        f'{" · Part " + str(version.series_part) if version.series_part else ""}</p>'
        if version.series_name else ""
    )
    ctas = []
    if version.calculator_cta:
        ctas.append('<a class="cta gold" href="/numerology/calculator/"><small>Free numerology tool</small><strong>Discover the pattern in your date of birth</strong><em>Try the calculator →</em></a>')
    if version.reading_cta:
        ctas.append('<a class="cta" href="/psychics-browse"><small>Personal guidance</small><strong>Bring your own question to a human reader</strong><em>Explore readings →</em></a>')
    wanted = json.loads(version.related_slugs or "[]")
    related_query = db.query(Article).filter(Article.status == "published", Article.id != article.id)
    related_articles = related_query.filter(Article.published_slug.in_(wanted)).limit(3).all() if wanted else []
    if not related_articles:
        related_articles = related_query.filter(Article.published_category == version.category).order_by(Article.published_at.desc()).limit(3).all()
    related_cards = []
    for related_article in related_articles:
        related_version = db.get(ArticleVersion, related_article.published_version_id)
        if not related_version:
            continue
        related_image = (
            f'<img src="{escape(related_version.cover_image, quote=True)}" '
            f'alt="{escape(related_version.cover_alt or related_version.title, quote=True)}">'
            if related_version.cover_image else ""
        )
        related_cards.append(
            f'<article class="card"><a href="/articles/{quote(related_version.slug)}/">{related_image}</a>'
            f'<div class="card-content"><span class="eyebrow">{escape(related_version.category)}</span>'
            f'<h3><a href="/articles/{quote(related_version.slug)}/">{escape(related_version.title)}</a></h3>'
            f'<p>{escape(related_version.excerpt)}</p><a class="read-link" href="/articles/{quote(related_version.slug)}/">Read article →</a></div></article>'
        )
    related = (
        '<section class="related"><div class="section-heading"><span>Keep reading</span>'
        f'<h2>Related articles</h2></div><div class="grid">{"".join(related_cards)}</div></section>'
        if related_cards else ""
    )
    body = (
        '<main><div class="crumbs"><a href="/">Home</a><span>/</span><a href="/articles/">Articles</a>'
        f'<span>/</span><span>{escape(version.category)}</span></div><article class="article">'
        f'<header class="article-header"><span class="eyebrow">{escape(version.category)}</span>{series}'
        f'<h1>{escape(version.title)}</h1><p class="article-lede">{escape(version.excerpt)}</p>'
        f'<div class="article-meta"><span>By {escape(version.author)}</span>'
        f'<span>Published <time datetime="{published_iso}">{published_text}</time></span>'
        f'<span>Updated <time datetime="{updated_iso}">{updated_text}</time></span>'
        f'<span>{estimated_reading_minutes(version.body, version.body_format)} min read</span></div></header>'
        f'{cover}{toc_html}<div class="article-body">{rendered}</div>'
        f'<div class="ctas">{"".join(ctas)}</div></article>{related}</main>'
    )
    return _document(
        _head(
            version.seo_title,
            version.meta_description,
            canonical,
            image=social,
            json_ld=[article_ld, breadcrumb],
        ),
        body,
    )


@router.get("/sitemap.xml")
def dynamic_sitemap(db: Session = Depends(get_db)):
    slugs = [
        row[0]
        for row in db.query(Article.published_slug)
        .filter(Article.status == "published", Article.published_slug.is_not(None))
        .order_by(Article.published_slug)
        .all()
    ]
    published_categories = {
        row[0]
        for row in db.query(Article.published_category)
        .filter(Article.status == "published", Article.published_category.is_not(None))
        .distinct()
        .all()
    }
    category_paths = [
        f"/articles/category/{slug}/"
        for slug, name in CATEGORY_SLUGS.items()
        if name in published_categories
    ]
    urls = [f"{SITE}{path}" for path in [*FIXED_PATHS, *category_paths]]
    urls += [f"{SITE}/articles/{slug}/" for slug in slugs]
    unique = list(dict.fromkeys(urls))
    xml = (
        '<?xml version="1.0" encoding="UTF-8"?><urlset '
        'xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'
        + "".join(f"<url><loc>{escape(url)}</loc></url>" for url in unique)
        + "</urlset>"
    )
    return Response(xml, media_type="application/xml", headers={"Cache-Control": "no-cache"})
