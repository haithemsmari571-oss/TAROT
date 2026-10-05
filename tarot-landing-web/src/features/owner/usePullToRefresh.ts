import { useEffect, useRef, useState } from "react";

/* Pull to refresh for a page that scrolls as a normal document (the owner's
   Messages screens): a finger pulling down from the very top shows the pull,
   and letting go past the mark refreshes. No library. While the screen is
   mounted the page's own overscroll is held, so Chrome on Android does not
   reload the whole page instead. */
export const PULL_TRIGGER_PX = 64;
const PULL_MAX_PX = 96;
// The finger travels twice as far as the pull shows, as native pulls feel.
const PULL_RESISTANCE = 0.5;

export function usePullToRefresh(onRefresh: () => Promise<unknown>) {
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const refresh = useRef(onRefresh);
  useEffect(() => {
    refresh.current = onRefresh;
  });

  useEffect(() => {
    const root = document.documentElement;
    const before = root.style.overscrollBehaviorY;
    root.style.overscrollBehaviorY = "contain";
    let startY: number | null = null;
    let distance = 0;
    const onStart = (event: TouchEvent) => {
      distance = 0;
      startY = window.scrollY <= 0 && event.touches.length === 1 ? event.touches[0].clientY : null;
    };
    const onMove = (event: TouchEvent) => {
      if (startY === null) return;
      const travelled = event.touches[0].clientY - startY;
      distance = travelled > 0 && window.scrollY <= 0 ? Math.min(PULL_MAX_PX, travelled * PULL_RESISTANCE) : 0;
      setPull(distance);
    };
    const onEnd = () => {
      if (startY === null) return;
      startY = null;
      const go = distance >= PULL_TRIGGER_PX;
      distance = 0;
      setPull(0);
      if (!go) return;
      setRefreshing(true);
      void refresh.current().catch(() => undefined).finally(() => setRefreshing(false));
    };
    window.addEventListener("touchstart", onStart, { passive: true });
    window.addEventListener("touchmove", onMove, { passive: true });
    window.addEventListener("touchend", onEnd);
    window.addEventListener("touchcancel", onEnd);
    return () => {
      window.removeEventListener("touchstart", onStart);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onEnd);
      window.removeEventListener("touchcancel", onEnd);
      root.style.overscrollBehaviorY = before;
    };
  }, []);

  return { pull, refreshing };
}
