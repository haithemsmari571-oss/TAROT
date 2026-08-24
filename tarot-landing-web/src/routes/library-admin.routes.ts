import { UserRole } from "../features/auth/types/auth.types";
import LibraryAdminPage from "../features/library-admin/LibraryAdminPage";
import type { RouteConfig } from "./app.routes";

const libraryAdminRoutes: RouteConfig[] = [
  {
    path: "/admin/library",
    name: "Library Admin",
    component: LibraryAdminPage,
    layout: "private",
    allowedRoles: [UserRole.ADMIN, UserRole.SUPERADMIN],
  },
];

export default libraryAdminRoutes;
