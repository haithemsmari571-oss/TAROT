import { lazy } from "react";

import { UserRole } from "../features/auth/types/auth.types";
import type { RouteConfig } from "./app.routes";
const DashboardPage = lazy(() => import("../features/dashboard/views/Dashboard"));


const dashboardRoutes: RouteConfig[] = [
  {
    path: "/admin/dashboard",
    name: "Dashboard Page",
    component: DashboardPage,
    layout: "private",
    allowedRoles: [UserRole.PSYCHIC, UserRole.ADMIN, UserRole.SUPERADMIN],
  },
    
];

export default dashboardRoutes;
