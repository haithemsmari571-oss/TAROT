import { lazy } from "react";
import { UserRole } from "../features/auth/types/auth.types";
import type { RouteConfig } from "./app.routes";
const MyReviewsPage = lazy(() => import("../features/psychic-profile/views/MyReviews"));
const MyProfilePage = lazy(() => import("../features/psychic-profile/views/MyProfile"));

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
