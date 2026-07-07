import { useEffect, useRef, useState } from "react";
import { getSessionTime } from "../api/chat";

export interface SessionTimer {
  loading: boolean;
  ready: boolean; // session-time loaded successfully
  elapsedSeconds: number;
  remainingSeconds: number;
  clientBalancePounds: number;
  estimatedCostPounds: number;
  depleted: boolean; // remaining time hit zero
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
  const balanceRef = useRef(0); // pounds
  const rateRef = useRef(0); // pounds/sec

  // Fetch the baseline once when the session becomes active.
  useEffect(() => {
    if (!chatId || !enabled) {
      setReady(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    getSessionTime(chatId)
      .then((s) => {
        if (cancelled) return;
        balanceRef.current = s.client_balance ?? 0;
        rateRef.current = s.price_per_second ?? 0;
        setElapsed(Math.max(0, Math.floor(s.elapsed_seconds ?? 0)));
        setReady(true);
      })
      .catch(() => {
        if (!cancelled) setReady(false);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [chatId, enabled]);

  // Local per-second tick while active.
  useEffect(() => {
    if (!ready || !enabled) return;
    const id = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(id);
  }, [ready, enabled]);

  const rate = rateRef.current;
  const balance = balanceRef.current;
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
  };
}
