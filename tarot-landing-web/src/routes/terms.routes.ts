import { lazy } from "react";
import type { RouteConfig } from "./app.routes";
import { withSeo } from "../components/Seo";
const TermsPage = lazy(() => import("../features/terms/views/TermsPage"));

const termsRoutes: RouteConfig[] = [
  {
    path: "/terms",
    name: "Terms of Service",
    component: withSeo(TermsPage, "/terms"),
    layout: "public",
  },
];

export default termsRoutes;
