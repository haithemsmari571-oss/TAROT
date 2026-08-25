import { useLocation, Navigate, Route, Routes } from "react-router-dom";
import AdminLayout from "./layouts/AdminLayout";
import PublicLayout from "./layouts/PublicLayout";
import "./App.css";
import type { RouteConfig } from "./routes/app.routes";
import routes from "./routes/app.routes";
import { useEffect } from "react";
import NotFound from "./features/misc/views/NotFound";
import { ProtectedRoute, RoleProtectedRoute } from "./features/auth/components";
import { useAuth } from "./features/auth/hooks";
import { UserRole } from "./features/auth/types/auth.types";
import BrandedLoader from "./components/motion/BrandedLoader";
import { crmDestinationForAdminPath } from "./admin-crm-routes";

export { crmDestinationForAdminPath } from "./admin-crm-routes";

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
  // Logged-in USER role. "/" and "/home" have no standalone homepage — the
  // HomeRedirect route component sends them to /psychics-browse.
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
                element={
                  <ProtectedRoute>
                    <r.component />
                  </ProtectedRoute>
                }
              />
            );
          }
          return <Route key={r.path} path={r.path} element={<r.component />} />;
        })}
      </Route>

      {/* The old admin components remain in source for one-commit rollback, but
          every old /admin URL now leaves this app and opens the matching CRM room. */}
      <Route path="/admin/*" element={<AdminCrmRedirect />} />

      {/* Non-admin private routes keep their existing customer layout. */}
      <Route
        element={
          <ProtectedRoute>
            <AdminLayout />
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
                    <r.component />
                  </RoleProtectedRoute>
                }
              />
            );
          }
          return <Route key={r.path} path={r.path} element={<r.component />} />;
        })}
      </Route>

      {/* Guest routes (Login, Register, etc.) */}
      {routes
        .filter((r) => r.layout === "guest")
        .map((r: RouteConfig) => (
          <Route key={r.path} path={r.path} element={<r.component />} />
        ))}

      {/* 404 fallback - branded, on-voice page */}
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
