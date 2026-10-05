import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/features/auth/hooks";
import { Cover } from "@/features/sanctuary/cover";
import type { OwnerLibraryItem } from "./ownerLibraryApi";
import { kindLabel } from "./ownerMedia";
import { useAttentionCount } from "./ownerMessages";
import { OwnerPostBadges } from "./OwnerParts";
import { OWNER_MESSAGES_PATH, OWNER_NEW_POST_PATH, OWNER_READERS_PATH, OWNER_SIGN_IN_PATH, ownerPostPath } from "./ownerPaths";
import { browseItemOf, coverUrlOf, firstFrameUrl, useOwnerPosts, videoUrlOf } from "./ownerPosts";
import { OWNER_APP_NAME } from "./ownerSession";

const COPY = {
  messages: "Messages",
  needYou: (count: number) => `${count} ${count === 1 ? "conversation needs" : "conversations need"} you`,
  readers: "Readers",
  newPost: "New post",
  yourPosts: "Your posts",
  loading: "Loading your posts…",
  failed: "Your posts could not be loaded.",
  tryAgain: "Try again",
  empty: "Nothing posted yet.",
  hidden: "hidden",
  signOut: "Sign out",
} as const;

/* Messages, above New post (ROUND53), with a gold count of the conversations
   that need him: a suggestion ready, or her waiting for a reply. */
function MessagesTile() {
  const attention = useAttentionCount();
  const count = attention.data ?? 0;
  return (
    <Link
      className="owner-panel owner-messages-tile"
      to={OWNER_MESSAGES_PATH}
      aria-label={count > 0 ? `${COPY.messages}, ${COPY.needYou(count)}` : COPY.messages}
    >
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M20 12.5a7.5 7.5 0 0 1-11.1 6.6L4 20l1-4.4A7.5 7.5 0 1 1 20 12.5Z" />
      </svg>
      <span className="owner-messages-label">{COPY.messages}</span>
      {count > 0 && <span className="owner-count-badge" aria-hidden="true">{count}</span>}
    </Link>
  );
}

/* A post's square picture: its cover, else a video's opening frame, else the
   art Home draws for a recording without a cover. */
function PostPicture({ item }: { item: OwnerLibraryItem }) {
  const cover = coverUrlOf(item);
  const video = videoUrlOf(item);
  if (cover) return <img className="owner-grid-media" src={cover} alt="" loading="lazy" />;
  if (video) return <video className="owner-grid-media" src={firstFrameUrl(video)} muted playsInline preload="metadata" tabIndex={-1} aria-hidden="true" />;
  return <span className="owner-grid-art"><Cover item={browseItemOf(item)} /></span>;
}

/* Home of the owner's phone admin (ROUND51, ROUND53, ROUND54): Messages,
   Readers, one big New post, then "Your posts" three to a row as on an
   Instagram profile, and Sign out at the bottom. */
export default function OwnerHomeScreen() {
  const navigate = useNavigate();
  const { logout } = useAuth();
  const posts = useOwnerPosts();

  const signOut = () => {
    logout();
    navigate(OWNER_SIGN_IN_PATH, { replace: true });
  };

  return (
    <main className="owner-screen owner-home">
      <h1 className="owner-title">{OWNER_APP_NAME}</h1>
      <MessagesTile />
      <Link className="owner-panel owner-readers-tile" to={OWNER_READERS_PATH}>
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="9" cy="8" r="3.5" />
          <path d="M2.5 20a6.5 6.5 0 0 1 13 0" />
          <path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14a6.5 6.5 0 0 1 3.5 6" />
        </svg>
        <span className="owner-messages-label">{COPY.readers}</span>
      </Link>
      <Link className="owner-button owner-new-post" to={OWNER_NEW_POST_PATH}>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <path d="M12 5v14M5 12h14" />
        </svg>
        {COPY.newPost}
      </Link>
      <section className="owner-posts" aria-labelledby="owner-posts-heading">
        <h2 className="owner-section-title" id="owner-posts-heading">{COPY.yourPosts}</h2>
        {posts.isPending && <p className="owner-note" role="status">{COPY.loading}</p>}
        {posts.isError && (
          <div className="owner-posts-state">
            <p className="owner-error" role="alert">{COPY.failed}</p>
            <button type="button" className="owner-button-quiet" onClick={() => { void posts.refetch(); }}>{COPY.tryAgain}</button>
          </div>
        )}
        {posts.data?.length === 0 && <p className="owner-note">{COPY.empty}</p>}
        {posts.data && posts.data.length > 0 && (
          <ul className="owner-grid">
            {posts.data.map((item) => (
              <li key={item.id}>
                <Link
                  className="owner-grid-tile"
                  to={ownerPostPath(item.id)}
                  aria-label={`${kindLabel(item.type)}: ${item.title}${item.enabled ? "" : `, ${COPY.hidden}`}`}
                  data-owner-post={item.id}
                >
                  <PostPicture item={item} />
                  <OwnerPostBadges type={item.type} enabled={item.enabled} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
      <button type="button" className="owner-button-quiet owner-sign-out" onClick={signOut}>
        {COPY.signOut}
      </button>
    </main>
  );
}
