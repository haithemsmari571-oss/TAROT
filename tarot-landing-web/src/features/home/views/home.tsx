import { useNavigate } from "react-router-dom";
import HeroSection from "../components/HeroSection";
import PsychicPanels from "../../../components/PsychicPanels";
import PsychicGrid from "../components/PsychicGrid";
import TestimonialCarousel from "../components/TestimonialCarousel";
import PageBackground from "../../../components/PageBackground";
import StardustGlider from "../../payment/components/StardustGlider";
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

      <TestimonialCarousel />
    </>
  );
}
