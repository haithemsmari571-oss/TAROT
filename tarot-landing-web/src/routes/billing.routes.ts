import { lazy } from "react";
import type { RouteConfig } from "./app.routes";
const Billing = lazy(() => import("../features/payment/views/Billing"));

const billingRoutes: RouteConfig[] = [
  {
    path: "/billing",
    name: "Billing & Top Up",
    component: Billing,
    layout: "public",
    requiresAuth: true,
  },
];

export default billingRoutes;
