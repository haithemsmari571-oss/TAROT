import type { TextStyle } from "react-native";

// ─────────────────────────────────────────────────────────────────────────────
// Central design system — the single source of truth for colors, type scale,
// spacing, radii and touch targets. Screens style exclusively from these
// tokens; hardcoded hex/rgba literals in screens are a bug.
// Mirrors the website theme (tarot-landing-web/src/theme.ts) adapted for
// mobile: larger body type and 48px minimum touch targets for the 35+ audience.
// ─────────────────────────────────────────────────────────────────────────────

export const COLORS = {
  // Backgrounds
  background: "#0B0B0B",
  surface: "#0D1117",
  surfaceElevated: "#161B22",

  // Text
  textPrimary: "#E6EDF3",
  textSecondary: "rgba(255,255,255,0.55)",
  textFaint: "rgba(255,255,255,0.4)",

  // Brand accents
  accent: "#D2B9FF", // lavender
  accentGold: "#F2AE40",
  cta: "#8A63D2", // CTA purple
  ctaText: "#FFFFFF",

  // Lines & fills
  border: "rgba(255,255,255,0.08)",
  borderStrong: "rgba(255,255,255,0.12)",
  overlay: "rgba(5,5,8,0.92)", // full-screen modal backdrop
  photoScrim: "rgba(0,0,0,0.45)", // dark pill/button laid over a photo
  frost: "rgba(255,255,255,0.05)", // faint frosted fill (system pills)

  // Status
  error: "#FF6B6B",
  online: "#22c55e",

  // Aliases kept for existing call sites (same values as the tokens above)
  surfaceLight: "#161B22",
  lavender: "#D2B9FF",
  purple: "#8A63D2",
  gold: "#F2AE40",
  text: "#E6EDF3",
  textMuted: "rgba(255,255,255,0.55)",

  // Psychic price tiers
  rising: "#C0C0C0",
  elite: "#F2AE40",
  master: "#8A63D2",
};

/** "#RRGGBB" + alpha → "rgba(...)" for translucent borders/fills of a token. */
export function alpha(hex: string, a: number): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

// Loaded in app/_layout.tsx via @expo-google-fonts; these names must match the
// keys passed to useFonts.
export const FONTS = {
  heading: "BricolageGrotesque_700Bold",
  headingExtra: "BricolageGrotesque_800ExtraBold",
  regular: "Poppins_400Regular",
  semiBold: "Poppins_600SemiBold",
  bold: "Poppins_700Bold",
};

// Named text styles. Body text never renders below 17pt; `caption` (14pt) is
// for short labels/metadata only, never paragraph text.
export const TYPOGRAPHY: Record<string, TextStyle> = {
  displayLarge: {
    fontFamily: FONTS.headingExtra,
    fontSize: 32,
    lineHeight: 38,
    color: COLORS.textPrimary,
  },
  display: {
    fontFamily: FONTS.heading,
    fontSize: 26,
    lineHeight: 32,
    color: COLORS.textPrimary,
  },
  headline: {
    fontFamily: FONTS.heading,
    fontSize: 21,
    lineHeight: 27,
    color: COLORS.textPrimary,
  },
  bodyLarge: {
    fontFamily: FONTS.regular,
    fontSize: 18,
    lineHeight: 27,
    color: COLORS.textPrimary,
  },
  body: {
    fontFamily: FONTS.regular,
    fontSize: 17,
    lineHeight: 26,
    color: COLORS.textPrimary,
  },
  caption: {
    fontFamily: FONTS.semiBold,
    fontSize: 14,
    lineHeight: 20,
    color: COLORS.textSecondary,
  },
};

export const SPACING = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
};

/** Minimum height/width for anything pressable. */
export const TOUCH_TARGET = 48;

export const RADII = {
  sm: 8,
  md: 12,
  lg: 14,
  xl: 18,
  xxl: 28,
  pill: 999,
};
