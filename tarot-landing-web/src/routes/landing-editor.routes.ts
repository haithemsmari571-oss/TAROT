import { LandingEditorPage } from "../features/landing-editor/views";
import { UserRole } from "../features/auth/types/auth.types";
import type { RouteConfig } from "./app.routes";

const landingEditorRoutes: RouteConfig[] = [
  {
    path: "/admin/landing",
    name: "Landing Editor",
    component: LandingEditorPage,
    layout: "private",
    allowedRoles: [UserRole.ADMIN, UserRole.SUPERADMIN],
  },
];

export default landingEditorRoutes;
