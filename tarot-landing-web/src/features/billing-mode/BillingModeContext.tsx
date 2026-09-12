/* The billing mode the app should render for.

   Fetched ONCE at app load from the public GET /api/billing-mode and exposed to
   every screen that draws a price: the hall, the room, the incoming gate. A
   session payload (session_info, session-time, details) that carries its own
   billing_mode wins for that room; this is the fallback for the moments before
   a session exists or before its payload has arrived.

   Null until the fetch answers, and null forever if it fails, which every
   caller treats exactly as per-minute, so nothing about today's screens can
   change on a network hiccup. */

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import axiosClient from "@/lib/axiosClient";
import type { BillingMode } from "@/features/chat/types/session.types";

export const BILLING_MODE_PATH = "/billing-mode";

interface BillingModeValue {
  /** "per_minute" | "per_message", or null while unknown. */
  billingMode: BillingMode | null;
  /** True once the fetch has answered, either way. */
  loaded: boolean;
}

const BillingModeContext = createContext<BillingModeValue>({
  billingMode: null,
  loaded: false,
});

function asBillingMode(value: unknown): BillingMode | null {
  return value === "per_message" || value === "per_minute" ? value : null;
}

export function BillingModeProvider({ children }: { children: ReactNode }) {
  const [value, setValue] = useState<BillingModeValue>({ billingMode: null, loaded: false });

  useEffect(() => {
    let cancelled = false;
    axiosClient
      .get(BILLING_MODE_PATH)
      .then((response) => {
        if (cancelled) return;
        setValue({ billingMode: asBillingMode(response.data?.billing_mode), loaded: true });
      })
      .catch(() => {
        if (cancelled) return;
        setValue({ billingMode: null, loaded: true });
      });
    return () => {
      cancelled = true;
    };
  }, []);

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
