import { LedgerPage } from "../features/ledger/views";
import { UserRole } from "../features/auth/types/auth.types";
import type { RouteConfig } from "./app.routes";

const ledgerRoutes: RouteConfig[] = [
  {
    path: "/admin/ledger",
    name: "Ledger Page",
    component: LedgerPage,
    layout: "private",
    allowedRoles: [UserRole.ADMIN, UserRole.SUPERADMIN],
  },
];

export default ledgerRoutes;
