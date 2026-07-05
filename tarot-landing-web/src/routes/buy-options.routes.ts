import { BuyOptionsPage } from "../features/buy-options/views";
import { UserRole } from "../features/auth/types/auth.types";
import type { RouteConfig } from "./app.routes";

const buyOptionsRoutes: RouteConfig[] = [
  {
    path: "/admin/buy-options",
    name: "Stardust Tiers Page",
    component: BuyOptionsPage,
    layout: "private",
    allowedRoles: [UserRole.ADMIN, UserRole.SUPERADMIN],
  },
];

export default buyOptionsRoutes;
