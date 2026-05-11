
import { PractitionersPage } from "../features/psychics/views";
import { UserRole } from "../features/auth/types/auth.types";
import type { RouteConfig } from "./app.routes";


const psychicsRoutes: RouteConfig[] = [
  {
    path: "/admin/psychics",
    name: "psychics Page",
    component: PractitionersPage,
    layout: "private",
    allowedRoles: [UserRole.ADMIN, UserRole.SUPERADMIN],
  },
    
];

export default psychicsRoutes;
