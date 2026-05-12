import { useLocation, Navigate, Route, Routes } from "react-router-dom";
import AdminLayout from "./layouts/AdminLayout";
import PublicLayout from "./layouts/PublicLayout";
import "./App.css";
import type { RouteConfig } from "./routes/app.routes";
import routes from "./routes/app.routes";
import { useEffect } from "react";
import { COLORS } from "./theme";
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

  // PSYCHIC, ADMIN, SUPERADMIN must stay within /admin/*
  if (
    isAuthenticated &&
    user &&
    (user.role === UserRole.PSYCHIC || user.role === UserRole.ADMIN || user.role === UserRole.SUPERADMIN) &&
    !location.pathname.startsWith("/admin")
  ) {
    return <Navigate to="/admin/chats" replace />;
  }

  // Logged-in USER role
  if (isAuthenticated && user?.role === UserRole.USER) {
    // / and /home redirect to /psychics-browse as their home page
    if (location.pathname === "/" || location.pathname === "/home") {
      return <Navigate to="/psychics-browse" replace />;
    }
    return <>{children}</>;
  }

  // Guest (unauthenticated): only allow specific paths
  if (!isAuthenticated) {
    const isGuestAllowed =
      location.pathname === "/" ||
      location.pathname === "/home" ||
      location.pathname === "/psychics-browse" ||
      location.pathname === "/oracle" ||
      location.pathname.startsWith("/psychics/");

    if (!isGuestAllowed) {
      return <Navigate to="/home" replace />;
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
      <Route element={<RouteGuard><PublicLayout /></RouteGuard>}>
        {publicRoutes.map((r: RouteConfig) => {
          if (r.requiresAuth) {
            return (
              <Route 
                key={r.path} 
                path={r.path} 
                element={<ProtectedRoute><r.component /></ProtectedRoute>} 
              />
            );
          }
          return <Route key={r.path} path={r.path} element={<r.component />} />;
        })}
      </Route>

      {/* Private / Admin Layout Routes */}
      <Route element={<ProtectedRoute><AdminLayout /></ProtectedRoute>}>
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

      {/* 404 fallback - Styled to match your Dark theme */}
      <Route
        path="*"
        element={
          <div className="flex flex-col items-center justify-center w-full h-screen text-center"
               style={{ backgroundColor: COLORS.Dark }}>
            <h1 className="text-8xl font-black mb-2" 
                style={{ color: COLORS.primary, fontFamily: 'Oswald' }}>
              404
            </h1>
            <p className="text-xl uppercase tracking-widest mb-8" 
               style={{ color: COLORS.neutralGray, fontFamily: 'Montserrat' }}>
              Node Not Found
            </p>
            <a
              href="/home"
              className="px-8 py-3 text-white rounded-xl transition-all hover:scale-105 font-bold uppercase tracking-widest"
              style={{ backgroundColor: COLORS.primary, boxShadow: `0 10px 20px ${COLORS.primary}40` }}
            >
              Return to System
            </a>
          </div>
        }
      />
    </Routes>
  );
}