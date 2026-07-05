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

// --- CUSTOM HOOK ---
function useScrollToTop() {
  const { pathname } = useLocation();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
}

// --- ROUTE GUARD ---
function RouteGuard({ children }: { children: React.ReactNode }) {
  const { user, isAuthenticated, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
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
      location.pathname === "/psychics-browse" ||
      location.pathname === "/oracle" ||
      location.pathname === "/about" ||
      location.pathname === "/privacy" ||
      location.pathname === "/terms" ||
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

      {/* /admin/life-path is a stale link — the real route is /admin/lifepath. */}
      <Route path="/admin/life-path" element={<Navigate to="/admin/lifepath" replace />} />

      {/* Private / Admin Layout Routes. The whole /admin shell is gated to the
          admin family — a plain USER who reaches /admin is sent back to browse
          (previously they landed on the shell with an empty sidebar). */}
      <Route
        element={
          <ProtectedRoute>
            <RoleProtectedRoute
              allowedRoles={[UserRole.PSYCHIC, UserRole.ADMIN, UserRole.SUPERADMIN]}
              redirectTo="/psychics-browse"
            >
              <AdminLayout />
            </RoleProtectedRoute>
          </ProtectedRoute>
        }
      >
        {privateRoutes.map((r: RouteConfig) => {
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
