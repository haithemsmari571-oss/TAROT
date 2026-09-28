/* The billing mode the app should render for.

   Fetched at app load from the public GET /api/billing-mode and exposed to
   every screen that draws a price: the hall, the room, the incoming gate. A
   session payload (session_info, session-time, details) that carries its own
   billing_mode wins for that room; this is the fallback for the moments before
   a session exists or before its payload has arrived.

   Null until the fetch answers. Outside the app every caller treats null
   exactly as per-minute, so nothing about those screens changes on a network
   hiccup. The app's own screens (/app) run per-message unless the server says
   per_minute, so a failed fetch never sends a client to the old /chats hall
   (ROUND38). A failed fetch is asked again every RETRY_MS, at once when the
   browser is back online, and when a screen's Try again calls retry(); failed
   says it is missing meanwhile. */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import axiosClient from "@/lib/axiosClient";
import type { BillingMode } from "@/features/chat/types/session.types";

export const BILLING_MODE_PATH = "/billing-mode";
const RETRY_MS = 15_000;

interface BillingModeValue {
  /** "per_minute" | "per_message", or null while unknown. */
  billingMode: BillingMode | null;
  /** True once the fetch has answered, either way. */
  loaded: boolean;
  /** True while the last fetch failed; it is being asked again. */
  failed: boolean;
  /** Ask again now. */
  retry: () => void;
}

const BillingModeContext = createContext<BillingModeValue>({
  billingMode: null,
  loaded: false,
  failed: false,
  retry: () => {},
});

function asBillingMode(value: unknown): BillingMode | null {
  return value === "per_message" || value === "per_minute" ? value : null;
}

export function BillingModeProvider({ children }: { children: ReactNode }) {
  const [answer, setAnswer] = useState({ billingMode: null as BillingMode | null, loaded: false, failed: false });
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => setAttempt((count) => count + 1), []);

  useEffect(() => {
    let cancelled = false;
    axiosClient
      .get(BILLING_MODE_PATH)
      .then((response) => {
        if (cancelled) return;
        setAnswer({ billingMode: asBillingMode(response.data?.billing_mode), loaded: true, failed: false });
      })
      .catch(() => {
        if (cancelled) return;
        setAnswer((current) => ({ billingMode: current.billingMode, loaded: true, failed: true }));
      });
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  useEffect(() => {
    if (!answer.failed) return;
    const timer = window.setInterval(retry, RETRY_MS);
    window.addEventListener("online", retry);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("online", retry);
    };
  }, [answer.failed, retry]);

  const value = useMemo(() => ({ ...answer, retry }), [answer, retry]);

  return (
    <BillingModeContext.Provider value={value}>{children}</BillingModeContext.Provider>
  );
}

/** The app-level billing mode. Outside a provider (tests, harnesses) it is null. */
export function useBillingMode(): BillingModeValue {
  return useContext(BillingModeContext);
}

/** The mode a room runs on: its own payload's value first, the app's second. */
export function resolveBillingMode(
  payloadMode: BillingMode | null | undefined,
  appMode: BillingMode | null | undefined
): BillingMode | null {
  return payloadMode ?? appMode ?? null;
}
