import { useLocation, Navigate, Route, Routes } from "react-router-dom";
import PublicLayout from "./layouts/PublicLayout";
import "./App.css";
import type { RouteConfig } from "./routes/app.routes";
import routes from "./routes/app.routes";
import { lazy, Suspense, useEffect } from "react";
import NotFound from "./features/misc/views/NotFound";
import { NoIndexSeo } from "./components/Seo";
import { ProtectedRoute, RoleProtectedRoute } from "./features/auth/components";
import { useAuth } from "./features/auth/hooks";
import { UserRole } from "./features/auth/types/auth.types";
import BrandedLoader from "./components/motion/BrandedLoader";
import PageSpace from "./components/PageSpace";
import { crmDestinationForAdminPath } from "./admin-crm-routes";
import RedirectSignedInClient, { type ClientAppRedirect } from "./features/client-app/RedirectSignedInClient";
import { CHATS_PATH, HOME_PATH, READERS_PATH, YOU_PATH } from "./features/client-app/clientAppPaths";
import { OWNER_NEW_POST_PATH, OWNER_PATH, OWNER_POST_PATH, OWNER_SIGN_IN_PATH } from "./features/owner/ownerPaths";

export { crmDestinationForAdminPath } from "./admin-crm-routes";

// The old customer layout, with the Vanta clouds and net on three.js. No route
// under it renders today (every /admin address leaves for the CRM), so it and
// its 3D engine load only if one ever does.
const AdminLayout = lazy(() => import("./layouts/AdminLayout"));
const ClientAppShell = lazy(() => import("./features/client-app/ClientAppShell"));
const ClientThreadScreen = lazy(() => import("./features/client-app/ClientThreadScreen"));
const ClientChatsScreen = lazy(() => import("./features/client-app/ClientChatsScreen"));
const ClientReadersScreen = lazy(() => import("./features/client-app/ClientReadersScreen"));
const ClientReaderProfileScreen = lazy(() => import("./features/client-app/ClientReaderProfileScreen"));
const ClientYouScreen = lazy(() => import("./features/client-app/ClientYouScreen"));
const ClientEditDetailsScreen = lazy(() => import("./features/client-app/ClientEditDetailsScreen"));
const ClientChangePasswordScreen = lazy(() => import("./features/client-app/ClientChangePasswordScreen"));
const ClientFavouritesScreen = lazy(() => import("./features/client-app/ClientFavouritesScreen"));
const ClientDeleteAccountScreen = lazy(() => import("./features/client-app/ClientDeleteAccountScreen"));
const ClientConstellationScreen = lazy(() => import("./features/client-app/ClientConstellationScreen"));
const ClientNotificationsScreen = lazy(() => import("./features/client-app/ClientNotificationsScreen"));
const ClientTermsScreen = lazy(() => import("./features/client-app/ClientTermsScreen"));
const ClientPrivacyScreen = lazy(() => import("./features/client-app/ClientPrivacyScreen"));
const ClientHelpScreen = lazy(() => import("./features/client-app/ClientHelpScreen"));
const ClientHomeScreen = lazy(() => import("./features/client-app/ClientHomeScreen"));
const ClientArticleScreen = lazy(() => import("./features/client-app/ClientArticleScreen"));
const ClientShortsScreen = lazy(() => import("./features/client-app/ClientShortsScreen"));
// The owner's phone admin (ROUND50); posting is one flow (ROUND51).
const OwnerShell = lazy(() => import("./features/owner/OwnerShell"));
const OwnerSignInScreen = lazy(() => import("./features/owner/OwnerSignInScreen"));
const OwnerHomeScreen = lazy(() => import("./features/owner/OwnerHomeScreen"));
const OwnerNewPostScreen = lazy(() => import("./features/owner/OwnerNewPostScreen"));
const OwnerPostScreen = lazy(() => import("./features/owner/OwnerPostScreen"));

// --- CUSTOM HOOK ---
function useScrollToTop() {
  const { pathname } = useLocation();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
}

function AdminCrmRedirect() {
  const location = useLocation();

  useEffect(() => {
    window.location.replace(crmDestinationForAdminPath(location.pathname));
  }, [location.pathname]);

  return <BrandedLoader fullscreen label="Opening the CRM…" />;
}

// The old addresses a signed-in client may still hold, and the app screen each
// one now opens. /chats/:chatId had no page before; everyone else still gets
// the 404 there.
const CLIENT_APP_REDIRECTS: Record<string, ClientAppRedirect> = {
  "/": { to: () => HOME_PATH },
  "/home": { to: () => HOME_PATH },
  "/chats": { to: () => CHATS_PATH, perMessageOnly: true },
  "/chats/:chatId": { to: ({ chatId }) => `${CHATS_PATH}/${chatId}`, perMessageOnly: true },
  "/billing": { to: () => YOU_PATH },
  "/psychics-browse": { to: () => READERS_PATH },
  "/psychics/:id/details": { to: ({ id }) => `${READERS_PATH}/${id}` },
};

function withClientAppRedirect(path: string, element: React.ReactNode) {
  const redirect = CLIENT_APP_REDIRECTS[path];
  return redirect ? <RedirectSignedInClient {...redirect}>{element}</RedirectSignedInClient> : element;
}

// --- ROUTE GUARD ---
function RouteGuard({ children }: { children: React.ReactNode }) {
  const { user, isAuthenticated, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return <BrandedLoader fullscreen label="Entering your world…" />;
  }

  if (isLoading || !user) {
    return <>{children}</>;
  }
  // PSYCHIC, ADMIN, SUPERADMIN must stay within /admin/*
  // const role = user.role;

  // const isAdminRole =
  //   role === UserRole.PSYCHIC ||
  //   role === UserRole.ADMIN ||
  //   role === UserRole.SUPERADMIN;

  // if (isAuthenticated && isAdminRole) {
  //   if (!location.pathname.startsWith("/admin")) {
  //     console.log("ADMIN REDIRECT", {
  //       path: location.pathname,
  //       role,
  //     });

  //     return <Navigate to="/admin/chats" replace />;
  //   }
  // }
  // Logged-in USER role. "/" and "/home" open the app (CLIENT_APP_REDIRECTS).
  if (isAuthenticated && user?.role === UserRole.USER) {
    return <>{children}</>;
  }

  // Guest (unauthenticated): only allow specific paths
  if (!isAuthenticated) {
    const isGuestAllowed =
      location.pathname === "/" ||
      location.pathname === "/home" ||
      location.pathname === "/sanctuary" ||
      location.pathname === "/psychics-browse" ||
      location.pathname === "/oracle" ||
      location.pathname === "/about" ||
      location.pathname === "/privacy" ||
      location.pathname === "/terms" ||
      location.pathname.startsWith("/articles/") ||
      location.pathname === "/does-he-miss-me" ||
      location.pathname === "/will-my-ex-come-back" ||
      location.pathname.startsWith("/psychics/");

    if (!isGuestAllowed) {
      return <Navigate to="/psychics-browse" replace />;
    }
    return <>{children}</>;
  }

  return <>{children}</>;
}

export default function App() {
  // Trigger the scroll logic on every route change
  useScrollToTop();

  const privateRoutes = routes.filter((r) => r.layout === "private");
  const publicRoutes = routes.filter((r) => r.layout === "public");

  return (
    <Routes>
      <Route
        path="/app"
        element={
          <RoleProtectedRoute allowedRoles={[UserRole.USER]}>
            {/* The app is kept out of search, every screen of it (ROUND41). */}
            <NoIndexSeo />
            <Suspense fallback={null}>
              <ClientAppShell />
            </Suspense>
          </RoleProtectedRoute>
        }
      >
        <Route index element={<Navigate to="home" replace />} />
        <Route path="home" element={<Suspense fallback={null}><ClientHomeScreen /></Suspense>} />
        <Route path="home/read/:slug" element={<Suspense fallback={null}><ClientArticleScreen /></Suspense>} />
        <Route path="readers" element={<Suspense fallback={null}><ClientReadersScreen /></Suspense>} />
        <Route path="readers/:psychicId" element={<Suspense fallback={null}><ClientReaderProfileScreen /></Suspense>} />
        <Route path="shorts" element={<Suspense fallback={null}><ClientShortsScreen /></Suspense>} />
        <Route path="chats" element={<Suspense fallback={null}><ClientChatsScreen /></Suspense>} />
        <Route path="chats/:chatId" element={<Suspense fallback={null}><ClientThreadScreen /></Suspense>} />
        <Route path="you" element={<Suspense fallback={null}><ClientYouScreen /></Suspense>} />
        <Route path="you/details" element={<Suspense fallback={null}><ClientEditDetailsScreen /></Suspense>} />
        <Route path="you/password" element={<Suspense fallback={null}><ClientChangePasswordScreen /></Suspense>} />
        <Route path="you/favourites" element={<Suspense fallback={null}><ClientFavouritesScreen /></Suspense>} />
        <Route path="you/delete" element={<Suspense fallback={null}><ClientDeleteAccountScreen /></Suspense>} />
        <Route path="you/constellation" element={<Suspense fallback={null}><ClientConstellationScreen /></Suspense>} />
        <Route path="you/notifications" element={<Suspense fallback={null}><ClientNotificationsScreen /></Suspense>} />
        <Route path="you/terms" element={<Suspense fallback={null}><ClientTermsScreen /></Suspense>} />
        <Route path="you/privacy" element={<Suspense fallback={null}><ClientPrivacyScreen /></Suspense>} />
        <Route path="you/help" element={<Suspense fallback={null}><ClientHelpScreen /></Suspense>} />
      </Route>

      {/* The owner's phone admin: its own sign-in and guard (OwnerShell.tsx),
          outside the site's layouts, never /login and never the CRM. */}
      <Route path={OWNER_PATH} element={<Suspense fallback={null}><OwnerShell /></Suspense>}>
        <Route index element={<Suspense fallback={null}><OwnerHomeScreen /></Suspense>} />
        <Route path={OWNER_SIGN_IN_PATH} element={<Suspense fallback={null}><OwnerSignInScreen /></Suspense>} />
        <Route path={OWNER_NEW_POST_PATH} element={<Suspense fallback={null}><OwnerNewPostScreen /></Suspense>} />
        <Route path={OWNER_POST_PATH} element={<Suspense fallback={null}><OwnerPostScreen /></Suspense>} />
      </Route>

      {/* Public Layout Routes (Landing pages without sidebar) */}
      <Route
        element={
          <RouteGuard>
            <PublicLayout />
          </RouteGuard>
        }
      >
        {publicRoutes.map((r: RouteConfig) => {
          if (r.requiresAuth) {
            return (
              <Route
                key={r.path}
                path={r.path}
                element={withClientAppRedirect(
                  r.path,
                  <ProtectedRoute>
                    <Suspense fallback={<PageSpace />}>
                      <r.component />
                    </Suspense>
                  </ProtectedRoute>
                )}
              />
            );
          }
          return (
            <Route
              key={r.path}
              path={r.path}
              element={withClientAppRedirect(
                r.path,
                <Suspense fallback={<PageSpace />}>
                  <r.component />
                </Suspense>
              )}
            />
          );
        })}
      </Route>

      {/* The old admin components remain in source for one-commit rollback, but
          every old /admin URL now leaves this app and opens the matching CRM room. */}
      <Route path="/admin/*" element={<AdminCrmRedirect />} />

      {/* Non-admin private routes keep their existing customer layout. */}
      <Route
        element={
          <ProtectedRoute>
            <Suspense fallback={null}>
              <AdminLayout />
            </Suspense>
          </ProtectedRoute>
        }
      >
        {privateRoutes.filter((r) => !r.path.startsWith("/admin/")).map((r: RouteConfig) => {
          if (r.allowedRoles && r.allowedRoles.length > 0) {
            return (
              <Route
                key={r.path}
                path={r.path}
                element={
                  <RoleProtectedRoute
                    allowedRoles={r.allowedRoles}
                    redirectTo="/admin/chats"
                  >
                    <Suspense fallback={null}>
                      <r.component />
                    </Suspense>
                  </RoleProtectedRoute>
                }
              />
            );
          }
          return <Route key={r.path} path={r.path} element={<Suspense fallback={null}><r.component /></Suspense>} />;
        })}
      </Route>

      {/* Guest routes (Login, Register, etc.) */}
      {routes
        .filter((r) => r.layout === "guest")
        .map((r: RouteConfig) => (
          <Route key={r.path} path={r.path} element={withClientAppRedirect(r.path, <Suspense fallback={null}><r.component /></Suspense>)} />
        ))}
      <Route path="/chats/:chatId" element={withClientAppRedirect("/chats/:chatId", <NotFound />)} />

      {/* 404 fallback - branded, on-voice page */}
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
