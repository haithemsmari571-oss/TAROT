import { ClientsDossierPage } from "../features/clients/views";
import { UserRole } from "../features/auth/types/auth.types";
import type { RouteConfig } from "./app.routes";

const clientsRoutes: RouteConfig[] = [
  {
    path: "/admin/clients",
    name: "Client Dossier",
    component: ClientsDossierPage,
    layout: "private",
    allowedRoles: [UserRole.ADMIN, UserRole.SUPERADMIN],
  },
];

export default clientsRoutes;
