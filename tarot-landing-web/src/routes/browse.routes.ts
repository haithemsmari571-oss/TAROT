import { lazy } from "react";
import type { RouteConfig } from "./app.routes";
import { withSeo } from "../components/Seo";
const PsychicsBrowse = lazy(() => import("../features/browse/views/PsychicsBrowse"));
// The profile with its head, which needs the reader's name (PsychicDetailsRoute.tsx).
const PsychicDetails = lazy(() => import("../features/browse/views/PsychicDetailsRoute"));

const browseRoutes: RouteConfig[] = [
  {
    path: "/psychics-browse",
    name: "Browse Psychics",
    component: withSeo(PsychicsBrowse, "/psychics-browse"),
    layout: "public",
  },
  {
    path: "/psychics/:id/details",
    name: "Psychic Details",
    component: PsychicDetails,
    layout: "public",
  },
];

export default browseRoutes;
