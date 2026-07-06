import { UserRole } from "../features/auth/types/auth.types";
import type { RouteConfig } from "./app.routes";
import { TaskManager, ClaimsQueue } from "../features/tasks/views";

const tasksRoutes: RouteConfig[] = [
  {
    path: "/admin/tasks",
    name: "Ritual Tasks",
    component: TaskManager,
    layout: "private",
    allowedRoles: [UserRole.ADMIN, UserRole.SUPERADMIN],
  },
  {
    path: "/admin/claims",
    name: "Claims Queue",
    component: ClaimsQueue,
    layout: "private",
    allowedRoles: [UserRole.ADMIN, UserRole.SUPERADMIN],
  },
];

export default tasksRoutes;
