import { createElement, lazy, Suspense } from "react";
import type { RouteConfig } from "./app.routes";

const SanctuaryPage = lazy(() => import("../features/sanctuary/SanctuaryPage"));
const SanctuaryRoute = () =>
  createElement(Suspense, { fallback: null }, createElement(SanctuaryPage));

const sanctuaryRoutes: RouteConfig[] = [
  {
    path: "/sanctuary",
    name: "The Sanctuary",
    component: SanctuaryRoute,
    layout: "public",
  },
];

export default sanctuaryRoutes;
