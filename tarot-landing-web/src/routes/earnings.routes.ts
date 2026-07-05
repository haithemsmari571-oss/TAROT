import { EarningsPage } from "../features/earnings/views";
import { UserRole } from "../features/auth/types/auth.types";
import type { RouteConfig } from "./app.routes";

const earningsRoutes: RouteConfig[] = [
  {
    path: "/admin/reader-activity",
    name: "Reader Activity",
    component: EarningsPage,
    layout: "private",
    allowedRoles: [UserRole.SUPERADMIN],
  },
];

export default earningsRoutes;
