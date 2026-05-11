import { EarningsPage } from "../features/earnings/views";
import { UserRole } from "../features/auth/types/auth.types";
import type { RouteConfig } from "./app.routes";

const earningsRoutes: RouteConfig[] = [
  {
    path: "/admin/earnings",
    name: "Earnings Page",
    component: EarningsPage,
    layout: "private",
    allowedRoles: [UserRole.PSYCHIC],
  },
];

export default earningsRoutes;
