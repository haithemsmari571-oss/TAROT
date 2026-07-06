import { UserRole } from "../features/auth/types/auth.types";
import type { RouteConfig } from "./app.routes";
import RitualsSettings from "../features/rituals-settings/views/RitualsSettings";

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
