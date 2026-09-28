import { lazy } from "react";
import type { RouteConfig } from "./app.routes";
const DoesHeMissMe = lazy(() => import("../features/seo/views/DoesHeMissMe"));
const WillMyExComeBack = lazy(() => import("../features/seo/views/WillMyExComeBack"));

// Long-form SEO content pages. Public, crawlable, prerendered at build time.
const seoRoutes: RouteConfig[] = [
  {
    path: "/does-he-miss-me",
    name: "Does He Miss Me",
    component: DoesHeMissMe,
    layout: "public",
  },
  {
    path: "/will-my-ex-come-back",
    name: "Will My Ex Come Back",
    component: WillMyExComeBack,
    layout: "public",
  },
];

export default seoRoutes;
