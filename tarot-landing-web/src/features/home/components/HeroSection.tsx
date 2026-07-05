import { motion } from "framer-motion";
import { Icon } from "@iconify/react";
import { useEffect, useState } from "react";
import { COLORS, TYPOGRAPHY } from "../../../theme";
import { useNavigate } from "react-router-dom";
import axiosClient from "../../../lib/axiosClient";

const DEFAULT_HERO = {
  badge: "Psychic & Intuitive Readings",
  headline: "Clarity, Guidance",
  headlineHighlighted: "& Divine Truth",
  subtitle:
    "Navigate life's complexity with insights you can trust. Reveal the deeper truths that matter most.",
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

  // Elegant, static hero: velvet plum vignette framing the gold background scene,
  // a gold embossed 'V' seal, lavender eyebrow, and a Bricolage headline with a
  // single lavender-to-gold accent. No scroll hijack, no floating cards — one
  // slow fade-in only.
  return (
    <section
      className="relative w-full min-h-[calc(100vh-116px)] flex flex-col items-center justify-center px-6 py-20"
      style={{ backgroundColor: "transparent" }}
    >
      {/* COLOR WASH — deep plum-wine radial vignette framing the gold scene */}
      <div
        aria-hidden
        className="absolute inset-0 pointer-events-none"
        style={{
          zIndex: 1,
          background:
            "radial-gradient(ellipse 92% 88% at 50% 46%, transparent 38%, #2A0F26 100%)",
        }}
      />

      <div className="relative z-40 w-full max-w-[920px] flex flex-col items-center text-center">
        {isLoaded && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 1.1, ease: "easeOut" }}
            className="flex flex-col items-center w-full"
          >
            {/* LOGO — gold 'V' monogram seal (navbar mark rendered in gold via mask) */}
            <div
              aria-hidden
              style={{
                width: "clamp(92px, 9.5vw, 132px)",
                aspectRatio: "810 / 963",
                backgroundColor: COLORS.starGold,
                opacity: 0.98,
                filter: "drop-shadow(0 0 18px rgba(242,174,64,0.45))",
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

            {/* Thin gold flourish line under the seal */}
            <div className="flex items-center justify-center gap-2 mt-4 mb-6">
              <div
                style={{
                  width: "clamp(48px, 7vw, 84px)",
                  height: 1,
                  background: `linear-gradient(90deg, transparent, ${COLORS.starGold})`,
                  opacity: 0.75,
                }}
              />
              <div
                style={{
                  width: 5,
                  height: 5,
                  transform: "rotate(45deg)",
                  backgroundColor: COLORS.starGold,
                  opacity: 0.8,
                }}
              />
              <div
                style={{
                  width: "clamp(48px, 7vw, 84px)",
                  height: 1,
                  background: `linear-gradient(90deg, ${COLORS.starGold}, transparent)`,
                  opacity: 0.75,
                }}
              />
            </div>

            {/* EYEBROW — small, letterspaced, lavender */}
            <span
              className="mb-5"
              style={{
                fontFamily: TYPOGRAPHY.fontFamily.body,
                color: COLORS.primary,
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: "0.38em",
                textTransform: "uppercase",
              }}
            >
              {content.badge}
            </span>

            {/* HEADLINE — Bricolage, white, one lavender→gold gradient accent */}
            <h1
              className="mb-6"
              style={{
                fontFamily: TYPOGRAPHY.fontFamily.heading,
                fontWeight: 800,
                fontSize: "clamp(3rem, 7.5vw, 5.5rem)",
                lineHeight: 1.02,
                letterSpacing: "-0.02em",
                color: COLORS.neutralWhite,
                textShadow: "0 2px 22px rgba(0,0,0,0.45)",
              }}
            >
              {content.headline} <br />
              <span
                className="inline-block"
                style={{
                  background: `linear-gradient(120deg, ${COLORS.primary} 0%, ${COLORS.starGold} 100%)`,
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  backgroundClip: "text",
                }}
              >
                {content.headlineHighlighted}
              </span>
            </h1>

            {/* Subtitle — warm white, never grey */}
            <p
              className="max-w-xl mb-8 text-base md:text-xl leading-relaxed font-light"
              style={{
                fontFamily: TYPOGRAPHY.fontFamily.body,
                color: COLORS.neutralWhite,
                opacity: 0.84,
              }}
            >
              {content.subtitle}
            </p>

            {/* PRIMARY BUTTON — brand purple, soft glow on hover */}
            <motion.button
              onClick={() => navigate("/psychics-browse")}
              whileHover={{
                scale: 1.04,
                boxShadow: `0 0 42px ${COLORS.secondary}99, 0 14px 46px ${COLORS.secondary}55`,
              }}
              whileTap={{ scale: 0.97 }}
              transition={{ type: "spring", stiffness: 400, damping: 20 }}
              className="px-11 py-5 rounded-full text-[11px] font-bold tracking-[0.28em] uppercase"
              style={{
                fontFamily: TYPOGRAPHY.fontFamily.heading,
                backgroundColor: COLORS.secondary,
                color: COLORS.neutralWhite,
                boxShadow: `0 12px 34px ${COLORS.secondary}44`,
              }}
            >
              Meet Our Readers
            </motion.button>

            {/* New-member welcome credit — the existing gold £15 pill, unchanged */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-center gap-2 px-4 py-1.5 rounded-full border mt-6 backdrop-blur-3xl"
              style={{ borderColor: `${COLORS.starGold}59`, backgroundColor: `${COLORS.starGold}1a` }}
            >
              <Icon icon="ph:gift-fill" className="text-xs" style={{ color: COLORS.starGold }} />
              <span className="uppercase tracking-[0.3em] text-[9px] font-bold" style={{ color: COLORS.starGold }}>
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
