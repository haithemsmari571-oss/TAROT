import { TermsPage } from "../features/terms/views";
import type { RouteConfig } from "./app.routes";

const termsRoutes: RouteConfig[] = [
  {
    path: "/terms",
    name: "Terms of Service",
    component: TermsPage,
    layout: "public",
  },
];

export default termsRoutes;
