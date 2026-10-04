import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/features/auth/hooks";
import { OWNER_PODCAST_PATH, OWNER_REEL_PATH, OWNER_SIGN_IN_PATH } from "./ownerPaths";
import { OWNER_APP_NAME } from "./ownerSession";

const COPY = {
  postReel: "Post a reel",
  postPodcast: "Post a podcast",
  messagesSoon: "Messages, coming soon",
  signOut: "Sign out",
} as const;

/* Home of the owner's phone admin (ROUND50): two big tiles, a quiet line for
   what comes next, and Sign out at the bottom. */
export default function OwnerHomeScreen() {
  const navigate = useNavigate();
  const { logout } = useAuth();

  const signOut = () => {
    logout();
    navigate(OWNER_SIGN_IN_PATH, { replace: true });
  };

  return (
    <main className="owner-screen owner-home">
      <h1 className="owner-title">{OWNER_APP_NAME}</h1>
      <nav className="owner-tiles" aria-label={OWNER_APP_NAME}>
        <Link className="owner-panel owner-tile" to={OWNER_REEL_PATH}>
          <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="7" y="4" width="10" height="16" rx="2.5" />
            <path d="M10.5 9.5v5l4-2.5-4-2.5Z" />
          </svg>
          <span>{COPY.postReel}</span>
        </Link>
        <Link className="owner-panel owner-tile" to={OWNER_PODCAST_PATH}>
          <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="9" y="3.5" width="6" height="11" rx="3" />
            <path d="M5.5 11.5a6.5 6.5 0 0 0 13 0" />
            <path d="M12 18v2.5" />
          </svg>
          <span>{COPY.postPodcast}</span>
        </Link>
      </nav>
      <p className="owner-quiet">{COPY.messagesSoon}</p>
      <button type="button" className="owner-button-quiet owner-sign-out" onClick={signOut}>
        {COPY.signOut}
      </button>
    </main>
  );
}
