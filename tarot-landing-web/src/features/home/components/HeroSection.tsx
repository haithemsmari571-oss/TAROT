import { motion } from "framer-motion";
import { Icon } from "@iconify/react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import axiosClient from "../../../lib/axiosClient";
import { sanitizeClaims } from "../../../lib/copy";
import "../../../styles/glass.css";

const DEFAULT_HERO = {
  badge: "Psychic & Intuitive Readings",
  headline: "Clarity, Guidance",
  headlineHighlighted: "& Gentle Perspective",
  subtitle:
    "Navigate life's complexity with a reader who listens. Find the clarity and comfort that matter most.",
};

const HeroSection = () => {
  const getInitialHeroContent = () => {
    const cached = localStorage.getItem("landing_hero_content");
    if (cached) {
      try {
        return JSON.parse(cached);
      } catch (e) {}
    }
    return DEFAULT_HERO;
  };

  const [content, setContent] = useState(getInitialHeroContent);
  const [isLoaded, setIsLoaded] = useState(() => {
    return !!localStorage.getItem("landing_hero_content");
  });
  const navigate = useNavigate();

  useEffect(() => {
    axiosClient
      .get("/landing/hero")
      .then((res) => {
        if (res.data?.content) {
          const newContent = { ...DEFAULT_HERO, ...res.data.content };
          setContent(newContent);
          localStorage.setItem("landing_hero_content", JSON.stringify(newContent));
        }
        setIsLoaded(true);
      })
      .catch(() => {
        setIsLoaded(true);
      });
  }, []);

  // Glass hero: the artwork stays vivid behind a large frosted panel that
  // carries readability in both moods. Serif Fraunces headline with italic
  // emphasis; DB-driven copy passes through the claims sanitizer.
  return (
    <section className="relative w-full min-h-[calc(100vh-104px)] flex flex-col items-center justify-center px-4 sm:px-6 py-16">
      <div className="relative z-40 w-full max-w-[880px] flex flex-col items-center text-center">
        {isLoaded && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 1.1, ease: "easeOut" }}
            className="gl-hero-panel--solid w-full flex flex-col items-center px-6 py-12 sm:px-12 sm:py-14"
          >
            {/* Monogram seal — champagne accent, quiet glow */}
            <div
              aria-hidden
              style={{
                width: "clamp(72px, 7vw, 104px)",
                aspectRatio: "810 / 963",
                backgroundColor: "var(--gl-accent)",
                opacity: 0.95,
                WebkitMaskImage: "url('/logo short normal.svg')",
                maskImage: "url('/logo short normal.svg')",
                WebkitMaskRepeat: "no-repeat",
                maskRepeat: "no-repeat",
                WebkitMaskPosition: "center",
                maskPosition: "center",
                WebkitMaskSize: "contain",
                maskSize: "contain",
              }}
            />

            {/* Hairline flourish under the seal */}
            <div className="flex items-center justify-center gap-2 mt-4 mb-7 w-full max-w-[280px]">
              <div className="gl-divider flex-1" />
              <div
                style={{
                  width: 5,
                  height: 5,
                  transform: "rotate(45deg)",
                  backgroundColor: "var(--gl-accent)",
                  opacity: 0.8,
                }}
              />
              <div className="gl-divider flex-1" />
            </div>

            <div className="gl-kicker">{sanitizeClaims(content.badge)}</div>

            <h1 className="gl-h1" style={{ marginBottom: 18 }}>
              {sanitizeClaims(content.headline)}
              <br />
              <i>{sanitizeClaims(content.headlineHighlighted)}</i>
            </h1>

            <p className="gl-sub" style={{ marginBottom: 32 }}>
              {sanitizeClaims(content.subtitle)}
            </p>

            <motion.button
              onClick={() => navigate("/psychics-browse")}
              whileTap={{ scale: 0.97 }}
              className="gl-btn-solid"
              style={{ padding: "14px 38px", fontSize: 13 }}
            >
              Meet Our Readers
            </motion.button>

            {/* New-member welcome credit chip */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="gl-fchip mt-6"
              style={{ cursor: "default" }}
            >
              <Icon icon="ph:gift-fill" className="text-xs gl-acc" />
              <span className="gl-acc" style={{ fontSize: 11, fontWeight: 600, letterSpacing: "1.4px", textTransform: "uppercase" }}>
                New here? £15 free credit
              </span>
            </motion.div>
          </motion.div>
        )}
      </div>
    </section>
  );
};

export default HeroSection;
