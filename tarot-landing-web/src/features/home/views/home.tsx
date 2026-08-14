import { useNavigate } from "react-router-dom";
import { Icon } from "@iconify/react";
import HeroSection from "../components/HeroSection";
import PsychicPanels from "../../../components/PsychicPanels";
import PsychicGrid from "../components/PsychicGrid";
import TestimonialCarousel from "../components/TestimonialCarousel";
import PageBackground from "../../../components/PageBackground";
import StardustGlider from "../../payment/components/StardustGlider";
import Seo from "../../../components/Seo";
import { useAuth } from "../../auth/hooks";
import celestialPortal from "../../../assets/backgrounds/celestial-portal.webp";
import "../../../styles/glass.css";

export default function home() {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();

  // The live Glider is the single source of truth for pricing/tiers. On the
  // homepage the purchase action hands off to the real checkout on /billing
  // (or /login first), same as the old offering CTA did.
  const handleOffering = () =>
    isAuthenticated ? navigate("/billing") : navigate("/login");

  return (
    <>
      <Seo path="/home" />
      {/* One fixed backdrop behind the whole page — the scene stays vivid in
          both moods (the glass variant's tint follows the theme). */}
      <PageBackground images={celestialPortal} variant="glass" />
      <HeroSection />

      {/* "What your psychic already sees" — immersive image-backed panels */}
      <section className="relative py-[60px] px-4 md:py-20 md:px-6">
        <div style={{ maxWidth: 1400, margin: "0 auto" }}>
          <PsychicPanels />
        </div>
      </section>

      <PsychicGrid />

      {/* Live "Name Your Offering" Glider — the same component used on /billing */}
      <section className="relative py-32 px-6">
        <div className="mx-auto max-w-5xl">
          <StardustGlider onPurchase={handleOffering} />
        </div>
      </section>

      {/* Thin accent divider band — welcome credit, between two mid-page sections */}
      <div className="relative px-6 py-8">
        <div className="mx-auto max-w-4xl flex items-center gap-4">
          <div className="gl-divider flex-1" />
          <span className="gl-acc flex items-center gap-2 text-[11px] sm:text-xs font-semibold uppercase tracking-[0.18em] whitespace-nowrap">
            <Icon icon="ph:gift-fill" className="text-sm" />
            New members get £15 free credit
          </span>
          <div className="gl-divider flex-1" />
        </div>
      </div>

      <TestimonialCarousel />

      {/* Above-footer welcome-credit CTA */}
      <section className="relative px-6 pb-24 pt-8">
        <div className="gl-panel mx-auto max-w-2xl text-center flex flex-col items-center gap-5 px-8 py-10">
          <span className="gl-italic-note text-lg sm:text-xl">
            Your first reading is on us — £15 free credit for new members.
          </span>
          <button onClick={() => navigate("/register")} className="gl-btn-solid">
            Claim Your £15
          </button>
        </div>
      </section>
    </>
  );
}
