import { lazy } from "react";
import { UserRole } from "../features/auth/types/auth.types";
import type { RouteConfig } from "./app.routes";
const ClientsDossierPage = lazy(() => import("../features/clients/views/ClientsDossier"));

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
