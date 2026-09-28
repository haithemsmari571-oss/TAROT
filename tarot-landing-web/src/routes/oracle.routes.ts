import { lazy } from "react";


import type { RouteConfig } from "./app.routes";
import { withSeo } from "../components/Seo";
const oraclePage = lazy(() => import("../features/oracle/views/oracle"));


const oracleRoutes: RouteConfig[] = [
  {
    path: "/oracle",
    name: "oracle Page",
    component: withSeo(oraclePage, "/oracle"),
    layout: "public",
  },
    
];

export default oracleRoutes;
