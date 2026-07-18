export const COLORS = {
  // Brand Colors (Cosmic Depth)
  primary: "#D2B9FF",       
  primaryLight: "#E8D2FF",  
  primaryDark: "#5D3A9B",   

  // Neutral Colors (The Night Sky)
  dark: "#0D1117",          
  surface: "#161B22",       
  surfaceAccent: "#21262D", 

  // UI Accents
  secondary: "#8A63D2",     
  starGold: "#F2AE40",      
  
  neutralWhite: "#E6EDF3",  
  neutralGray: "#8B949E",   
  neutralDarkGray: "#30363D",
  
  // Status Colors
  error: "#F85149",
  success: "#3FB950",
};

// ————————————————————————————————————————————————————————————————————————
// Cockpit design-system tokens (Phase 1: session cockpit; Phase 2 rolls the same
// primitives out across the admin panel). These are the single source of truth —
// src/styles/cockpitTheme.ts turns them into CSS variables, src/styles/cockpit.css
// consumes the variables. Change values here, never inline.
// ————————————————————————————————————————————————————————————————————————

/** Frosted "glass panel" surface treatment (see .glass-panel in cockpit.css). */
export const GLASS = {
  blur: "18px",
  radius: "1rem",
  surfaceAlpha: 0.55,          // frosted fill, top of gradient
  surfaceAccentAlpha: 0.4,     // frosted fill, bottom of gradient
  borderAlpha: 0.3,            // mode-accent tinted border
  glowAlpha: 0.12,             // soft outer glow in the mode accent
  innerHighlightAlpha: 0.07,   // 1px inner top highlight
};

/** Motion tokens — named durations/easings + the keyframes in cockpit.css. */
export const MOTION = {
  fast: "150ms",
  medium: "320ms",
  slow: "650ms",
  easeOut: "cubic-bezier(0.22, 1, 0.36, 1)",
  easeInOut: "cubic-bezier(0.45, 0, 0.25, 1)",
};

/** AI persona identities — halo palettes AND per-mode accent sources.
 *  (Previously private to PersonaBadge; shared so mode themes stay in sync.) */
export const PERSONAS = {
  valentina: { base: "#C1443A", backdrop: "#2A1408" }, // crimson-gold on warm dark
  sabri: { base: "#5D3A9B", backdrop: "#14092E" },     // royal purple on dark indigo
};

export const TYPOGRAPHY = {
  fontFamily: {
    heading: "'Bricolage Grotesque', sans-serif",
    body: "'Poppins', sans-serif",
    accent: "'Bricolage Grotesque', sans-serif", 
  },

  headings: {
    h1: {
      fontFamily: "'Bricolage Grotesque', sans-serif",
      fontWeight: 800, // Bricolage looks amazing at extra bold
      fontSize: "3.5rem",
      lineHeight: 1.05,
      color: "#D2B9FF",
      letterSpacing: "-0.03em", // Tighter tracking for that modern look
    },
    h2: {
      fontFamily: "'Bricolage Grotesque', sans-serif",
      fontWeight: 700,
      fontSize: "2.5rem",
      lineHeight: 1.2,
      color: "#ffffff",
      letterSpacing: "-0.02em",
    },
    h3: {
      fontFamily: "'Bricolage Grotesque', sans-serif",
      fontWeight: 600,
      fontSize: "1.75rem",
      color: "#F2AE40",
    },
  },

  fontSize: {
    xs: "0.75rem",
    sm: "0.875rem",
    base: "1rem",
    lg: "1.125rem",
    xl: "1.25rem",
    "2xl": "1.5rem",
    "3xl": "1.875rem",
    "4xl": "2.5rem",
    "5xl": "3.5rem",
  },
};