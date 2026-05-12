import { AboutPage } from "../features/about/views";
import type { RouteConfig } from "./app.routes";

const aboutRoutes: RouteConfig[] = [
  {
    path: "/about",
    name: "About Page",
    component: AboutPage,
    layout: "public",
  },
];

export default aboutRoutes;
