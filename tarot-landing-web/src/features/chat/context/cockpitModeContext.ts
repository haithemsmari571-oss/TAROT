import { createContext, useContext } from "react";
import type { CockpitMode } from "../../../styles/cockpitTheme";

/**
 * Which reply mode the OPEN cockpit conversation is in (null = no conversation
 * open, e.g. the Glass queue). Set by the session views from their chat-details
 * data; consumed by AdminLayout to pick the per-mode background effect and the
 * per-mode accent CSS variables. Plain value context — no fetching here.
 */
export const CockpitModeContext = createContext<{
  mode: CockpitMode | null;
  setMode: (mode: CockpitMode | null) => void;
}>({ mode: null, setMode: () => {} });

export const useCockpitMode = () => useContext(CockpitModeContext);
