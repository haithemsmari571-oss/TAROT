import type { RouteConfig } from "./app.routes";
import { PsychicsBrowse, PsychicDetails } from "../features/browse/views";

const browseRoutes: RouteConfig[] = [
  {
    path: "/psychics-browse",
    name: "Browse Psychics",
    component: PsychicsBrowse,
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
