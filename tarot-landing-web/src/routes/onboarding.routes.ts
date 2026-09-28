import { lazy } from "react";
import { UserRole } from "../features/auth/types/auth.types";
import type { RouteConfig } from "./app.routes";
const PsychicOnboardingPage = lazy(() => import("../features/onboarding/views/PsychicOnboarding"));

const onboardingRoutes: RouteConfig[] = [
  {
    path: "/admin/onboarding",
    name: "Psychic Onboarding",
    component: PsychicOnboardingPage,
    layout: "private",
    allowedRoles: [UserRole.SUPERADMIN],
  },
];

export default onboardingRoutes;
