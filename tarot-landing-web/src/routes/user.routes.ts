
import { UsersPage } from "../features/users/views";
import { UserRole } from "../features/auth/types/auth.types";
import type { RouteConfig } from "./app.routes";


const userRoutes: RouteConfig[] = [
  {
    path: "/admin/users",
    name: "Users Page",
    component: UsersPage,
    layout: "private",
    allowedRoles: [UserRole.ADMIN, UserRole.SUPERADMIN],
  },
    
];

export default userRoutes;
