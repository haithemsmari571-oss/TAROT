import { lazy } from "react";
import { UserRole } from "../features/auth/types/auth.types";
import type { RouteConfig } from "./app.routes";
const RitualsSettings = lazy(() => import("../features/rituals-settings/views/RitualsSettings"));

const ritualsSettingsRoutes: RouteConfig[] = [
  {
    path: "/admin/rituals-settings",
    name: "Rituals Settings",
    component: RitualsSettings,
    layout: "private",
    allowedRoles: [UserRole.SUPERADMIN],
  },
];

export default ritualsSettingsRoutes;
