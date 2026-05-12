import { CategoriesPage } from "../features/categories/views";
import { UserRole } from "../features/auth/types/auth.types";
import type { RouteConfig } from "./app.routes";

const categoriesRoutes: RouteConfig[] = [
  {
    path: "/admin/categories",
    name: "Categories Page",
    component: CategoriesPage,
    layout: "private",
    allowedRoles: [UserRole.ADMIN, UserRole.SUPERADMIN],
  },
];

export default categoriesRoutes;
