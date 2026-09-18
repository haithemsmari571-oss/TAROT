/* The app is the front door for a signed-in client. An old address she still
   holds (a bookmark, Stripe's default return to /billing, a link in an email)
   takes her to the app's own screen, with the query string and the hash kept.
   Guests and every other role get the old page exactly as before.

   The app's chats run on per-message only. In any other mode the old hall is
   still the room, and the app's own chats screens send her there, so the chat
   redirects hold back unless the site runs per-message. */
import type { ReactNode } from "react";
import { Navigate, useLocation, useParams, type Params } from "react-router-dom";
import { useAuth } from "@/features/auth/hooks";
import { UserRole } from "@/features/auth/types/auth.types";
import { useBillingMode } from "@/features/billing-mode/BillingModeContext";

export interface ClientAppRedirect {
  to: (params: Readonly<Params<string>>) => string;
  perMessageOnly?: boolean;
}

export default function RedirectSignedInClient({
  to,
  perMessageOnly = false,
  children,
}: ClientAppRedirect & { children: ReactNode }) {
  const { user, isAuthenticated, isLoading } = useAuth();
  const { billingMode, loaded } = useBillingMode();
  const params = useParams();
  const { search, hash } = useLocation();

  if (isLoading) return null;
  if (!isAuthenticated || user?.role !== UserRole.USER) return <>{children}</>;
  if (perMessageOnly && !loaded) return null;
  if (perMessageOnly && billingMode !== "per_message") return <>{children}</>;
  return <Navigate to={{ pathname: to(params), search, hash }} replace />;
}
