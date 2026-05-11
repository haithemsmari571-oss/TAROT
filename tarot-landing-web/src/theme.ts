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