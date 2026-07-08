import { useCallback, useEffect, useRef, useState } from "react";
import { useFocusEffect } from "expo-router";
import { getMyBalance } from "../api/payment";

interface StardustBalanceState {
  balance: number | null;
  /** Remaining free welcome/gift credit in pounds (null until loaded). */
  creditBalance: number | null;
  loading: boolean;
  /** Set when the last fetch failed (e.g. no network). */
  error: string | null;
  /** Re-fetch the balance. Resolves to the new balance, or null on failure. */
  refetch: () => Promise<number | null>;
}

/**
 * Fetches the signed-in user's Stardust balance from the backend (the same
 * source the website's Billing page uses). Shared by the Profile hub and the
 * Stardust purchase screen so both read balance the same way.
 */
export function useStardustBalance(): StardustBalanceState {
  const [balance, setBalance] = useState<number | null>(null);
  const [creditBalance, setCreditBalance] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);

  const refetch = useCallback(async (): Promise<number | null> => {
    setLoading(true);
    setError(null);
    try {
      const data = await getMyBalance();
      if (mounted.current) {
        setBalance(data.balance);
        setCreditBalance(data.credit_balance ?? 0);
      }
      return data.balance;
    } catch {
      if (mounted.current) {
        setError("Couldn't load your Stardust balance. Check your connection.");
      }
      return null;
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // Refetch on every screen FOCUS, not just mount: the tab navigator keeps
  // screens mounted, and the balance changes behind their back (message fees,
  // session charges, website top-ups). Focus includes the initial mount, so
  // this also does the first load. The spinner only shows while balance is
  // still null, so a focus refetch never flashes over a displayed number.
  useFocusEffect(
    useCallback(() => {
      refetch();
    }, [refetch])
  );

  return { balance, creditBalance, loading, error, refetch };
}
