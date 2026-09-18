/* The reading screen for an article post on Home: the public article, fetched
   the way the site's article page fetches it, drawn in the app's column on the
   living sky. No marketing layout, no related articles. */
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import type { Article } from "@/features/articles/ArticlesPages";
import { resolveLibraryMediaUrl } from "@/features/sanctuary/api/libraryItemsApi";
import axiosClient from "@/lib/axiosClient";
import { HOME_PATH } from "./clientAppPaths";
import { dayOf } from "./ukTime";
import "./client-chats.css";
import "./client-readers.css";
import "./client-home.css";

export default function ClientArticleScreen() {
  const { slug } = useParams();
  // The answer remembers which slug it belongs to, so a new slug reads as
  // loading until its own answer arrives.
  const [answer, setAnswer] = useState<{ slug: string | undefined; article: Article | null } | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    axiosClient.get<Article>(`/articles/${slug}`, { signal: controller.signal })
      .then((response) => setAnswer({ slug, article: response.data }))
      .catch((reason) => { if (reason?.code !== "ERR_CANCELED") setAnswer({ slug, article: null }); });
    return () => controller.abort();
  }, [slug]);
  const current = answer?.slug === slug ? answer : null;
  const item = current?.article ?? null;

  if (current && !item) return (
    <Column slug={slug}>
      <div className="client-chats-empty">
        <p role="alert">This post could not be opened.</p>
        <Link to={HOME_PATH}>Back to Home</Link>
      </div>
    </Column>
  );
  if (!item) return <Column slug={slug}><p className="client-chats-notice" role="status">Loading…</p></Column>;
  const cover = resolveLibraryMediaUrl(item.cover_image);
  return (
    <Column slug={slug}>
      <article className="client-home-article" aria-label={item.title}>
        {cover && <span className="client-home-article-cover"><img src={cover} alt={item.cover_alt || item.title} /></span>}
        <time className="client-home-meta" dateTime={item.published_at}>{dayOf(item.published_at)}</time>
        <h1 className="client-home-article-title">{item.title}</h1>
        {/* body_html is allowlist-sanitized by the article API before every render. */}
        <div className="article-body" dangerouslySetInnerHTML={{ __html: item.body_html || "" }} />
      </article>
    </Column>
  );
}

/* The way back at the top left, then the column. The content area is the
   shell's one scroller, shared with the feed, so a new post opens at its top.
   Back steps back through history, so the feed returns with its search and
   kind still in the URL; a post opened straight from a link has nothing
   behind it in the app and goes to Home. */
function Column({ slug, children }: { slug: string | undefined; children: ReactNode }) {
  const navigate = useNavigate();
  const { key } = useLocation();
  const back = () => (key === "default" ? navigate(HOME_PATH) : navigate(-1));
  const column = useRef<HTMLElement>(null);
  useEffect(() => { column.current?.closest(".client-app-content")?.scrollTo(0, 0); }, [slug]);
  return (
    <section className="client-home" aria-label="Post" ref={column}>
      <div className="client-reader-profile-top">
        <button type="button" className="client-reader-back" aria-label="Back to Home" onClick={back}>‹</button>
      </div>
      {children}
    </section>
  );
}
