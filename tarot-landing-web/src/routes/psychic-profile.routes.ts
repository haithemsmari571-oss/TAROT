import { MyReviewsPage, MyProfilePage } from "../features/psychic-profile/views";
import { UserRole } from "../features/auth/types/auth.types";
import type { RouteConfig } from "./app.routes";

const psychicProfileRoutes: RouteConfig[] = [
  {
    path: "/admin/my-reviews",
    name: "My Reviews Page",
    component: MyReviewsPage,
    layout: "private",
    allowedRoles: [UserRole.PSYCHIC],
  },
  {
    path: "/admin/my-profile",
    name: "My Profile Page",
    component: MyProfilePage,
    layout: "private",
    allowedRoles: [UserRole.PSYCHIC],
  },
];

export default psychicProfileRoutes;
