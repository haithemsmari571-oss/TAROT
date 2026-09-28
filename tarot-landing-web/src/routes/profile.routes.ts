import { lazy } from "react";
import type { RouteConfig } from "./app.routes";
const ClientProfile = lazy(() => import("../features/profile/views/ClientProfile"));

const profileRoutes: RouteConfig[] = [
  {
    path: "/profile",
    name: "Client Profile",
    component: ClientProfile,
    layout: "public",
    requiresAuth: true,
  },
];

export default profileRoutes;
