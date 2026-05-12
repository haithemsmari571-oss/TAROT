import type { RouteConfig } from "./app.routes";
import { ClientProfile } from "../features/profile/views";

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
