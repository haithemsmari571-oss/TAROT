/* The Home tab: the Sanctuary's library and the public articles as one feed,
   newest first, on the shell's living sky. The data, the covers and the player
   are the Sanctuary's own (useLibraryItems, cover.tsx, SanctuaryPlayerProvider).
   A post with audio plays in the Sanctuary's now-playing view; an article opens
   in the app's reading screen. A search field and the kind chips filter the
   loaded posts in memory; both live in the URL (q and kind), so a reload and
   the way back from a reading screen keep them. */
import { useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useNavigationType, useSearchParams } from "react-router-dom";
import { ARTICLE_KEY_PREFIX, type SanctuaryBrowseItem } from "@/features/sanctuary/api/libraryItemsApi";
import { Cover } from "@/features/sanctuary/cover";
import { useLibraryItems } from "@/features/sanctuary/hooks/useLibraryItems";
import { useSanctuaryPlayer } from "@/features/sanctuary/SanctuaryPlayerProvider";
import { sanitizeClaims } from "@/lib/copy";
import { HOME_PATH } from "./clientAppPaths";
import { formatHomeDuration } from "./homeDuration";
import { dayOf } from "./ukTime";
import "./client-chats.css";
import "./client-home.css";

const readPath = (slug: string) => `${HOME_PATH}/read/${slug}`;

/* Newest first. Array sort is stable, so posts published at the same moment
   keep the order the Sanctuary gives them. */
const newestFirst = (items: SanctuaryBrowseItem[]) => [...items].sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt));

/* The search params the feed's filter lives in, and the chip that clears the kind. */
const QUERY_PARAM = "q";
const KIND_PARAM = "kind";
const EVERYTHING = "Everything";
/* Marks the feed's own URL writes, told apart from a Home tab press or a history move. */
const FROM_SEARCH = { homeSearch: true };
const isFromSearch = (state: unknown) => (state as typeof FROM_SEARCH | null)?.homeSearch === true;

/* Trimmed, lower-cased, diacritics stripped: "Méditation " finds "meditation". */
const fold = (text: string | null) => (text ?? "").trim().toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");
const matches = (item: SanctuaryBrowseItem, query: string) =>
  [item.title, item.description, item.type].some(field => fold(field).includes(query));

function Post({ item, onActivate }: { item: SanctuaryBrowseItem; onActivate: (item: SanctuaryBrowseItem) => void }) {
  const duration = formatHomeDuration(item.durationSeconds);
  const verb = item.audioUrl ? "Listen" : "Read";
  return (
    <li>
      <button type="button" className="client-home-post" onClick={() => onActivate(item)} aria-label={`${verb}: ${item.title}`} data-home-key={item.key}>
        <span className="client-home-cover"><Cover item={item} /></span>
        <span className="client-home-copy">
          <span className="client-home-meta">{item.type}{duration && ` · ${duration}`}{` · ${dayOf(item.publishedAt)}`}</span>
          <span className="client-home-title">{item.title}</span>
          <span className="client-home-description">{sanitizeClaims(item.description)}</span>
          <span className="client-home-verb" aria-hidden="true">{verb}</span>
        </span>
      </button>
    </li>
  );
}

export default function ClientHomeScreen() {
  const navigate = useNavigate();
  const { items, loading, error, refetch } = useLibraryItems();
  const { playItem } = useSanctuaryPlayer();
  const posts = useMemo(() => newestFirst(items), [items]);
  // Derived from the data the way the Sanctuary derives its chips, in the order the feed shows them.
  const kinds = useMemo(() => Array.from(new Set(posts.map(item => item.type))), [posts]);

  const [searchParams, setSearchParams] = useSearchParams();
  const query = searchParams.get(QUERY_PARAM) ?? "";
  const kind = searchParams.get(KIND_PARAM);
  const needle = fold(query);
  const filtering = needle !== "" || kind !== null;
  const shown = posts.filter(item => (kind === null || item.type === kind) && (needle === "" || matches(item, needle)));

  /* The router commits URL changes in a transition, so the field keeps its own
     copy of the text and writes it through. The copy follows the URL only when
     something other than the field moved it (the Home tab, a history move). */
  const location = useLocation();
  const navigationType = useNavigationType();
  const [draft, setDraft] = useState(query);
  const field = useRef<HTMLInputElement>(null);
  const [seenKey, setSeenKey] = useState(location.key);
  if (location.key !== seenKey) {
    setSeenKey(location.key);
    const ownWrite = navigationType === "REPLACE" && isFromSearch(location.state);
    if (!ownWrite && draft !== query) setDraft(query);
  }

  // An empty value drops its param. replace keeps typing out of the history.
  const setParams = (values: Record<string, string | null>) => setSearchParams(previous => {
    const next = new URLSearchParams(previous);
    for (const [name, value] of Object.entries(values)) {
      if (value) next.set(name, value);
      else next.delete(name);
    }
    return next;
  }, { replace: true, state: FROM_SEARCH });
  const search = (value: string) => { setDraft(value); setParams({ [QUERY_PARAM]: value }); };
  const showEverything = () => { setDraft(""); setParams({ [QUERY_PARAM]: null, [KIND_PARAM]: null }); };

  const activate = (item: SanctuaryBrowseItem) => {
    if (item.audioUrl) playItem(item);
    else if (item.source === "article") navigate(readPath(item.key.slice(ARTICLE_KEY_PREFIX.length)));
  };

  return (
    <section className="client-home" aria-label="Home">
      <header className="client-chats-header">
        <p className="client-chats-eyebrow">From Valentina</p>
        <h1 className="client-chats-title">Home</h1>
      </header>
      {loading && <p className="client-chats-notice" role="status">Loading…</p>}
      {!loading && error && <p className="client-chats-notice" role="alert">Could not load posts. <button onClick={refetch}>Try again</button></p>}
      {!loading && !error && posts.length === 0 && (
        <div className="client-chats-empty"><p>Nothing here yet. Valentina&apos;s first posts are on their way.</p></div>
      )}
      {posts.length > 0 && (
        <>
          <form className="client-home-search" role="search" onSubmit={event => event.preventDefault()}>
            <input
              ref={field}
              type="search"
              value={draft}
              onChange={event => search(event.target.value)}
              aria-label="Search posts"
              placeholder="Search posts"
              autoComplete="off"
            />
            {draft && <button type="button" className="client-home-search-clear" aria-label="Clear search" onClick={() => { search(""); field.current?.focus(); }}>×</button>}
          </form>
          {kinds.length >= 2 && (
            <div className="client-home-kinds" aria-label="Filter the posts">
              {[EVERYTHING, ...kinds].map(chip => (
                <button
                  key={chip}
                  type="button"
                  className="client-home-kind"
                  aria-pressed={chip === EVERYTHING ? kind === null : chip === kind}
                  onClick={() => setParams({ [KIND_PARAM]: chip === EVERYTHING ? null : chip })}
                >{chip}</button>
              ))}
            </div>
          )}
          {filtering && shown.length > 0 && <p className="client-home-count" role="status">{shown.length === 1 ? "1 post" : `${shown.length} posts`}</p>}
          {shown.length === 0 && <p className="client-chats-notice" role="status">Nothing matches that. Try another word. <button type="button" onClick={showEverything}>Show everything</button></p>}
          {shown.length > 0 && <ul className="client-home-posts">{shown.map(item => <Post key={`${item.source}:${item.key}`} item={item} onActivate={activate} />)}</ul>}
        </>
      )}
    </section>
  );
}
