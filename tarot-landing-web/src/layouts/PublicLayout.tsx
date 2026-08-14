// src/layouts/PublicLayout.tsx
import { Outlet } from "react-router-dom";
import Navbar from "./Navbar";
import Footer from "./Footer";
import AnnouncementBar from "../components/AnnouncementBar";
import WelcomePopup from "../components/WelcomePopup";
import { useAuth } from "../features/auth/hooks";
import "../styles/glass.css";

export default function PublicLayout() {
  const { isAuthenticated } = useAuth();

  return (
    <div className="min-h-screen w-full" style={{ backgroundColor: "var(--gl-base)" }}>
      {/* Slim welcome-offer bar pinned to the very top; navbar sits 36px below it. */}
      <AnnouncementBar />
      <Navbar topOffset={36} />
      <main className="pt-[104px]">
        <Outlet />
      </main>
      {!isAuthenticated && <Footer />}
      {/* One-time welcome-credit modal — new, logged-out visitors only. */}
      {!isAuthenticated && <WelcomePopup />}
    </div>
  );
}
