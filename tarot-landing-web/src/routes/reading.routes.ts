import { lazy, Suspense, createElement } from "react";
import { useParams } from "react-router-dom";
import type { RouteConfig } from "./app.routes";
import { ProtectedRoute } from "../features/auth/components";

// LAZY FOR THE SAME REASON AS /design-preview. hall.css carries global rules —
// including html,body{overflow:hidden} — so it must never sit in the main
// bundle. It arrives only when she actually opens a reading.
const Hall = lazy(() => import("../features/hall/Hall"));

// layout "guest" renders with no wrapper at all — no navbar, no footer, no offer
// line — which is what the design requires. Guest routes carry no guard of their
// own (App.tsx:165-169), so the guard is applied here: a reading needs an
// account, and PsychicDetails already sends signed-out visitors to /login.
const ReadingEntry = () => {
  const { psychicId } = useParams<{ psychicId: string }>();
  return createElement(
    ProtectedRoute,
    null,
    createElement(
      Suspense,
      { fallback: null },
      createElement(Hall, {
        mode: "entry" as const,
        psychicId: psychicId ? parseInt(psychicId, 10) : undefined,
      })
    )
  );
};

const readingRoutes: RouteConfig[] = [
  {
    path: "/reading/new/:psychicId",
    name: "Begin a reading",
    component: ReadingEntry,
    layout: "guest",
  },
];

export default readingRoutes;
