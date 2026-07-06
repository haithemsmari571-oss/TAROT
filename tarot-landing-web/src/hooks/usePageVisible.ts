import { useEffect, useState } from "react";

/**
 * True while the tab is visible. Used to PAUSE perpetual animations when the
 * tab is hidden (battery + CPU on mobile).
 */
export function usePageVisible(): boolean {
  const [visible, setVisible] = useState(
    typeof document === "undefined" ? true : !document.hidden
  );
  useEffect(() => {
    const onChange = () => setVisible(!document.hidden);
    document.addEventListener("visibilitychange", onChange);
    return () => document.removeEventListener("visibilitychange", onChange);
  }, []);
  return visible;
}
