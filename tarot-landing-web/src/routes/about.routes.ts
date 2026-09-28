import { lazy } from "react";
import type { RouteConfig } from "./app.routes";
import { withSeo } from "../components/Seo";
const AboutPage = lazy(() => import("../features/about/views/AboutPage"));

const aboutRoutes: RouteConfig[] = [
  {
    path: "/about",
    name: "About Page",
    component: withSeo(AboutPage, "/about"),
    layout: "public",
  },
];

export default aboutRoutes;
