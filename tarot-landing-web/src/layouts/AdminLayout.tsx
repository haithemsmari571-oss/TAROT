import { Outlet, useLocation } from "react-router-dom";
import { useEffect, useState } from "react";
import CLOUDS2 from "vanta/dist/vanta.clouds2.min";
import NET from "vanta/dist/vanta.net.min";
import Sidebar from "./Sidebar";
import Navbar from "./Navbar";
import { COLORS, MOTION, PERSONAS } from "../theme";
import { VantaBackground } from "../components/VantaBackground";
import { COCKPIT_CSS_VARS, MODE_THEME_VARS, CockpitMode } from "../styles/cockpitTheme";
import { CockpitModeContext } from "../features/chat/context/cockpitModeContext";
import "../styles/cockpit.css";

const hexNum = (hex: string) => parseInt(hex.slice(1), 16);

// Cockpit clouds palette — brand tokens where a true counterpart exists
// (background -> COLORS.dark, sky -> COLORS.primaryDark), bespoke values where the
// theme has none (dusty lavender clouds, near-white cream light).
//
// CLOUDS2's shader has exactly these uniforms: skyColor, cloudColor, lightColor
// (cloudShadowColor and the sun* options belong to the older CLOUDS effect and are
// silently inert here). texturePath is MANDATORY: the shader's entire cloud density
// is sampled from that noise image, and the dist default points at a URL that only
// exists in vanta's own gallery — without a valid texture the "clouds" render as a
// featureless sky gradient. /noise.png is deterministic, generated RGBA noise.
//
// lightColor is NOT an accent: the shader shades every cloud pixel with
// mix(lightColor, cloudColor, density), so thin/edge areas — most of the visible
// cloud surface — are almost pure lightColor. A saturated value here tints the
// whole scene (the muted gold #8A6D3A washed everything tan); it must stay
// near-white so skyColor/cloudColor read as the actual palette, with only a
// whisper of warmth in the cream.
const COCKPIT_CLOUDS_OPTIONS = {
  mouseControls: false,
  touchControls: false,
  gyroControls: false,
  speed: 0.6,
  texturePath: "/noise.png",
  backgroundColor: hexNum(COLORS.dark),        // #0D1117 cosmic near-black
  skyColor: hexNum(COLORS.primaryDark),        // #5D3A9B deep royal purple
  cloudColor: hexNum("#9B8AC4"),               // dusty lavender
  lightColor: hexNum("#EFE9DC"),               // pale warm cream, near-white
};

// Static same-palette fallback (prefers-reduced-motion, or effect init failure).
const COCKPIT_CLOUDS_FALLBACK = {
  background: `linear-gradient(160deg, ${COLORS.dark} 0%, #241547 55%, ${COLORS.primaryDark} 130%)`,
};

// Automatic (Sabri) background: NET recolored out of the demo pink into the royal
// purple family on the dark navy base. NET's real option set (confirmed against
// vanta.net.min.js defaultOptions: color, backgroundColor, points, maxDistance,
// spacing, showDots — there is NO speed option) — "calmer/sparser than the demo"
// comes from fewer points + wider spacing + shorter link distance.
const COCKPIT_NET_OPTIONS = {
  mouseControls: false,
  touchControls: false,
  gyroControls: false,
  color: hexNum(PERSONAS.sabri.base),          // #5D3A9B royal purple
  backgroundColor: hexNum(COLORS.dark),        // #0D1117 dark navy base
  points: 6,                                   // demo: 10
  spacing: 22,                                 // demo: 15
  maxDistance: 19,                             // demo: 20
  showDots: true,
};

const COCKPIT_NET_FALLBACK = {
  background: `radial-gradient(circle at 70% 30%, ${PERSONAS.sabri.base}30 0%, ${COLORS.dark} 65%)`,
};

// Sessions-list (queue) background: the same sparse NET, recolored out of Sabri's
// purple into the Valentina crimson — the list isn't tied to a persona, so it
// carries the primary crimson-gold brand family instead. Same calm tuning.
const QUEUE_NET_OPTIONS = {
  mouseControls: false,
  touchControls: false,
  gyroControls: false,
  color: hexNum(PERSONAS.valentina.base),      // #C1443A crimson
  backgroundColor: hexNum(COLORS.dark),        // #0D1117 dark base
  points: 6,                                   // demo: 10
  spacing: 22,                                 // demo: 15
  maxDistance: 19,                             // demo: 20
  showDots: true,
};

const QUEUE_NET_FALLBACK = {
  background: `radial-gradient(circle at 30% 20%, ${PERSONAS.valentina.base}28 0%, transparent 55%), radial-gradient(circle at 80% 70%, ${COLORS.starGold}14 0%, transparent 60%), ${COLORS.dark}`,
};

// Human mode: no AI is active — no effect at all, just the same-palette gradient
// dimmed to read calm and quiet ("you are fully in control").
const COCKPIT_HUMAN_STYLE = {
  ...COCKPIT_CLOUDS_FALLBACK,
  opacity: 0.45,
};

const MODE_FADE_MS = parseInt(MOTION.slow, 10);

export default function AdminLayout() {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const location = useLocation();
  // Reply mode of the open cockpit conversation (set by the session views via
  // CockpitModeContext); null = no conversation open → the sessions-list (queue)
  // look: crimson NET. CSS accent variables still fall back to the Hybrid set —
  // the queue's oracle styling is built on the same crimson-gold family.
  const [cockpitMode, setCockpitMode] = useState<CockpitMode | null>(null);
  const activeMode: CockpitMode = cockpitMode ?? "HYBRID";
  type BgMode = CockpitMode | "QUEUE";
  const activeBg: BgMode = cockpitMode ?? "QUEUE";

  // Mode switches fade the background through a brief dark hold, then mount the
  // new effect — deliberately NOT a dual-canvas crossfade: two live WebGL effects
  // overlapping is a real perf risk (Halo alone is expensive), and unmounting
  // first keeps the one-canvas-at-a-time + .destroy() discipline intact.
  const [renderedMode, setRenderedMode] = useState<BgMode>(activeBg);
  const [bgVisible, setBgVisible] = useState(true);
  useEffect(() => {
    if (renderedMode === activeBg) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- deliberate: starts the fade-out leg of the mode transition; the swap happens in the timeout
    setBgVisible(false);
    const t = setTimeout(() => {
      setRenderedMode(activeBg);
      setBgVisible(true);
    }, MODE_FADE_MS);
    return () => clearTimeout(t);
  }, [activeBg, renderedMode]);

  // Show sidebar for all /admin routes
  const showSidebar = location.pathname.startsWith('/admin');

  return (
    <CockpitModeContext.Provider value={{ mode: cockpitMode, setMode: setCockpitMode }}>
    <div
      className="flex h-screen w-full overflow-hidden"
      // Design-system CSS variables (glass surfaces, motion tokens, mode accents)
      // injected here so every admin screen inherits them; values live in theme.ts.
      style={{ backgroundColor: COLORS.dark, ...COCKPIT_CSS_VARS, ...MODE_THEME_VARS[activeMode] }}
    >
      {/* Show Navbar for non-admin routes */}
      {!showSidebar && <Navbar />}
      
      {/* 1. SIDEBAR: Fixed width on desktop, drawer on mobile - Only show for admin routes */}
      {showSidebar && (
        <>
          <div 
            className={`
              fixed inset-y-0 left-0 z-50 w-72 transform transition-transform duration-300 lg:relative lg:translate-x-0
              ${mobileNavOpen ? "translate-x-0" : "-translate-x-full"}
            `}
          >
            <Sidebar />
          </div>

          {/* 2. MOBILE OVERLAY: Closes sidebar when clicking outside */}
          {mobileNavOpen && (
            <div 
              className="fixed inset-0 z-40 bg-black/60 lg:hidden backdrop-blur-sm" 
              onClick={() => setMobileNavOpen(false)}
            />
          )}
        </>
      )}

      {/* 3. MAIN CONTENT: Scrollable area for Admin Pages */}
      <main className="flex-1 flex flex-col min-w-0 h-full relative">

        {/* Cockpit background: one persistent per-mode layer shared by the Glass
            cockpit and the chat-detail screen. Mounted HERE (the layout survives
            navigation between the two) so the drift never restarts per navigation;
            leaving /admin/chats — or switching mode — unmounts and destroys it.
            HYBRID: Clouds2 (Valentina). SABRI: Net (royal purple, sparse).
            HUMAN: no effect, dimmed static gradient.
            QUEUE (no conversation open — the sessions list): Net, crimson. */}
        {location.pathname.startsWith("/admin/chats") && (
          <div
            className="absolute inset-0 z-0 pointer-events-none mode-fade"
            style={{ opacity: bgVisible ? 1 : 0, backgroundColor: COLORS.dark }}
          >
            {renderedMode === "HYBRID" && (
              <VantaBackground
                effect={CLOUDS2}
                options={COCKPIT_CLOUDS_OPTIONS}
                className="absolute inset-0"
                fallbackStyle={COCKPIT_CLOUDS_FALLBACK}
                debugLabel="clouds2"
              />
            )}
            {renderedMode === "SABRI" && (
              <VantaBackground
                effect={NET}
                options={COCKPIT_NET_OPTIONS}
                className="absolute inset-0"
                fallbackStyle={COCKPIT_NET_FALLBACK}
                debugLabel="net"
              />
            )}
            {renderedMode === "HUMAN" && (
              <div className="absolute inset-0" style={COCKPIT_HUMAN_STYLE} />
            )}
            {renderedMode === "QUEUE" && (
              <VantaBackground
                effect={NET}
                options={QUEUE_NET_OPTIONS}
                className="absolute inset-0"
                fallbackStyle={QUEUE_NET_FALLBACK}
                debugLabel="net-queue"
              />
            )}
          </div>
        )}

        {/* Mobile Toggle Button (Floating) - Only show for admin routes */}
        {showSidebar && (
          <button 
            onClick={() => setMobileNavOpen(true)}
            className="lg:hidden absolute top-4 left-4 z-30 p-2 rounded-xl border shadow-2xl transition-transform active:scale-90"
            style={{ 
              backgroundColor: COLORS.surface, 
              borderColor: COLORS.neutralDarkGray,
              color: COLORS.primary 
            }}
          >
            <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
              <path d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
        )}

        {/* The Page Content (Outlet) — kept above the cockpit background layer */}
        <div className={`relative z-10 flex-1 overflow-y-auto p-4 md:p-8 lg:p-10 custom-scrollbar ${!showSidebar ? 'pt-20' : ''}`}>
          <div className="max-w-[1600px] mx-auto">
            <Outlet />
          </div>
        </div>
      </main>
    </div>
    </CockpitModeContext.Provider>
  );
}