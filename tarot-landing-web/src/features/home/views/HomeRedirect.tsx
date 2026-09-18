import { Navigate } from "react-router-dom";

// The site has no standalone homepage. "/" sends a guest straight to the
// psychics browse page — the original behavior before the homepage was added.
// A signed-in client never reaches this: App.tsx's CLIENT_APP_REDIRECTS opens
// the app for her first.
export default function HomeRedirect() {
  return <Navigate to="/psychics-browse" replace />;
}
