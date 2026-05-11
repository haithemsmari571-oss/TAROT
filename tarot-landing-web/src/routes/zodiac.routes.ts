import { ZodiacSignsPage } from "../features/zodiac/views";
import { UserRole } from "../features/auth/types/auth.types";
import type { RouteConfig } from "./app.routes";

const zodiacRoutes: RouteConfig[] = [
  {
    path: "/admin/zodiac",
    name: "Zodiac Signs Page",
    component: ZodiacSignsPage,
    layout: "private",
    allowedRoles: [UserRole.ADMIN, UserRole.SUPERADMIN],
  },
];

export default zodiacRoutes;
