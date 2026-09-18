/* The Home tab: the Sanctuary's library and the public articles as one feed,
   newest first, on the shell's living sky. The data, the covers and the player
   are the Sanctuary's own (useLibraryItems, cover.tsx, SanctuaryPlayerProvider).
   A post with audio plays in the Sanctuary's now-playing view; an article opens
   in the app's reading screen. */
import { useNavigate } from "react-router-dom";
import { ARTICLE_KEY_PREFIX, type SanctuaryBrowseItem } from "@/features/sanctuary/api/libraryItemsApi";
import { Cover, formatDuration } from "@/features/sanctuary/cover";
import { useLibraryItems } from "@/features/sanctuary/hooks/useLibraryItems";
import { useSanctuaryPlayer } from "@/features/sanctuary/SanctuaryPlayerProvider";
import { sanitizeClaims } from "@/lib/copy";
import { dayOf } from "./ukTime";
import "./client-chats.css";
import "./client-home.css";

export const HOME_PATH = "/app/home";
const readPath = (slug: string) => `${HOME_PATH}/read/${slug}`;

/* Newest first. Array sort is stable, so posts published at the same moment
   keep the order the Sanctuary gives them. */
const newestFirst = (items: SanctuaryBrowseItem[]) => [...items].sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt));

function Post({ item, onActivate }: { item: SanctuaryBrowseItem; onActivate: (item: SanctuaryBrowseItem) => void }) {
  const duration = formatDuration(item.durationSeconds);
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
  const posts = newestFirst(items);

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
      {posts.length > 0 && <ul className="client-home-posts">{posts.map(item => <Post key={`${item.source}:${item.key}`} item={item} onActivate={activate} />)}</ul>}
    </section>
  );
}
