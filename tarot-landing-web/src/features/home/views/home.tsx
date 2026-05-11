import HeroSection from "../components/HeroSection";
import ServiceSection from "../components/ServiceSection";
import PsychicGrid from "../components/PsychicGrid";
import PackageSection from "../components/PackageSection";
import TestimonialCarousel from "../components/TestimonialCarousel";

export default function home() {
  return (
    <>
      <HeroSection />
      <ServiceSection />
      <PsychicGrid />
      <PackageSection />
      <TestimonialCarousel />
    </>
  );
}