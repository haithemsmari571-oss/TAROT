import { Settings } from "../features/settings/views";
import { UserRole } from "../features/auth/types/auth.types";
import type { RouteConfig } from "./app.routes";

const settingsRoutes: RouteConfig[] = [
  {
    path: "/admin/settings",
    name: "Settings Page",
    component: Settings,
    layout: "private",
    allowedRoles: [UserRole.SUPERADMIN],
  },
];

export default settingsRoutes;
