import React from "react";
import authRoutes from "./auth.routes";
import { homePage } from "../features/home/views";
import userRoutes from "./user.routes";
import psychicsRoutes from "./psychics.routes";
import chatRoutes from "./chat.routes";
import dashboardRoutes from "./dashboard.routes";
import browseRoutes from "./browse.routes";
import profileRoutes from "./profile.routes";
import ledgerRoutes from "./ledger.routes";
import billingRoutes from "./billing.routes";
import zodiacRoutes from "./zodiac.routes";
import lifepathRoutes from "./lifepath.routes";
import settingsRoutes from "./settings.routes";
import oracleRoutes from "./oracle.routes";
import earningsRoutes from "./earnings.routes";
import psychicProfileRoutes from "./psychic-profile.routes";
import { notificationRoutes } from "./notification.routes";
import buyOptionsRoutes from "./buy-options.routes";
import categoriesRoutes from "./categories.routes";
import landingEditorRoutes from "./landing-editor.routes";
import aboutRoutes from "./about.routes";
import privacyRoutes from "./privacy.routes";
import termsRoutes from "./terms.routes";
import { UserRole } from "../features/auth/types/auth.types";


export interface RouteConfig {
  path: string;
  component: React.ComponentType<unknown>;
  name: string;
  layout: "guest" | "private" | "public";
  allowedRoles?: UserRole[];
  requiresAuth?: boolean;
}

const routes: RouteConfig[] = [
  {
    path: "/",
    name: "home Page",
    component: homePage,
    layout: "public",
  },
  {
    path: "/home",
    name: "home Page",
    component: homePage,
    layout: "public",
  },
  ...authRoutes,
...userRoutes,
...psychicsRoutes,
...chatRoutes,
...dashboardRoutes,
...browseRoutes,
...profileRoutes,
...ledgerRoutes,
...billingRoutes,
...zodiacRoutes,
...lifepathRoutes,
...settingsRoutes,
...oracleRoutes,
...earningsRoutes,
...psychicProfileRoutes,
...notificationRoutes,
...buyOptionsRoutes,
...categoriesRoutes,
...landingEditorRoutes,
...aboutRoutes,
...privacyRoutes,
...termsRoutes,

];

export default routes;
