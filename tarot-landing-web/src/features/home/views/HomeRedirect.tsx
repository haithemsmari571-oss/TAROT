import { Navigate } from "react-router-dom";

// The site has no standalone homepage. "/" and "/home" redirect straight to the
// psychics browse page — the original behavior before the homepage was added.
export default function HomeRedirect() {
  return <Navigate to="/psychics-browse" replace />;
}
