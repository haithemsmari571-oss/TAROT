import {
  motion,
  useScroll,
  useTransform,
  useSpring,
  useMotionValue,
} from "framer-motion";
import { Icon } from "@iconify/react";
import { useRef, useEffect, useMemo, useState } from "react";
import { COLORS, TYPOGRAPHY } from "../../../theme";
import { useNavigate } from "react-router-dom";
import axiosClient from "../../../lib/axiosClient";

const DEFAULT_HERO = {
  badge: "Psychic & Intuitive Readings",
  name: "Haithem Smari",
  headline: "Clarity, Guidance",
  headlineHighlighted: "& Divine Truth",
  subtitle:
    "Navigate life's complexity with insights you can trust. Reveal the deeper truths that matter most.",
  primaryCta: "HIRE ME",
  secondaryCta: "THE ARCHIVE",
};

const TAROT_ASSETS = [
  "0.png",
  "1.png",
  "2.png",
  "4.png",
  "5.png",
  "23.png",
  "24.png",
  "25.png",
  "26.png",
  "27.png",
  "28.png",
  "29.png",
  "30.png",
  "31.png",
  "32.png",
  "33.png",
  "34.png",
  "35.png",
  "36.png",
  "37.png",
  "38.png",
  "39.png",
];

// Accurate vertex-based constellation paths (Normalized 0-100 space)
const CONSTELLATION_DATA = [
  {
    name: "Ursa Major",
    path: "M10,40 L30,35 L45,45 L60,45 L75,30 L90,35 L75,60 L60,45", // The Big Dipper
    stars: [
      [10, 40],
      [30, 35],
      [45, 45],
      [60, 45],
      [75, 30],
      [90, 35],
      [75, 60],
    ],
  },
  {
    name: "Orion",
    path: "M20,10 L50,30 L80,10 M50,30 L45,50 L55,50 M45,50 L20,90 M55,50 L80,90", // Orion the Hunter
    stars: [
      [20, 10],
      [50, 30],
      [80, 10],
      [45, 50],
      [55, 50],
      [20, 90],
      [80, 90],
    ],
  },
  {
    name: "Cassiopeia",
    path: "M10,20 L30,50 L50,30 L70,60 L90,40", // The 'W' shape
    stars: [
      [10, 20],
      [30, 50],
      [50, 30],
      [70, 60],
      [90, 40],
    ],
  },
  {
    name: "Cygnus",
    path: "M50,10 L50,90 M10,40 L90,40", // The Northern Cross
    stars: [
      [50, 10],
      [50, 40],
      [50, 90],
      [10, 40],
      [90, 40],
    ],
  },
];

const HeroSection = () => {
  const containerRef = useRef(null);
  const canvasRef = useRef(null);
  const [windowSize, setWindowSize] = useState({ width: 1920, height: 1080 });
  const [content, setContent] = useState(DEFAULT_HERO);
  const navigate = useNavigate();

  useEffect(() => {
    axiosClient
      .get("/landing/hero")
      .then((res) => {
        if (res.data?.content)
          setContent({ ...DEFAULT_HERO, ...res.data.content });
      })
      .catch(() => {});
  }, []);
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);
  const springX = useSpring(mouseX, { stiffness: 80, damping: 25 });
  const springY = useSpring(mouseY, { stiffness: 80, damping: 25 });

  useEffect(() => {
    const handleResize = () => {
      setWindowSize({ width: window.innerWidth, height: window.innerHeight });
      if (canvasRef.current) {
        canvasRef.current.width = window.innerWidth;
        canvasRef.current.height = window.innerHeight;
      }
    };
    window.addEventListener("resize", handleResize);
    handleResize();
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start start", "end start"],
  });

  const handleMouseMove = (e) => {
    const x = e.clientX / window.innerWidth - 0.5;
    const y = e.clientY / window.innerHeight - 0.5;
    mouseX.set(x);
    mouseY.set(y);
  };

  const constellations = useMemo(() => {
    return Array.from({ length: 8 }).map((_, i) => {
      const data = CONSTELLATION_DATA[i % CONSTELLATION_DATA.length];
      return {
        ...data,
        x: Math.random() * 90,
        y: Math.random() * 80 + 10,
        scale: 0.8 + Math.random() * 1.2,
        rotate: Math.random() * 360,
        speed: 0.15 + Math.random() * 0.2,
        opacity: 0.1 + Math.random() * 0.3,
      };
    });
  }, []);

  const cards = useMemo(() => {
    return TAROT_ASSETS.map((src, i) => {
      const zIndex = Math.floor(Math.random() * 50);
      const isBlurred = Math.random() > 0.4;
      const side = i % 2 === 0 ? 1 : -1;
      const xPos =
        side === 1 ? Math.random() * 20 + 80 : Math.random() * 20 - 15;

      return {
        src: `/tarot/${src}`,
        initialX: xPos,
        initialY: Math.random() * 80 + 10,
        rotate: Math.random() * 40 - 20,
        scale: 0.6 + (zIndex / 50) * 0.4,
        scrollSpeed: 1.6 + zIndex / 6,
        mouseFactor: (zIndex + 15) * 1.2,
        blur: isBlurred ? Math.random() * 4 + 1 : 0,
        zIndex: zIndex,
      };
    });
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    let animationFrameId;
    let stars = Array.from({ length: 200 }, () => ({
      x: Math.random() * window.innerWidth,
      y: Math.random() * window.innerHeight,
      size: Math.random() * 1.5,
      opacity: Math.random(),
      pulse: 0.008 + Math.random() * 0.015,
    }));

    const render = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      stars.forEach((s) => {
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 255, 255, ${s.opacity})`;
        ctx.fill();
        s.opacity += s.pulse;
        if (s.opacity > 0.8 || s.opacity < 0.2) s.pulse *= -1;
      });
      animationFrameId = requestAnimationFrame(render);
    };
    render();
    return () => cancelAnimationFrame(animationFrameId);
  }, [windowSize]);

  return (
    <section
      ref={containerRef}
      onMouseMove={handleMouseMove}
      className="relative w-full"
      style={{ backgroundColor: COLORS.dark, height: "300vh" }}
    >
      <canvas
        ref={canvasRef}
        className="fixed inset-0 pointer-events-none opacity-50 z-0"
      />

      <div className="sticky top-0 h-screen w-full overflow-hidden flex flex-col items-center justify-center pt-24 px-6">
        {/* --- IMPROVED CONSTELLATIONS LAYER --- */}
        <div className="absolute inset-0 pointer-events-none z-[5]">
          {constellations.map((con, i) => (
            <motion.svg
              key={`con-${i}`}
              viewBox="0 0 100 100"
              style={{
                position: "absolute",
                left: `${con.x}%`,
                top: `${con.y}%`,
                width: "200px",
                height: "200px",
                rotate: con.rotate,
                scale: con.scale,
                x: useTransform(
                  scrollYProgress,
                  [0, 1],
                  [0, -windowSize.width * con.speed],
                ),
                y: useTransform(springY, [-0.5, 0.5], [-30, 30]),
                opacity: useTransform(
                  scrollYProgress,
                  [0, 0.4],
                  [con.opacity, 0],
                ),
              }}
            >
              {/* Constellation Lines */}
              <motion.path
                d={con.path}
                fill="none"
                stroke="rgba(255,255,255,0.4)"
                strokeWidth="0.5"
                strokeDasharray="2, 4"
                initial={{ pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{ duration: 4, delay: i * 0.3, ease: "easeInOut" }}
              />
              {/* Star Nodes (The believable dots) */}
              {con.stars.map(([cx, cy], idx) => (
                <motion.circle
                  key={idx}
                  cx={cx}
                  cy={cy}
                  r="1.2"
                  fill="white"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: [0, 1, 0.5] }}
                  transition={{
                    repeat: Infinity,
                    duration: 2 + Math.random() * 2,
                  }}
                  style={{ filter: "drop-shadow(0 0 2px white)" }}
                />
              ))}
            </motion.svg>
          ))}
        </div>

        {/* TAROT CARDS LAYER */}
        <div className="absolute inset-0 pointer-events-none z-10">
          {cards.map((card, i) => {
            const direction = card.initialX > 50 ? -1 : 1;
            const scrollX = useTransform(
              scrollYProgress,
              [0, 1],
              [0, direction * windowSize.width * card.scrollSpeed],
            );
            const mouseMoveX = useTransform(
              springX,
              [-0.5, 0.5],
              [-card.mouseFactor, card.mouseFactor],
            );
            const mouseMoveY = useTransform(
              springY,
              [-0.5, 0.5],
              [-card.mouseFactor, card.mouseFactor],
            );
            const tilt = useTransform(
              springX,
              [-0.5, 0.5],
              [card.rotate - 10, card.rotate + 10],
            );

            return (
              <motion.img
                key={i}
                src={card.src}
                style={{
                  left: `${card.initialX}%`,
                  top: `${card.initialY}%`,
                  x: useTransform([scrollX, mouseMoveX], ([s, m]) => s + m),
                  y: mouseMoveY,
                  rotate: tilt,
                  scale: card.scale,
                  filter: `blur(${card.blur}px)`,
                  zIndex: card.zIndex,
                  opacity: useTransform(scrollYProgress, [0.9, 1], [1, 0]),
                }}
                className="absolute w-40 md:w-52 shadow-[0_25px_50px_rgba(0,0,0,0.8)] rounded-xl border border-white/10"
              />
            );
          })}
        </div>

        <div
          className="absolute inset-0 z-20 pointer-events-none"
          style={{
            background: `radial-gradient(circle at center, ${COLORS.dark}f2 0%, ${COLORS.dark}44 60%, ${COLORS.dark} 100%)`,
          }}
        />

        {/* CENTER CONTENT */}
        <motion.div
          style={{
            x: useTransform(springX, [-0.5, 0.5], [-12, 12]),
            y: useTransform(springY, [-0.5, 0.5], [-12, 12]),
            opacity: useTransform(scrollYProgress, [0, 0.85], [1, 0]),
            scale: useTransform(scrollYProgress, [0, 0.8], [1, 0.95]),
          }}
          className="relative z-40 w-full max-w-[900px] flex flex-col items-center text-center"
        >
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-2 px-4 py-1.5 rounded-full border border-white/10 backdrop-blur-3xl mb-8 bg-white/5"
          >
            <span className="uppercase tracking-[0.4em] text-[9px]  text-white/80">
              {content.badge}
            </span>
          </motion.div>

          <div className="mb-2">
            <motion.span className="block text-xl md:text-3xl mb-2 font-light  text-white/50">
              {content.name}
            </motion.span>

            <h1
              className="leading-[1.0] tracking-tighter"
              style={{
                fontSize: "clamp(3rem, 7.5vw, 5.5rem)",
                fontFamily: TYPOGRAPHY.fontFamily.heading,
                fontWeight: 900,
                color: COLORS.neutralWhite,
              }}
            >
              {content.headline} <br />
              <span
                className="inline-block"
                style={{
                  background: `linear-gradient(135deg, ${COLORS.primary} 0%, ${COLORS.secondary} 100%)`,
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  backgroundClip: "text",
                }}
              >
                {content.headlineHighlighted}
              </span>
            </h1>
          </div>

          <p className="text-base md:text-xl max-w-xl mb-6 leading-relaxed font-light text-white/60">
            {content.subtitle}
          </p>

          <div className="flex flex-col sm:flex-row justify-center gap-6">
            {/* PRIMARY BUTTON: HIRE ME */}
            {/* <motion.button
    whileHover={{ 
      scale: 1.05, 
      y: -2,
    }}
    whileTap={{ scale: 0.95 }}
    transition={{ type: "spring", stiffness: 400, damping: 17 }}
    className="px-12 py-5 rounded-full font-bold text-[11px] tracking-[0.2em] uppercase transition-all shadow-xl"
    style={{ backgroundColor: COLORS.primary, color: COLORS.dark }}
  >
    {content.primaryCta}
  </motion.button> */}

            {/* SECONDARY BUTTON: THE ARCHIVE */}
            <motion.button
              onClick={() => navigate("/psychics-browse")}
              initial="initial"
              whileHover="hover"
              whileTap={{ scale: 0.95 }}
              transition={{ type: "spring", stiffness: 400, damping: 17 }}
              className="group px-10 py-5 rounded-full border border-white/10 text-[10px] font-bold tracking-[0.3em] text-white backdrop-blur-md transition-all flex items-center justify-center gap-3"
              style={
                {
                  // Inline styles for the hover state logic if not using a CSS file
                }
              }
              variants={{
                hover: {
                  scale: 1.05,
                  y: -2,
                  backgroundColor: "rgba(255, 255, 255, 0.1)",
                  borderColor: "rgba(255, 255, 255, 0.4)",
                },
              }}
            >
              {content.secondaryCta}
              <motion.div
                variants={{
                  initial: { x: 0 },
                  hover: { x: 5 },
                }}
              >
                <Icon icon="ph:arrow-right-bold" className="text-xs" />
              </motion.div>
            </motion.button>
          </div>
        </motion.div>
      </div>
    </section>
  );
};

export default HeroSection;
