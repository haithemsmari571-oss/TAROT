import { UserRole } from "../features/auth/types/auth.types";
import type { RouteConfig } from "./app.routes";
import AiPrompts from "../features/ai-prompts/views/AiPrompts";

const aiPromptsRoutes: RouteConfig[] = [
  {
    path: "/admin/ai-prompts",
    name: "AI Prompts",
    component: AiPrompts,
    layout: "private",
    allowedRoles: [UserRole.SUPERADMIN],
  },
];

export default aiPromptsRoutes;
