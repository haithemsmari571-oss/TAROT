import { Link } from "react-router-dom";
import { Icon } from "@iconify/react";
import Seo from "../../../components/Seo";
import "../../../styles/glass.css";

// Branded 404. SSR-safe so the prerenderer can emit a real /404.html with a
// proper 404 status at the edge.
export default function NotFound() {
  return (
    <div
      className="flex flex-col items-center justify-center w-full min-h-screen text-center px-6"
      style={{ background: "var(--gl-base)", fontFamily: "var(--gl-sans)" }}
    >
      <Seo
        meta={{
          path: "/404",
          title: "Page Not Found | Ask Valentina",
          description: "This page has drifted out of orbit. Find your way back to Ask Valentina.",
        }}
      />
      <div className="gl-panel flex flex-col items-center w-full max-w-xl px-8 py-12 md:px-14 md:py-14">
        <Icon
          icon="ph:moon-stars-duotone"
          width={64}
          height={64}
          style={{ color: "var(--gl-accent)" }}
          className="mb-6"
        />
        <p className="gl-kicker">Four Oh Four</p>
        <h1 className="gl-h2 mb-4">
          This page has drifted <i>out of orbit</i>
        </h1>
        <p className="gl-sub" style={{ marginBottom: 34 }}>
          The page you're looking for isn't here — but your reading still is. Let's guide you back.
        </p>
        <div className="flex flex-col sm:flex-row gap-4">
          <Link
            to="/"
            className="gl-btn-solid inline-block"
            style={{ padding: "13px 30px", textDecoration: "none" }}
          >
            Back to Home
          </Link>
          <Link
            to="/psychics-browse"
            className="gl-btn-ghost inline-block"
            style={{ padding: "13px 30px", textDecoration: "none" }}
          >
            Browse Our Readers
          </Link>
        </div>
      </div>
    </div>
  );
}
