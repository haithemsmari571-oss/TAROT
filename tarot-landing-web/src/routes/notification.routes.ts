import { lazy } from "react";
import type { RouteConfig } from "./app.routes";
import { UserRole } from "../features/auth/types/auth.types";

const NotificationsPage = lazy(() => import("../features/notifications/views/NotificationsPage"));

export const notificationRoutes: RouteConfig[] = [
  {
    path: "/notifications",
    name: "Notifications",
    component: NotificationsPage,
    layout: "public",
    requiresAuth: true,
  },
  {
    path: "/admin/notifications",
    name: "Admin Notifications",
    component: NotificationsPage,
    layout: "private",
    requiresAuth: true,
    allowedRoles: [UserRole.PSYCHIC, UserRole.ADMIN, UserRole.SUPERADMIN],
  },
];
