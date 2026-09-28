import { lazy } from "react";
import { UserRole } from "../features/auth/types/auth.types";
import type { RouteConfig } from "./app.routes";
const LandingEditorPage = lazy(() => import("../features/landing-editor/views/LandingEditor"));

const landingEditorRoutes: RouteConfig[] = [
  {
    path: "/admin/landing",
    name: "Landing Editor",
    component: LandingEditorPage,
    layout: "private",
    allowedRoles: [UserRole.SUPERADMIN],
  },
];

export default landingEditorRoutes;
