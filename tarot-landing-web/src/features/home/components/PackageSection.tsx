import { motion, useScroll, useTransform, useSpring } from "framer-motion";
import { Icon } from "@iconify/react";
import { useRef, useState, useEffect } from "react";
import { COLORS, TYPOGRAPHY } from "../../../theme";
import CoverImg from "../../../assets/Cover.png";
import axiosClient from "../../../lib/axiosClient";
import { useAuth } from "../../auth/hooks";
import { useNavigate } from "react-router-dom";

const SYMBOLS_LIST = ["\uD83D\uDD02", "\uD83D\uDD01", "\uD83D\uDD03"];

const DEFAULT_PACKAGES = {
  badge: "The Sacred Offerings",
  heading: "Choose the",
  headingHighlighted: "Depth",
  subheading: "of Your Insight",
  packages: [
    {
      title: "Whisper Message",
      price: "15",
      tagline: "A quiet message from spirit, just for you.",
      features: [
        "1 Psychic Question Answered",
        "Clear and honest intuitive insight",
        "Energy-focused response",
      ],
      footer: "Perfect for when you need one clear answer.",
      cta: "Receive My Whisper Message",
      popular: false,
      label: "",
    },
    {
      title: "Two-Fold Truth",
      price: "20",
      tagline: "Double the clarity. Double the alignment.",
      features: [
        "2 Psychic Questions Answered",
        "Additional energy message",
        "Expanded soul-connected detail",
      ],
      footer: "For those pulled between two options or paths.",
      cta: "Reveal My Two-Fold Truth",
      popular: true,
      label: "Most Chosen by Returning Clients",
    },
    {
      title: "Deep Soul Access",
      price: "70",
      tagline: "Your full energetic reading \u2014 raw and real.",
      features: [
        "Ask up to 10 questions",
        "Full spiritual overview (Audio/Written)",
        "Channeled card spread image",
        "1 Follow-up question (48h)",
      ],
      footer: "Unlock deep guidance and the full picture.",
      cta: "Access Deep Soul Reading",
      popular: false,
      label: "",
    },
  ],
};

const PackageSection = () => {
  const containerRef = useRef(null);
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [content, setContent] = useState(DEFAULT_PACKAGES);

  useEffect(() => {
    axiosClient
      .get("/landing/packages")
      .then((res) => {
        if (res.data?.content)
          setContent({ ...DEFAULT_PACKAGES, ...res.data.content });
      })
      .catch(() => {});
  }, []);

  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start end", "end start"],
  });

  const smoothScroll = useSpring(scrollYProgress, {
    stiffness: 100,
    damping: 30,
  });

  // Parallax & Opacity Shifting
  const bgScale = useTransform(smoothScroll, [0, 1], [1.1, 1]);
  const bgY = useTransform(smoothScroll, [0, 1], ["-5%", "5%"]);
  const contentOpacity = useTransform(smoothScroll, [0, 0.2], [0, 1]);
  const floatY = useTransform(smoothScroll, [0, 1], [0, -60]);

  return (
    <section
      ref={containerRef}
      className="relative py-44 px-6 overflow-hidden"
      style={{ backgroundColor: COLORS.dark }}
    >
      {/* 1. SEAMLESS TOP TRANSITION & BACKGROUND */}
      <div className="absolute inset-0 z-0">
        <motion.div
          style={{ scale: bgScale, y: bgY }}
          className="absolute inset-0 opacity-25 grayscale-[0.9] contrast-[1.5]"
        >
          <img
            src={CoverImg}
            alt="Soul Background"
            className="w-full h-full object-cover"
          />
        </motion.div>

        {/* MASKING OVERLAYS */}
        <div className="absolute inset-0 z-10 bg-gradient-to-b from-dark via-dark/70 to-dark" />
        <div
          className="absolute inset-0 z-10"
          style={{
            background: `radial-gradient(circle at center, transparent 0%, ${COLORS.dark} 90%)`,
          }}
        />

        {/* ROTATING SACRED GEOMETRY */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[1200px] h-[1200px] pointer-events-none z-20">
          {/* 1. THE OUTER ETHER (Slowest Sweep) */}
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 100, repeat: Infinity, ease: "linear" }}
            className="absolute inset-0 rounded-full border border-white/5 shadow-[0_0_100px_rgba(255,255,255,0.05)]"
            style={{
              background: `conic-gradient(from 0deg, transparent, rgba(255,255,255,0.1), transparent 60%)`,
            }}
          />

          {/* 2. THE DIAMOND RING (Counter-Rotation + Orbs) */}
          <motion.div
            animate={{ rotate: -360 }}
            transition={{ duration: 60, repeat: Infinity, ease: "linear" }}
            className="absolute inset-[12%] rounded-full border border-white/20 shadow-[0_0_60px_rgba(255,255,255,0.1)]"
          >
            {/* Four Cardinal "Star" Points */}
            {[0, 90, 180, 270].map((deg) => (
              <div
                key={deg}
                className="absolute w-1.5 h-1.5 bg-white rounded-full shadow-[0_0_20px_#fff,0_0_40px_#fff]"
                style={{
                  top: "50%",
                  left: "50%",
                  transform: `rotate(${deg}deg) translateY(-510px) translateX(-50%)`,
                }}
              />
            ))}
          </motion.div>

          {/* 3. THE PULSING CORE (Breath Animation) */}
          <motion.div
            animate={{
              scale: [1, 1.08, 1],
              opacity: [0.3, 0.6, 0.3],
              borderWidth: ["1px", "2px", "1px"],
            }}
            transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
            className="absolute inset-[25%] rounded-full border-white/40 shadow-[0_0_50px_rgba(255,255,255,0.2),inset_0_0_30px_rgba(255,255,255,0.1)]"
          />

          {/* 4. VESTA GLOW (Central Brightness) */}
          <div className="absolute inset-[30%] rounded-full bg-white opacity-10 blur-[140px]" />

          {/* 5. MICRO-FLARE (The tiny intense center) */}
          <motion.div
            animate={{ opacity: [0.4, 0.8, 0.4] }}
            transition={{ duration: 4, repeat: Infinity }}
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-32 h-32 bg-white rounded-full blur-[60px]"
          />
        </div>
      </div>

      <motion.div
        style={{ opacity: contentOpacity }}
        className="max-w-7xl mx-auto relative z-30"
      >
        {/* 2. HEADER */}
        <div className="flex flex-col items-center text-center mb-12">
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            whileInView={{ opacity: 1, scale: 1 }}
            className="flex items-center gap-3 px-6 py-2 rounded-full border border-white/10 bg-white/[0.03] backdrop-blur-xl mb-6 shadow-2xl"
          >
            <span className="text-[10px] font-black tracking-[0.5em] uppercase text-white/50">
              {content.badge}
            </span>
          </motion.div>

          <h2
            style={{
              ...TYPOGRAPHY.headings.h2,
              fontSize: "clamp(2.8rem, 8vw, 5rem)",
              color: COLORS.neutralWhite,
            }}
            className="mb-8 tracking-tighter"
          >
            {content.heading}{" "}
            <span
              style={{
                color: COLORS.primary,
                filter: `drop-shadow(0 0 15px ${COLORS.primary}40)`,
              }}
            >
              {content.headingHighlighted}
            </span>{" "}
            {content.subheading}
          </h2>
        </div>

        {/* 3. THE 3D CARD SPREAD */}
        <div className="flex flex-col lg:flex-row items-center justify-center gap-10 lg:gap-6 perspective-2000">
          {content.packages.map((pkg, i) => (
            <motion.div
              key={pkg.id}
              initial={{ opacity: 0, y: 50 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.8, delay: i * 0.2 }}
              style={{ y: pkg.popular ? 0 : floatY }}
              className={`relative w-full max-w-[380px] group ${pkg.popular ? "z-40 scale-105 lg:scale-110" : "z-10"}`}
            >
              {/* Popular Badge */}
              {pkg.popular && pkg.label && (
                <div className="absolute -top-5 left-1/2 -translate-x-1/2 z-50 whitespace-nowrap">
                  <motion.div
                    initial={{ y: 10, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    className="px-5 py-1.5 rounded-full text-[9px] font-bold uppercase tracking-[0.2em]  border border-white/10"
                    style={{
                      backgroundColor: COLORS.secondary,
                      color: COLORS.dark,
                    }}
                  >
                    {pkg.label}
                  </motion.div>
                </div>
              )}

              {/* Card Container */}
              <div
                className={`relative p-10 rounded-[3rem] border transition-all duration-700 h-full backdrop-blur-3xl overflow-hidden shadow-2xl ${
                  pkg.popular
                    ? "border-primary/40 bg-white/[0.06]"
                    : "border-white/5 bg-white/[0.02] group-hover:bg-white/[0.04]"
                } group-hover:border-primary/60`}
              >
                {/* Background Alchemy Watermark */}
                <span className="absolute -top-6 -right-6 text-[12rem] opacity-[0.03] text-white pointer-events-none italic group-hover:opacity-[0.06] transition-opacity duration-1000">
                  {SYMBOLS_LIST[i % SYMBOLS_LIST.length]}
                </span>

                {/* Header Content */}
                <div className="relative z-10 mb-8">
                  <span
                    className="text-4xl mb-6"
                    style={{
                      color: pkg.popular ? COLORS.secondary : COLORS.primary,
                    }}
                  >
                    {SYMBOLS_LIST[i % SYMBOLS_LIST.length]}
                  </span>
                  <h3
                    style={{ fontFamily: TYPOGRAPHY.fontFamily.heading }}
                    className="text-2xl font-black text-white uppercase tracking-tighter mb-2"
                  >
                    {pkg.title}
                  </h3>
                  <div className="flex items-baseline gap-1 mb-4">
                    <span className="text-5xl font-black text-white">
                      {pkg.price}
                    </span>
                    <span className="text-white/20 text-xs uppercase tracking-widest font-light">
                      USD
                    </span>
                  </div>
                  <p className="text-white/50 text-xs leading-relaxed italic font-light h-8">
                    {pkg.tagline}
                  </p>
                </div>

                {/* Feature List */}
                <div className="relative z-10 space-y-4 mb-10 border-t border-white/10 pt-8">
                  {pkg.features.map((feature, idx) => (
                    <div
                      key={idx}
                      className="flex items-start gap-3 group/feat"
                    >
                      <Icon
                        icon="ph:sparkle-fill"
                        className="text-[10px] mt-1 transition-transform group-hover/feat:rotate-90"
                        style={{ color: COLORS.secondary }}
                      />
                      <span className="text-[11px] text-white/70 font-light tracking-wide group-hover/feat:text-white transition-colors">
                        {feature}
                      </span>
                    </div>
                  ))}
                </div>

                {/* Footer Quote */}
                <p className="relative z-10 text-[10px] text-white/30 uppercase tracking-[0.2em] mb-10 leading-loose min-h-[40px]">
                  “{pkg.footer}”
                </p>

                {/* CTA Button */}
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={
                    !isAuthenticated
                      ? () => navigate("/login")
                      : () => console.log("clicked")
                  }
                  className={`relative z-10 w-full py-3 rounded-2xl overflow-hidden uppercase transition-all duration-500 border
                          ${
                            pkg.popular
                              ? "bg-primary text-dark border-primary shadow-[0_0_20px_rgba(var(--primary-rgb),0.3)]"
                              : "bg-transparent text-primary border-primary/50 hover:border-primary"
                          }
                        `}
                  style={{
                    // Using inline style only for the custom color variable if not in Tailwind config
                    backgroundColor: pkg.popular ? COLORS.primary : undefined,
                    color: pkg.popular ? COLORS.dark : COLORS.primary,
                    borderColor: COLORS.primary,
                  }}
                >
                  {/* The "Liquid" fill effect for non-popular buttons */}
                  {!pkg.popular && (
                    <div className="absolute inset-0 bg-primary translate-y-[102%] group-hover/btn:translate-y-0 transition-transform duration-500 ease-out" />
                  )}

                  <span
                    className={`relative z-10 transition-colors duration-500 ${!pkg.popular && "group-hover/btn:text-dark"}`}
                  >
                    {pkg.cta}
                  </span>

                  {/* Subtle Glow Streak */}
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover/btn:animate-shimmer" />
                </motion.button>
              </div>

              {/* Floor Aura for Deep Soul Access */}
              {pkg.id === 3 && (
                <div className="absolute inset-0 -z-10 bg-primary/5 blur-[100px] rounded-full scale-75 opacity-0 group-hover:opacity-100 transition-opacity duration-1000" />
              )}
            </motion.div>
          ))}
        </div>

        {/* 4. FOOTER SYMBOLS */}
      </motion.div>
    </section>
  );
};

export default PackageSection;
