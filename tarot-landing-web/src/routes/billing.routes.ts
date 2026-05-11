import Billing from "../features/payment/views/Billing";
import type { RouteConfig } from "./app.routes";

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
