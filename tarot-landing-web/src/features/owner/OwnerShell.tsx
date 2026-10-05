import { Navigate, Outlet, useMatch } from "react-router-dom";
import { useAuth } from "@/features/auth/hooks";
import { OWNER_PATH, OWNER_SIGN_IN_PATH } from "./ownerPaths";
import { isOwnerRole, ownerSessionUsable } from "./ownerSession";
import "../../styles/glass.css";
import "./owner.css";

/* The owner's phone admin at /owner (ROUND50): its own sign-in and its own
   guard, outside the site's layouts. The guard reads the stored session
   before any API call (ownerSession.ts), so a signed-out owner sees the
   owner's sign-in, never /login and never the CRM. Its page is owner.html
   (ROUND55), whose static head carries the owner's install files, its title
   and noindex; no service worker, nothing of the owner's is kept offline. */
export default function OwnerShell() {
  const { user, isAuthenticated, isLoading } = useAuth();
  const onSignIn = useMatch(OWNER_SIGN_IN_PATH);

  const owner = isAuthenticated && isOwnerRole(user?.role) && ownerSessionUsable();
  let content = null;
  if (!isLoading) {
    if (onSignIn) content = owner ? <Navigate to={OWNER_PATH} replace /> : <Outlet />;
    else content = owner ? <Outlet /> : <Navigate to={OWNER_SIGN_IN_PATH} replace />;
  }

  return (
    <div className="owner-shell">
      {content}
    </div>
  );
}
