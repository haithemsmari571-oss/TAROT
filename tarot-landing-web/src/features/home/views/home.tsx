import { useNavigate } from "react-router-dom";
import { Icon } from "@iconify/react";
import HeroSection from "../components/HeroSection";
import PsychicPanels from "../../../components/PsychicPanels";
import PsychicGrid from "../components/PsychicGrid";
import TestimonialCarousel from "../components/TestimonialCarousel";
import PageBackground from "../../../components/PageBackground";
import StardustGlider from "../../payment/components/StardustGlider";
import Seo from "../../../components/Seo";
import { COLORS } from "../../../theme";
import { useAuth } from "../../auth/hooks";
import celestialPortal from "../../../assets/backgrounds/celestial-portal.webp";

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
      {/* One fixed, immersive backdrop behind the whole page — the sections are
          transparent so the scene stays present from top to bottom (it no longer
          reverts to plain dark once you scroll past the hero). */}
      <PageBackground images={celestialPortal} variant="immersive" />
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

      {/* Thin gold divider band — welcome credit, between two mid-page sections */}
      <div className="relative px-6 py-8">
        <div className="mx-auto max-w-4xl flex items-center gap-4">
          <div className="flex-1 h-px" style={{ background: `linear-gradient(90deg, transparent, ${COLORS.starGold}66)` }} />
          <span
            className="flex items-center gap-2 text-[11px] sm:text-xs font-bold uppercase tracking-[0.18em] whitespace-nowrap"
            style={{ color: COLORS.starGold }}
          >
            <Icon icon="ph:gift-fill" className="text-sm" />
            New members get £15 free credit
          </span>
          <div className="flex-1 h-px" style={{ background: `linear-gradient(90deg, ${COLORS.starGold}66, transparent)` }} />
        </div>
      </div>

      <TestimonialCarousel />

      {/* Above-footer welcome-credit CTA */}
      <section className="relative px-6 pb-24 pt-8">
        <div className="mx-auto max-w-2xl text-center flex flex-col items-center gap-4">
          <span className="flex items-center gap-2 text-sm sm:text-base font-bold" style={{ color: COLORS.starGold }}>
            <Icon icon="ph:gift-fill" className="text-base" />
            Your first reading is on us — £15 free credit for new members.
          </span>
          <button
            onClick={() => navigate("/register")}
            className="px-8 py-3.5 rounded-full text-[11px] font-bold uppercase tracking-[0.22em] transition-transform hover:scale-105"
            style={{ backgroundColor: COLORS.starGold, color: COLORS.dark }}
          >
            Claim Your £15
          </button>
        </div>
      </section>
    </>
  );
}
