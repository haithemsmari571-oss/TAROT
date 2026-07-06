import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/hooks";
import { constellationApi } from "../profile/api/constellationApi";
import CelebrationModal from "./CelebrationModal";
import type { Celebration } from "./types";

interface CelebrationContextValue {
  celebrate: (c: Celebration) => void;
}

const CelebrationContext = createContext<CelebrationContextValue>({
  celebrate: () => {},
});

export const useCelebrations = () => useContext(CelebrationContext);

const POLL_MS = 30000;

/**
 * App-root celebration host. Server rewards (approved claims + admin gifts) are
 * polled from anywhere — on mount/auth-ready, on each route change, and every
 * 30s — and shown wherever the client is. The fetch is non-destructive and each
 * shown celebration is acknowledged on dismiss, so a StrictMode double-fetch or
 * a reload can never lose one. Local rewards (pull, streak) come via celebrate().
 */
export const CelebrationProvider = ({ children }: { children: React.ReactNode }) => {
  const { isAuthenticated } = useAuth();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [queue, setQueue] = useState<Celebration[]>([]);

  const authedRef = useRef(isAuthenticated);
  authedRef.current = isAuthenticated;
  const queueRef = useRef<Celebration[]>([]);
  queueRef.current = queue;
  // Server celebrations already surfaced this session (by notification id) — so
  // repeated polls don't re-enqueue the same one.
  const seenRef = useRef<Set<number>>(new Set());

  const celebrate = useCallback(
    (c: Celebration) => setQueue((q) => [...q, c]),
    []
  );

  const fetchServer = useCallback(async () => {
    if (!authedRef.current) return;
    try {
      const { celebrations } = await constellationApi.getCelebrations();
      const fresh = (celebrations || []).filter(
        (c) => c.id != null && !seenRef.current.has(c.id)
      );
      fresh.forEach((c) => seenRef.current.add(c.id!));
      if (fresh.length) setQueue((q) => [...q, ...(fresh as Celebration[])]);
    } catch {
      /* best-effort */
    }
  }, []);

  const ack = (c?: Celebration) => {
    if (c?.id != null) constellationApi.ackCelebrations([c.id]).catch(() => {});
  };

  const dismiss = useCallback(() => {
    ack(queueRef.current[0]);
    setQueue((q) => q.slice(1));
  }, []);

  const useStardust = useCallback(() => {
    ack(queueRef.current[0]);
    setQueue([]);
    navigate("/psychics-browse");
  }, [navigate]);

  // A celebration never survives a route change.
  useEffect(() => {
    setQueue([]);
  }, [pathname]);

  // Check for pending rewards on each view and once auth is ready.
  useEffect(() => {
    fetchServer();
  }, [pathname, isAuthenticated, fetchServer]);

  // Keep polling so a gift/approval shows within 30s while in the app.
  useEffect(() => {
    const id = window.setInterval(fetchServer, POLL_MS);
    return () => window.clearInterval(id);
  }, [fetchServer]);

  const value = useMemo(() => ({ celebrate }), [celebrate]);
  const current = queue[0];

  return (
    <CelebrationContext.Provider value={value}>
      {children}
      {current && (
        <CelebrationModal
          key={current.id ?? `${current.kind}-${current.amount}`}
          celebration={current}
          onDismiss={dismiss}
          onUseStardust={useStardust}
        />
      )}
    </CelebrationContext.Provider>
  );
};
