import { lazy } from "react";

import { UserRole } from "../features/auth/types/auth.types";
import type { RouteConfig } from "./app.routes";
const PractitionersPage = lazy(() => import("../features/psychics/views/Practitioners"));


const psychicsRoutes: RouteConfig[] = [
  {
    path: "/admin/psychics",
    name: "psychics Page",
    component: PractitionersPage,
    layout: "private",
    allowedRoles: [UserRole.SUPERADMIN],
  },
    
];

export default psychicsRoutes;
