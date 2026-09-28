import { lazy } from "react";
import { UserRole } from "../features/auth/types/auth.types";
import type { RouteConfig } from "./app.routes";
const LifePathNumbersPage = lazy(() => import("../features/lifepath/views/LifePathNumbers"));

const lifepathRoutes: RouteConfig[] = [
  {
    path: "/admin/lifepath",
    name: "Life Path Numbers Page",
    component: LifePathNumbersPage,
    layout: "private",
    allowedRoles: [UserRole.ADMIN, UserRole.SUPERADMIN],
  },
];

export default lifepathRoutes;
