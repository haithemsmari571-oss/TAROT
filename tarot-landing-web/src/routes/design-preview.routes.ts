import { lazy, Suspense, createElement } from "react";
import type { RouteConfig } from "./app.routes";

// LAZY ON PURPOSE. hall.css carries global rules — including
// html,body{overflow:hidden} — so if it sat in the main bundle every other page
// on the site would lose scrolling. Loading it as its own chunk means those rules
// only ever reach the browser when /design-preview is actually opened.
const Hall = lazy(() => import("../features/hall/Hall"));
const HallRoute = () => createElement(Suspense, { fallback: null }, createElement(Hall));

// layout: "guest" renders with NO layout wrapper at all — no offer line, no
// navbar, no footer, no padding — which is what the locked design requires.
const designPreviewRoutes: RouteConfig[] = [
  {
    path: "/design-preview",
    name: "The hall design preview",
    component: HallRoute,
    layout: "guest",
  },
];

export default designPreviewRoutes;
