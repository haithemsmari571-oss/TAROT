import { COLORS, GLASS, MOTION, PERSONAS } from "../theme";

/** "#RRGGBB" -> "r, g, b" for rgba(var(--x-rgb), alpha) composition in CSS. */
export const rgb = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  return `${(n >> 16) & 0xff}, ${(n >> 8) & 0xff}, ${n & 0xff}`;
};

export type CockpitMode = "HUMAN" | "HYBRID" | "SABRI";

/**
 * Base CSS variables for the cockpit design system — every value derives from
 * src/theme.ts tokens; cockpit.css consumes ONLY variables (no literal colors).
 * Injected once at the AdminLayout root so all admin screens inherit them.
 */
export const COCKPIT_CSS_VARS: Record<string, string> = {
  "--glass-blur": GLASS.blur,
  "--glass-radius": GLASS.radius,
  "--glass-surface-rgb": rgb(COLORS.surface),
  "--glass-surface-accent-rgb": rgb(COLORS.surfaceAccent),
  "--glass-surface-alpha": String(GLASS.surfaceAlpha),
  "--glass-surface-accent-alpha": String(GLASS.surfaceAccentAlpha),
  "--glass-border-alpha": String(GLASS.borderAlpha),
  "--glass-glow-alpha": String(GLASS.glowAlpha),
  "--glass-inner-highlight-alpha": String(GLASS.innerHighlightAlpha),
  "--glass-white-rgb": rgb(COLORS.neutralWhite),
  "--motion-fast": MOTION.fast,
  "--motion-medium": MOTION.medium,
  "--motion-slow": MOTION.slow,
  "--ease-out": MOTION.easeOut,
  "--ease-in-out": MOTION.easeInOut,
  "--success-rgb": rgb(COLORS.success),
  // Oracle-card motif (Valentina's draft console): gold + crimson on warm dark.
  "--gold-rgb": rgb(COLORS.starGold),
  // Oracle-material accent — what .oracle-* primitives and session chrome are
  // tinted with. Defaults to gold; MODE_THEME_VARS overrides it per reply mode
  // (muted heather in Human, purple in Automatic). --gold-rgb stays literal
  // gold for surfaces that are gold regardless of mode (the sessions list).
  "--oracle-rgb": rgb(COLORS.starGold),
  // Warm-dark base tint of oracle surfaces; per-mode override (neutral surface
  // in Human — no persona warmth when no persona is active).
  "--oracle-backdrop-rgb": rgb(PERSONAS.valentina.backdrop),
  "--valentina-rgb": rgb(PERSONAS.valentina.base),
  "--valentina-backdrop-rgb": rgb(PERSONAS.valentina.backdrop),
  "--lavender-rgb": rgb(COLORS.primaryLight),
};

/**
 * Per-reply-mode accent variables — swap the token set on mode change instead of
 * maintaining three hardcoded layouts. HUMAN keeps the quiet brand lavender
 * (least decorated); HYBRID carries Valentina's crimson; SABRI (Automatic) the
 * royal purple. Values track theme.ts (PERSONAS / COLORS).
 */
export const MODE_THEME_VARS: Record<CockpitMode, Record<string, string>> = {
  HUMAN: {
    "--mode-accent": COLORS.primary,
    "--mode-accent-rgb": rgb(COLORS.primary),
    "--mode-accent-soft-rgb": rgb(COLORS.secondary),
    "--oracle-rgb": rgb(COLORS.humanQuiet),
    "--oracle-backdrop-rgb": rgb(COLORS.surface),
  },
  HYBRID: {
    "--mode-accent": PERSONAS.valentina.base,
    "--mode-accent-rgb": rgb(PERSONAS.valentina.base),
    // Same hue, darkened — a purple far-stop made tall bubbles drift
    // crimson->purple down the thread (looked accidental, was accidental).
    "--mode-accent-soft-rgb": rgb(PERSONAS.valentina.deep),
    "--oracle-rgb": rgb(COLORS.starGold),
    "--oracle-backdrop-rgb": rgb(PERSONAS.valentina.backdrop),
  },
  SABRI: {
    "--mode-accent": COLORS.primaryDark,
    "--mode-accent-rgb": rgb(COLORS.primaryDark),
    "--mode-accent-soft-rgb": rgb(COLORS.secondary),
    // Sabri's oracle accent is the readable mid-purple (secondary), not the
    // royal #5D3A9B — hairlines at low alpha and figure text need the lighter
    // value to stay legible on dark glass. Identity purple stays on halo/net.
    "--oracle-rgb": rgb(COLORS.secondary),
    "--oracle-backdrop-rgb": rgb(PERSONAS.sabri.backdrop),
  },
};
