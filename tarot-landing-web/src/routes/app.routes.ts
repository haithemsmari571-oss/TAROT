import React from "react";
import authRoutes from "./auth.routes";
import HomeRedirect from "../features/home/views/HomeRedirect";
import home from "../features/home/views/home";
import userRoutes from "./user.routes";
import psychicsRoutes from "./psychics.routes";
import chatRoutes from "./chat.routes";
import dashboardRoutes from "./dashboard.routes";
import browseRoutes from "./browse.routes";
import profileRoutes from "./profile.routes";
import ledgerRoutes from "./ledger.routes";
import clientsRoutes from "./clients.routes";
import billingRoutes from "./billing.routes";
import zodiacRoutes from "./zodiac.routes";
import tasksRoutes from "./tasks.routes";
import aiPromptsRoutes from "./ai-prompts.routes";
import ritualsSettingsRoutes from "./rituals-settings.routes";
import lifepathRoutes from "./lifepath.routes";
import settingsRoutes from "./settings.routes";
import oracleRoutes from "./oracle.routes";
import earningsRoutes from "./earnings.routes";
import psychicProfileRoutes from "./psychic-profile.routes";
import { notificationRoutes } from "./notification.routes";
import buyOptionsRoutes from "./buy-options.routes";
import categoriesRoutes from "./categories.routes";
import onboardingRoutes from "./onboarding.routes";
import landingEditorRoutes from "./landing-editor.routes";
import aboutRoutes from "./about.routes";
import privacyRoutes from "./privacy.routes";
import termsRoutes from "./terms.routes";
import seoRoutes from "./seo.routes";
import articlesRoutes from "./articles.routes";
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
    name: "home Redirect",
    component: HomeRedirect,
    layout: "public",
  },
  {
    path: "/home",
    name: "home Page",
    component: home,
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
...clientsRoutes,
...billingRoutes,
...zodiacRoutes,
...tasksRoutes,
...aiPromptsRoutes,
...ritualsSettingsRoutes,
...lifepathRoutes,
...settingsRoutes,
...oracleRoutes,
...earningsRoutes,
...psychicProfileRoutes,
...notificationRoutes,
...buyOptionsRoutes,
...categoriesRoutes,
  ...onboardingRoutes,
...landingEditorRoutes,
...aboutRoutes,
...privacyRoutes,
...termsRoutes,
...seoRoutes,
...articlesRoutes,

];

export default routes;
