

import { oraclePage } from "../features/oracle/views";
import type { RouteConfig } from "./app.routes";


const oracleRoutes: RouteConfig[] = [
  {
    path: "/oracle",
    name: "oracle Page",
    component: oraclePage,
    layout: "public",
  },
    
];

export default oracleRoutes;
