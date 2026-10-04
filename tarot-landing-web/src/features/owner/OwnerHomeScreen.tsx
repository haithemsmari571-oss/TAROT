import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/features/auth/hooks";
import { Cover } from "@/features/sanctuary/cover";
import type { OwnerLibraryItem } from "./ownerLibraryApi";
import { kindLabel } from "./ownerMedia";
import { OwnerPostBadges } from "./OwnerParts";
import { OWNER_NEW_POST_PATH, OWNER_SIGN_IN_PATH, ownerPostPath } from "./ownerPaths";
import { browseItemOf, coverUrlOf, firstFrameUrl, useOwnerPosts, videoUrlOf } from "./ownerPosts";
import { OWNER_APP_NAME } from "./ownerSession";

const COPY = {
  newPost: "New post",
  yourPosts: "Your posts",
  loading: "Loading your posts…",
  failed: "Your posts could not be loaded.",
  tryAgain: "Try again",
  empty: "Nothing posted yet.",
  hidden: "hidden",
  messagesSoon: "Messages, coming soon",
  signOut: "Sign out",
} as const;

/* A post's square picture: its cover, else a video's opening frame, else the
   art Home draws for a recording without a cover. */
function PostPicture({ item }: { item: OwnerLibraryItem }) {
  const cover = coverUrlOf(item);
  const video = videoUrlOf(item);
  if (cover) return <img className="owner-grid-media" src={cover} alt="" loading="lazy" />;
  if (video) return <video className="owner-grid-media" src={firstFrameUrl(video)} muted playsInline preload="metadata" tabIndex={-1} aria-hidden="true" />;
  return <span className="owner-grid-art"><Cover item={browseItemOf(item)} /></span>;
}

/* Home of the owner's phone admin (ROUND51): one big New post, then "Your
   posts" three to a row as on an Instagram profile, a quiet line for what
   comes next, and Sign out at the bottom. */
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
      <p className="owner-quiet">{COPY.messagesSoon}</p>
      <button type="button" className="owner-button-quiet owner-sign-out" onClick={signOut}>
        {COPY.signOut}
      </button>
    </main>
  );
}
