import { PsychicOnboardingPage } from "../features/onboarding/views";
import { UserRole } from "../features/auth/types/auth.types";
import type { RouteConfig } from "./app.routes";

const onboardingRoutes: RouteConfig[] = [
  {
    path: "/admin/onboarding",
    name: "Psychic Onboarding",
    component: PsychicOnboardingPage,
    layout: "private",
    allowedRoles: [UserRole.ADMIN, UserRole.SUPERADMIN],
  },
];

export default onboardingRoutes;
