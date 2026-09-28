import { lazy } from "react";
import { UserRole } from "../features/auth/types/auth.types";
import type { RouteConfig } from "./app.routes";
const EarningsPage = lazy(() => import("../features/earnings/views/Earnings"));

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
