import { lazy } from "react";
import type { RouteConfig } from "./app.routes";
import { withSeo } from "../components/Seo";
const PrivacyPage = lazy(() => import("../features/privacy/views/PrivacyPage"));

const privacyRoutes: RouteConfig[] = [
  {
    path: "/privacy",
    name: "Privacy Policy",
    component: withSeo(PrivacyPage, "/privacy"),
    layout: "public",
  },
];

export default privacyRoutes;
