// src/layouts/PublicLayout.tsx
import { Outlet, useLocation } from "react-router-dom";
import Navbar from "./Navbar";
import Footer from "./Footer";
import AnnouncementBar from "../components/AnnouncementBar";
import WelcomePopup from "../components/WelcomePopup";
import { useAuth } from "../features/auth/hooks";
import { hasWelcomeCredit, useWelcomeCredit } from "../features/client-app/useWelcomeCredit";
import "../styles/glass.css";

// The navbar's height, and the offer bar's above it (AnnouncementBar, h-9).
const NAVBAR_HEIGHT_PX = 68;
const OFFER_BAR_HEIGHT_PX = 36;

export default function PublicLayout() {
  const { isAuthenticated } = useAuth();
  const { pathname } = useLocation();
  const isSanctuary = pathname === "/sanctuary";
  // The offer bar and its 36px go only when the server's credit is known to be
  // 0. While the figure is on its way the bar keeps its place, so the page does
  // not jump when it arrives.
  const welcomeCreditGbp = useWelcomeCredit();
  const offerBar = welcomeCreditGbp === undefined || hasWelcomeCredit(welcomeCreditGbp);

  return (
    <div className="min-h-screen w-full" style={{ backgroundColor: "var(--gl-base)" }}>
      {/* Slim welcome-offer bar pinned to the very top; navbar sits 36px below it. */}
      {offerBar && <AnnouncementBar creditGbp={welcomeCreditGbp} />}
      <Navbar topOffset={offerBar ? OFFER_BAR_HEIGHT_PX : 0} />
      <main style={{ paddingTop: NAVBAR_HEIGHT_PX + (offerBar ? OFFER_BAR_HEIGHT_PX : 0) }}>
        <Outlet />
      </main>
      {!isAuthenticated && !isSanctuary && <Footer />}
      {/* One-time welcome-credit modal — new, logged-out visitors only. */}
      {!isAuthenticated && !isSanctuary && <WelcomePopup />}
    </div>
  );
}
