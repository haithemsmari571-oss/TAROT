import { useEffect } from "react";
import { Navigate, Outlet, useMatch } from "react-router-dom";
import { NoIndexSeo } from "@/components/Seo";
import { useAuth } from "@/features/auth/hooks";
import { OWNER_APPLE_TOUCH_ICON_PATH, OWNER_MANIFEST_PATH, OWNER_PATH, OWNER_SIGN_IN_PATH } from "./ownerPaths";
import { OWNER_APP_NAME, isOwnerRole, ownerSessionUsable } from "./ownerSession";
import "../../styles/glass.css";
import "./owner.css";

/* Points one head tag at the owner's value and returns how to put it back:
   the previous value, or the tag removed when the page had none. */
function pointHeadTag(
  selector: string,
  tag: "link" | "meta",
  attributes: Record<string, string>,
  valueAttribute: "href" | "content",
  value: string,
): () => void {
  const existing = document.head.querySelector(selector);
  if (existing) {
    const previous = existing.getAttribute(valueAttribute);
    existing.setAttribute(valueAttribute, value);
    return () => {
      if (previous === null) existing.removeAttribute(valueAttribute);
      else existing.setAttribute(valueAttribute, previous);
    };
  }
  const created = document.createElement(tag);
  Object.entries(attributes).forEach(([name, attributeValue]) => created.setAttribute(name, attributeValue));
  created.setAttribute(valueAttribute, value);
  document.head.appendChild(created);
  return () => created.remove();
}

/* index.html is shared by every page and links the app's install files
   (index.html:15-16). While the owner shell is mounted the page offers the
   owner's instead, so Chrome installs, and an iPhone adds to its home screen,
   "AV Admin" with its own icon; leaving /owner puts the app's back (ROUND49
   D.2). No service worker: nothing of the owner's is kept offline. */
function useOwnerInstallHead() {
  useEffect(() => {
    const restores = [
      pointHeadTag('link[rel="manifest"]', "link", { rel: "manifest" }, "href", OWNER_MANIFEST_PATH),
      pointHeadTag('link[rel="apple-touch-icon"]', "link", { rel: "apple-touch-icon", sizes: "180x180" }, "href", OWNER_APPLE_TOUCH_ICON_PATH),
      pointHeadTag('meta[name="apple-mobile-web-app-title"]', "meta", { name: "apple-mobile-web-app-title" }, "content", OWNER_APP_NAME),
    ];
    return () => restores.forEach((restore) => restore());
  }, []);
}

/* The owner's phone admin at /owner (ROUND50): its own sign-in and its own
   guard, outside the site's layouts. The guard reads the stored session
   before any API call (ownerSession.ts), so a signed-out owner sees the
   owner's sign-in, never /login and never the CRM. */
export default function OwnerShell() {
  const { user, isAuthenticated, isLoading } = useAuth();
  const onSignIn = useMatch(OWNER_SIGN_IN_PATH);
  useOwnerInstallHead();

  const owner = isAuthenticated && isOwnerRole(user?.role) && ownerSessionUsable();
  let content = null;
  if (!isLoading) {
    if (onSignIn) content = owner ? <Navigate to={OWNER_PATH} replace /> : <Outlet />;
    else content = owner ? <Outlet /> : <Navigate to={OWNER_SIGN_IN_PATH} replace />;
  }

  return (
    <div className="owner-shell">
      <NoIndexSeo />
      {content}
    </div>
  );
}
