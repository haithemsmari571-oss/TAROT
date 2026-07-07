import { useCallback, useEffect, useRef, useState } from "react";
import { getSessionTime } from "../api/chat";

export interface SessionTimer {
  loading: boolean;
  ready: boolean; // session-time loaded successfully
  elapsedSeconds: number;
  remainingSeconds: number;
  clientBalancePounds: number;
  estimatedCostPounds: number;
  depleted: boolean; // remaining time hit zero
  /**
   * Re-fetch the server baseline (balance, elapsed anchor). Call after a
   * top-up returns: /session-time reads live DB balances, so added funds
   * extend remainingSeconds immediately.
   */
  refresh: () => Promise<void>;
}

/**
 * Mirrors the website: fetch session-time once, then run a local 1s countdown.
 * elapsed counts up, remaining = (balance - elapsed*rate) / rate counts down.
 * Money values are POUNDS (the /session-time endpoint returns client_balance
 * and price_per_second in £, same as the website displays them); time values
 * are seconds. The countdown is unit-agnostic — balance/rate cancel out.
 */
export function useSessionTimer(
  chatId: number | null,
  enabled: boolean
): SessionTimer {
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [balance, setBalance] = useState(0); // pounds
  const [rate, setRate] = useState(0); // pounds/sec
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const fetchBaseline = useCallback(async (): Promise<boolean> => {
    if (!chatId) return false;
    try {
      const s = await getSessionTime(chatId);
      if (!mounted.current) return false;
      setBalance(s.client_balance ?? 0);
      setRate(s.price_per_second ?? 0);
      setElapsed(Math.max(0, Math.floor(s.elapsed_seconds ?? 0)));
      return true;
    } catch {
      return false;
    }
  }, [chatId]);

  // Fetch the baseline when the session becomes active.
  useEffect(() => {
    if (!chatId || !enabled) {
      setReady(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    fetchBaseline()
      .then((ok) => {
        if (!cancelled && ok) setReady(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [chatId, enabled, fetchBaseline]);

  // Local per-second tick while active.
  useEffect(() => {
    if (!ready || !enabled) return;
    const id = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(id);
  }, [ready, enabled]);

  const refresh = useCallback(async () => {
    await fetchBaseline();
  }, [fetchBaseline]);

  const estimatedCostPounds = Math.min(balance, elapsed * rate);
  const remainingSeconds =
    rate > 0 ? Math.max(0, (balance - elapsed * rate) / rate) : 0;

  return {
    loading,
    ready,
    elapsedSeconds: elapsed,
    remainingSeconds,
    clientBalancePounds: balance,
    estimatedCostPounds,
    depleted: ready && rate > 0 && remainingSeconds <= 0,
    refresh,
  };
}
