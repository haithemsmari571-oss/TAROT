import { Link } from "react-router-dom";
import { Icon } from "@iconify/react";
import Seo from "../../../components/Seo";
import { COLORS } from "../../../theme";

// Branded 404. SSR-safe so the prerenderer can emit a real /404.html with a
// proper 404 status at the edge.
export default function NotFound() {
  return (
    <div
      className="flex flex-col items-center justify-center w-full min-h-screen text-center px-6"
      style={{ backgroundColor: COLORS.dark, fontFamily: "'Poppins', sans-serif" }}
    >
      <Seo
        meta={{
          path: "/404",
          title: "Page Not Found | Ask Valentina",
          description: "This page has drifted out of orbit. Find your way back to Ask Valentina.",
        }}
      />
      <Icon
        icon="ph:moon-stars-duotone"
        width={72}
        height={72}
        style={{ color: COLORS.primary }}
        className="mb-6"
      />
      <h1
        className="text-3xl md:text-5xl font-extrabold mb-3"
        style={{ color: COLORS.primary, letterSpacing: "-0.02em" }}
      >
        This page has drifted out of orbit
      </h1>
      <p className="text-lg mb-10 max-w-md" style={{ color: COLORS.neutralGray }}>
        The page you're looking for isn't here — but your reading still is. Let's guide you back.
      </p>
      <div className="flex flex-col sm:flex-row gap-4">
        <Link
          to="/"
          className="px-8 py-3.5 rounded-xl font-bold uppercase tracking-widest transition-transform hover:scale-105"
          style={{ backgroundColor: COLORS.primary, color: COLORS.dark }}
        >
          Back to Home
        </Link>
        <Link
          to="/psychics-browse"
          className="px-8 py-3.5 rounded-xl font-bold uppercase tracking-widest border transition-colors"
          style={{ borderColor: COLORS.neutralDarkGray, color: COLORS.neutralWhite }}
        >
          Browse Our Readers
        </Link>
      </div>
    </div>
  );
}
