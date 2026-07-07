import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { getMyBalance } from "../api/payment";
import { useAuth } from "./AuthContext";

// App-wide "does she still have free welcome credit?" state. The £15 signup
// bonus is credited server-side on registration (and spent before paid
// balance), but until this build nothing in the app ever mentioned it. Every
// welcome-credit surface (celebration, SANCTUARY banner, free-reading CTAs,
// profile breakdown) reads from this one context so they all agree.
//
// Values come from GET /api/transactions/me/balance -> credit_balance, which
// the backend returns in pounds (the website renders it directly as £).

interface CreditState {
  /**
   * Remaining free welcome/gift credit in pounds. null = unknown (signed out
   * or not yet loaded) — treat as "no credit" so zero-credit users see nothing.
   */
  creditBalance: number | null;
  /** True once we know there is unspent free credit. */
  hasCredit: boolean;
  /** Re-fetch from the server (call on tab focus so a spent credit disappears). */
  refresh: () => Promise<void>;
}

const CreditContext = createContext<CreditState>({
  creditBalance: null,
  hasCredit: false,
  refresh: async () => {},
});

export function CreditProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [creditBalance, setCreditBalance] = useState<number | null>(null);

  const refresh = useCallback(async () => {
    if (!user) return;
    try {
      const data = await getMyBalance();
      setCreditBalance(data.credit_balance ?? 0);
    } catch {
      // Keep the last known value; every consumer guards on hasCredit anyway.
    }
  }, [user]);

  // Load on sign-in, clear on sign-out.
  useEffect(() => {
    if (!user) {
      setCreditBalance(null);
      return;
    }
    refresh();
  }, [user, refresh]);

  return (
    <CreditContext.Provider
      value={{
        creditBalance,
        hasCredit: (creditBalance ?? 0) > 0,
        refresh,
      }}
    >
      {children}
    </CreditContext.Provider>
  );
}

export function useCredit(): CreditState {
  return useContext(CreditContext);
}

/** "£15" for whole pounds, "£12.50" otherwise. */
export function formatPounds(amount: number): string {
  return Number.isInteger(amount) ? `£${amount}` : `£${amount.toFixed(2)}`;
}
