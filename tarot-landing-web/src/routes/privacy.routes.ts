import { PrivacyPage } from "../features/privacy/views";
import type { RouteConfig } from "./app.routes";

const privacyRoutes: RouteConfig[] = [
  {
    path: "/privacy",
    name: "Privacy Policy",
    component: PrivacyPage,
    layout: "public",
  },
];

export default privacyRoutes;
