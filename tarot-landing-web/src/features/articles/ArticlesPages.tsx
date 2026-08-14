import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import Seo from "../../components/Seo";
import axiosClient from "../../lib/axiosClient";
import "../../styles/glass.css";
import "./articles.css";

type TocItem = { level: number; text: string; id: string };
type Article = {
  id: number;
  slug: string;
  category: string;
  title: string;
  excerpt: string;
  body_html?: string;
  author: string;
  published_at: string;
  updated_at: string;
  seo_title: string;
  meta_description: string;
  canonical_override?: string | null;
  cover_image?: string | null;
  cover_alt?: string | null;
  social_image?: string | null;
  calculator_cta?: string;
  reading_cta?: string;
  related?: Article[];
  toc?: TocItem[];
  reading_minutes: number;
  series_name?: string | null;
  series_part?: number | null;
};

type ArticlePage = {
  items: Article[];
  featured: Article[];
  total: number;
  page: number;
  page_size: number;
  has_more: boolean;
};

const categoryPaths: Record<string, string> = {
  numerology: "Numerology",
  tarot: "Tarot",
  "love-and-relationships": "Love & Relationships",
  "psychic-guidance": "Psychic Guidance",
};

const API_ORIGIN = String(import.meta.env.VITE_API_URL ?? "").replace(/\/$/, "");
const mediaUrl = (value?: string | null) =>
  value?.startsWith("/") ? `${API_ORIGIN}${value}` : value || "";
const categorySlugFor = (category: string) =>
  Object.entries(categoryPaths).find(([, label]) => label === category)?.[0] ?? "";
const dateLabel = (value: string) =>
  new Date(value).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

function ArticleCard({ article, featured = false }: { article: Article; featured?: boolean }) {
  return (
    <article className={`gl-panel article-card${featured ? " article-card--featured" : ""}`}>
      <Link className="article-card__image" to={`/articles/${article.slug}/`} aria-label={`Read ${article.title}`}>
        {article.cover_image ? (
          <img src={mediaUrl(article.cover_image)} alt={article.cover_alt || article.title} />
        ) : (
          <div className="article-card__placeholder" aria-hidden="true"><span>Ask Valentina</span></div>
        )}
      </Link>
      <div className="article-card__content">
        <div className="gl-tags"><span className="gl-tag">{article.category}</span></div>
        <h2 className="article-card__title"><Link to={`/articles/${article.slug}/`}>{article.title}</Link></h2>
        <p className="article-card__excerpt gl-td">{article.excerpt}</p>
        <div className="article-card__meta gl-tf">
          <span>By {article.author}</span>
          <span>{dateLabel(article.updated_at || article.published_at)}</span>
          <span>{article.reading_minutes} min read</span>
        </div>
        <Link className="article-read-link" to={`/articles/${article.slug}/`}>Read article <span aria-hidden="true">→</span></Link>
      </div>
    </article>
  );
}

export function ArticlesLibrary() {
  const { categorySlug } = useParams();
  const routeCategory = categorySlug ? categoryPaths[categorySlug] : undefined;
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const query = params.get("q")?.trim() ?? "";
  const [searchText, setSearchText] = useState(query);
  const [data, setData] = useState<ArticlePage | null>(null);
  const [items, setItems] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => setSearchText(query), [query]);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    axiosClient.get<ArticlePage>("/articles", {
      params: { q: query || undefined, category: routeCategory, page: 1, page_size: 9 },
      signal: controller.signal,
    }).then((response) => {
      setData(response.data);
      setItems(response.data.items);
    }).catch((reason) => {
      if (reason?.code !== "ERR_CANCELED") {
        setData(null);
        setItems([]);
        setError("We could not open the article library just now. Please try again.");
      }
    }).finally(() => setLoading(false));
    return () => controller.abort();
  }, [query, routeCategory]);

  const submitSearch = (event: FormEvent) => {
    event.preventDefault();
    const next = new URLSearchParams();
    if (searchText.trim()) next.set("q", searchText.trim());
    navigate(`${categorySlug ? `/articles/category/${categorySlug}/` : "/articles/"}${next.size ? `?${next}` : ""}`);
  };
  const resetSearch = () => {
    setSearchText("");
    navigate(categorySlug ? `/articles/category/${categorySlug}/` : "/articles/");
  };
  const loadMore = async () => {
    if (!data?.has_more || loadingMore) return;
    setLoadingMore(true);
    setError("");
    try {
      const response = await axiosClient.get<ArticlePage>("/articles", {
        params: {
          q: query || undefined,
          category: routeCategory,
          page: data.page + 1,
          page_size: data.page_size,
        },
      });
      setData(response.data);
      setItems((current) => [...current, ...response.data.items]);
    } catch {
      setError("More articles could not be loaded. Nothing already on this page was lost.");
    } finally {
      setLoadingMore(false);
    }
  };

  const path = categorySlug ? `/articles/category/${categorySlug}` : "/articles";
  const title = routeCategory ? `${routeCategory} Articles | Ask Valentina` : "Articles | Ask Valentina";
  const description = routeCategory
    ? `Read ${routeCategory.toLowerCase()} guidance from Ask Valentina.`
    : "Explore practical numerology, tarot, love and psychic guidance from Ask Valentina.";
  const featuredSlugs = new Set((data?.featured ?? []).map((article) => article.slug));
  const recentItems = items.filter((article) => !featuredSlugs.has(article.slug));
  const crumbs = [
    { "@type": "ListItem", position: 1, name: "Home", item: "https://askvalentina.co.uk/" },
    { "@type": "ListItem", position: 2, name: "Articles", item: "https://askvalentina.co.uk/articles/" },
    ...(routeCategory ? [{ "@type": "ListItem", position: 3, name: routeCategory, item: `https://askvalentina.co.uk${path}/` }] : []),
  ];

  return (
    <main className="articles-shell">
      <Seo meta={{
        path,
        canonical: `https://askvalentina.co.uk${path}/`,
        title,
        description,
        robots: categorySlug && !routeCategory ? "noindex,nofollow" : "index,follow",
        jsonLd: [{ "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: crumbs }],
      }} />
      <header className="gl-hero articles-hero">
        <nav className="article-breadcrumb" aria-label="Breadcrumb"><Link to="/">Home</Link><span>/</span><span>Articles</span></nav>
        <div className="gl-hero-panel--solid articles-hero-panel">
          <div className="gl-kicker">The Ask Valentina library</div>
          <h1 className="gl-h1">{routeCategory ?? <>Guidance for the questions <i>that stay with you.</i></>}</h1>
          <p className="gl-sub">Thoughtful, grounded reading on numerology, tarot, relationships and spiritual life.</p>
          <form className="gl-search" onSubmit={submitSearch} role="search">
            <label className="sr-only" htmlFor="article-search-input">Search articles</label>
            <input
              id="article-search-input"
              type="search"
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
              placeholder="Search a question, topic or number…"
            />
            <button className="gl-search-btn" type="submit">Search</button>
          </form>
        </div>
      </header>

      <nav className="gl-filters" aria-label="Article categories">
        <Link className={`gl-fchip${!routeCategory ? " gl-fchip--on" : ""}`} to={query ? `/articles/?q=${encodeURIComponent(query)}` : "/articles/"}>All</Link>
        {Object.entries(categoryPaths).map(([slug, label]) => (
          <Link
            className={`gl-fchip${routeCategory === label ? " gl-fchip--on" : ""}`}
            key={slug}
            to={`/articles/category/${slug}/${query ? `?q=${encodeURIComponent(query)}` : ""}`}
          >{label}</Link>
        ))}
      </nav>

      {loading ? (
        <section className="gl-state" aria-live="polite"><div className="article-loader" /><h2 className="gl-h3">Opening the library…</h2></section>
      ) : error && !items.length ? (
        <section className="gl-state" role="alert"><h2 className="gl-h3">We hit a quiet patch.</h2><p>{error}</p><button className="gl-btn-solid" onClick={resetSearch}>Try the library again</button></section>
      ) : !items.length ? (
        <section className="gl-state">
          <span className="article-state-glyph" aria-hidden="true">✦</span><h2 className="gl-h3">No articles matched that search.</h2>
          <p>Try a broader phrase or reset the filters to browse everything.</p>
          <button className="gl-btn-solid" onClick={resetSearch}>Reset search</button>
        </section>
      ) : (
        <>
          {!query && data?.featured?.length ? (
            <section className="articles-section">
              <div className="articles-section__heading"><span className="gl-kicker">Chosen for you</span><h2 className="gl-h2">Featured</h2></div>
              <div className="article-feature-grid">{data.featured.map((article) => <ArticleCard article={article} featured key={article.slug} />)}</div>
            </section>
          ) : null}
          <section className="articles-section">
            <div className="articles-section__heading">
              <span className="gl-kicker">{query ? `${data?.total ?? 0} result${data?.total === 1 ? "" : "s"}` : "Fresh from the library"}</span>
              <h2 className="gl-h2">{query ? `Search results for “${query}”` : "Recent articles"}</h2>
            </div>
            <div className="article-card-grid">{(recentItems.length ? recentItems : items).map((article) => <ArticleCard article={article} key={article.slug} />)}</div>
            {data?.has_more ? <button className="gl-btn-solid article-load-more" onClick={loadMore} disabled={loadingMore}>{loadingMore ? "Loading…" : "Load more articles"}</button> : null}
            {error ? <p className="article-inline-error" role="alert">{error}</p> : null}
          </section>
        </>
      )}
    </main>
  );
}

export function ArticleDetail() {
  const { slug } = useParams();
  const [item, setItem] = useState<Article | null>(null);
  const [missing, setMissing] = useState(false);
  const [shareNotice, setShareNotice] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    setItem(null);
    setMissing(false);
    axiosClient.get<Article>(`/articles/${slug}`, { signal: controller.signal })
      .then((response) => setItem(response.data))
      .catch((reason) => { if (reason?.code !== "ERR_CANCELED") setMissing(true); });
    return () => controller.abort();
  }, [slug]);

  const share = async () => {
    const url = window.location.href;
    try {
      if (navigator.share) await navigator.share({ title: item?.title, url });
      else {
        await navigator.clipboard.writeText(url);
        setShareNotice("Link copied");
      }
    } catch {
      // Closing the native share sheet is not an error worth surfacing.
    }
  };

  if (missing) return <main className="article-reading-shell"><Seo meta={{ path: `/articles/${slug}`, title: "Article not found | Ask Valentina", description: "This article is not available.", robots: "noindex,nofollow" }} /><div className="gl-state"><h1 className="gl-h2">Article not found</h1><p><Link className="gl-btn-ghost article-state-link" to="/articles/">Return to Articles</Link></p></div></main>;
  if (!item) return <main className="article-reading-shell"><Seo meta={{ path: `/articles/${slug}`, title: "Opening article | Ask Valentina", description: "Opening this Ask Valentina article.", robots: "noindex,nofollow" }} /><div className="gl-state"><div className="article-loader" /><p>Opening article…</p></div></main>;

  const canonical = item.canonical_override || `https://askvalentina.co.uk/articles/${item.slug}/`;
  const image = mediaUrl(item.social_image || item.cover_image);
  const articleJson = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: item.title,
    description: item.excerpt,
    author: { "@type": "Person", name: item.author },
    datePublished: item.published_at,
    dateModified: item.updated_at,
    mainEntityOfPage: canonical,
    ...(image ? { image } : {}),
  };
  const breadcrumbJson = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: "https://askvalentina.co.uk/" },
      { "@type": "ListItem", position: 2, name: "Articles", item: "https://askvalentina.co.uk/articles/" },
      { "@type": "ListItem", position: 3, name: item.title, item: canonical },
    ],
  };

  return (
    <main className="article-reading-shell">
      <Seo meta={{ path: `/articles/${item.slug}`, canonical, title: item.seo_title, description: item.meta_description, ogType: "article", ogImage: image || undefined, jsonLd: [articleJson, breadcrumbJson] }} />
      <nav className="article-breadcrumb" aria-label="Breadcrumb"><Link to="/">Home</Link><span>/</span><Link to="/articles/">Articles</Link><span>/</span><Link to={`/articles/category/${categorySlugFor(item.category)}/`}>{item.category}</Link></nav>
      <article className="article-page">
        <header className="gl-hero-panel--solid article-page__header">
          <span className="gl-kicker">{item.category}</span>
          {item.series_name ? <p className="article-series">{item.series_name}{item.series_part ? ` · Part ${item.series_part}` : ""}</p> : null}
          <h1 className="gl-h1">{item.title}</h1>
          <p className="article-lede">{item.excerpt}</p>
          <div className="article-byline gl-tf">
            <span>By {item.author}</span>
            <span>Published {dateLabel(item.published_at)}</span>
            <span>Updated {dateLabel(item.updated_at)}</span>
            <span>{item.reading_minutes} min read</span>
          </div>
        </header>
        {item.cover_image ? <img className="article-cover" src={mediaUrl(item.cover_image)} alt={item.cover_alt || item.title} /> : null}
        <div className="article-reading-layout">
          {item.toc && item.toc.length > 1 ? (
            <aside className="article-toc"><strong>In this article</strong>{item.toc.map((heading) => <a key={heading.id} className={heading.level === 3 ? "nested" : ""} href={`#${heading.id}`}>{heading.text}</a>)}</aside>
          ) : null}
          <div className="gl-panel article-reading-main">
            {/* body_html is allowlist-sanitized by the article API before every render. */}
            <div className="article-body" dangerouslySetInnerHTML={{ __html: item.body_html || "" }} />
            <div className="article-share"><span>Found this useful?</span><button className="gl-btn-ghost" onClick={share}>Share article</button>{shareNotice && <small role="status">{shareNotice}</small>}</div>
            <div className="article-ctas">
              {item.calculator_cta && <Link className="article-cta article-cta--gold" to="/numerology/calculator/" onClick={() => window.dispatchEvent(new CustomEvent("analytics", { detail: { event: "article_to_calculator" } }))}><span>Free numerology tool</span><strong>Discover the pattern in your date of birth</strong><em>Try the calculator →</em></Link>}
              {item.reading_cta && <Link className="article-cta" to="/psychics-browse"><span>Personal guidance</span><strong>Bring your own question to a human reader</strong><em>Explore readings →</em></Link>}
            </div>
          </div>
        </div>
      </article>
      {item.related?.length ? (
        <section className="articles-section article-related">
          <div className="articles-section__heading"><span className="gl-kicker">Keep reading</span><h2 className="gl-h2">Related articles</h2></div>
          <div className="article-card-grid">{item.related.map((article) => <ArticleCard article={article} key={article.slug} />)}</div>
        </section>
      ) : null}
    </main>
  );
}
