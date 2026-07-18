import { Outlet, useLocation } from "react-router-dom";
import { useState } from "react";
import CLOUDS2 from "vanta/dist/vanta.clouds2.min";
import Sidebar from "./Sidebar";
import Navbar from "./Navbar";
import { COLORS } from "../theme";
import { VantaBackground } from "../components/VantaBackground";

const hexNum = (hex: string) => parseInt(hex.slice(1), 16);

// Cockpit clouds palette — brand tokens where a true counterpart exists
// (background -> COLORS.dark, sky -> COLORS.primaryDark), bespoke values where the
// theme has none (dusty lavender clouds, indigo shadow, deliberately MUTED gold sun —
// COLORS.starGold is far too bright for a background glow).
const COCKPIT_CLOUDS_OPTIONS = {
  mouseControls: false,
  touchControls: false,
  gyroControls: false,
  speed: 0.6,
  backgroundColor: hexNum(COLORS.dark),        // #0D1117 cosmic near-black
  skyColor: hexNum(COLORS.primaryDark),        // #5D3A9B deep royal purple
  cloudColor: hexNum("#9B8AC4"),               // dusty lavender
  cloudShadowColor: hexNum("#241547"),         // darker indigo
  sunColor: hexNum("#8A6D3A"),                 // faint warm gold, muted
  sunGlareColor: hexNum("#8A6D3A"),
  sunlightColor: hexNum("#8A6D3A"),
};

// Static same-palette fallback (prefers-reduced-motion, or effect init failure).
const COCKPIT_CLOUDS_FALLBACK = {
  background: `linear-gradient(160deg, ${COLORS.dark} 0%, #241547 55%, ${COLORS.primaryDark} 130%)`,
};

export default function AdminLayout() {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const location = useLocation();
  
  // Show sidebar for all /admin routes
  const showSidebar = location.pathname.startsWith('/admin');

  return (
    <div 
      className="flex h-screen w-full overflow-hidden" 
      style={{ backgroundColor: COLORS.dark }}
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

        {/* Cockpit background: one persistent Clouds2 layer shared by the Glass cockpit
            and the chat-detail screen. Mounted HERE (the layout survives navigation
            between the two) so the drift never restarts and no fresh WebGL context is
            spun up per navigation; leaving /admin/chats unmounts and destroys it. */}
        {location.pathname.startsWith("/admin/chats") && (
          <VantaBackground
            effect={CLOUDS2}
            options={COCKPIT_CLOUDS_OPTIONS}
            className="absolute inset-0 z-0 pointer-events-none"
            fallbackStyle={COCKPIT_CLOUDS_FALLBACK}
          />
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
  );
}