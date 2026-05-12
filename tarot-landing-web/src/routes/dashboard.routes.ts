
import { DashboardPage } from "../features/dashboard/views";
import { UserRole } from "../features/auth/types/auth.types";
import type { RouteConfig } from "./app.routes";


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
