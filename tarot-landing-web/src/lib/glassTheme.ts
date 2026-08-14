import { useCallback, useEffect, useState } from "react";

// Two-mood glass theme: "dark" (candlelight, default) and "light" (daylight).
// The tokens live in src/styles/glass.css keyed off <html data-theme="…">.
// SSR/prerender-safe: no document access at module scope.

export type GlassTheme = "dark" | "light";

const STORAGE_KEY = "av-glass-theme";

function readStoredTheme(): GlassTheme {
  if (typeof window === "undefined") return "dark";
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "light" ? "light" : "dark";
  } catch {
    return "dark";
  }
}

export function useGlassTheme() {
  const [theme, setTheme] = useState<GlassTheme>(readStoredTheme);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      window.localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      // storage unavailable (private mode) — theme still applies for the session
    }
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme((t) => (t === "dark" ? "light" : "dark"));
  }, []);

  return { theme, toggleTheme };
}
