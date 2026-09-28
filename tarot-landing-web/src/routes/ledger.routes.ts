import { lazy } from "react";
import { UserRole } from "../features/auth/types/auth.types";
import type { RouteConfig } from "./app.routes";
const LedgerPage = lazy(() => import("../features/ledger/views/Ledger"));

const ledgerRoutes: RouteConfig[] = [
  {
    path: "/admin/ledger",
    name: "Ledger Page",
    component: LedgerPage,
    layout: "private",
    allowedRoles: [UserRole.SUPERADMIN],
  },
];

export default ledgerRoutes;
