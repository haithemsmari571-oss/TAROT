import { motion, useScroll, useTransform, useSpring, useMotionValue } from "framer-motion";
import { Icon } from "@iconify/react";
import { useRef, useEffect, useState } from "react";
import { COLORS, TYPOGRAPHY } from "../../../theme";
import axiosClient from "../../../lib/axiosClient";

const DEFAULT_SERVICES = {
  badge: "The Sacred Offerings",
  heading: "What you'll",
  headingHighlighted: "Receive",
  cards: [
    { icon: "ph:star-four-fill", title: "Personal\nReading", desc: "Direct answers to your specific soul questions. Focused clarity for immediate crossroads.", energy: "High Focus" },
    { icon: "ph:eye-closed-fill", title: "Deep\nInsight", desc: "An intuitive dive into your current energy cycle. Uncover subconscious patterns.", energy: "Deep Flow" },
    { icon: "ph:lightning-fill", title: "Fast\nReply", desc: "Urgent clarity delivered within 24\u201348 hours. High-priority divine intervention.", energy: "Rapid" },
    { icon: "mdi:crystal-ball", title: "Divine\nPath", desc: "Long-term guidance for your spiritual journey. A map for your soul's evolution.", energy: "Eternal" },
  ],
  cta: "Claim Your Destiny",
  stats: [
    { label: "Turnaround", value: "24-48 Hours" },
    { label: "Channel", value: "Digital Link" },
    { label: "Format", value: "Video/PDF" },
  ],
};

const ServiceSection = () => {
  const containerRef = useRef(null);
  const getInitialServicesContent = () => {
    const cached = localStorage.getItem("landing_services_content");
    if (cached) {
      try {
        return JSON.parse(cached);
      } catch (e) {}
    }
    return DEFAULT_SERVICES;
  };

  const [content, setContent] = useState(getInitialServicesContent);
  const [isLoaded, setIsLoaded] = useState(() => {
    return !!localStorage.getItem("landing_services_content");
  });

  useEffect(() => {
    axiosClient.get("/landing/services").then((res) => {
      if (res.data?.content) {
        const newContent = { ...DEFAULT_SERVICES, ...res.data.content };
        setContent(newContent);
        localStorage.setItem("landing_services_content", JSON.stringify(newContent));
      }
      setIsLoaded(true);
    }).catch(() => {
      setIsLoaded(true);
    });
  }, []);
  
  // Mouse Tracking for Background Interactivity
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);

  useEffect(() => {
    const handleMouseMove = (e) => {
      const { clientX, clientY } = e;
      mouseX.set(clientX);
      mouseY.set(clientY);
    };
    window.addEventListener("mousemove", handleMouseMove);
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, [mouseX, mouseY]);

  // Smoothen mouse movement
  const springX = useSpring(mouseX, { stiffness: 50, damping: 20 });
  const springY = useSpring(mouseY, { stiffness: 50, damping: 20 });

  // Move orbs based on mouse
  const orbX = useTransform(springX, [0, 2000], [-30, 30]);
  const orbY = useTransform(springY, [0, 2000], [-30, 30]);

  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start end", "end start"],
  });

  const smoothScroll = useSpring(scrollYProgress, { stiffness: 80, damping: 20 });
  const bgYParallax = useTransform(smoothScroll, [0, 1], ["-10%", "10%"]);

  return (
    <section
      ref={containerRef}
      className="relative py-44 px-6 overflow-hidden "
      style={{ backgroundColor: COLORS.dark }}
    >
      {/* 1. INTERACTIVE STELLAR BACKGROUND */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        {/* Constellation Grid */}

        {/* Responsive Magnetic Orbs */}
        <motion.div 
          className="absolute top-20 -left-20 w-[1000px] h-[1000px] rounded-full blur-[160px] opacity-25"
          style={{ x: orbX, y: orbY, background: `radial-gradient(circle, ${COLORS.primaryDark} 0%, transparent 60%)` }}
        />
        <motion.div 
          className="absolute bottom-20 -right-20 w-[800px] h-[800px] rounded-full blur-[140px] opacity-20"
          style={{ x: useTransform(orbX, (v) => -v), y: useTransform(orbY, (v) => -v), background: `radial-gradient(circle, ${COLORS.secondary} 0%, transparent 60%)` }}
        />

        {/* Floating "Star" Particles */}
        {[...Array(15)].map((_, i) => (
          <motion.div
            key={i}
            animate={{ 
              y: [0, -100, 0], 
              opacity: [0.1, 0.4, 0.1],
              scale: [1, 1.2, 1] 
            }}
            transition={{ duration: 10 + i * 2, repeat: Infinity, ease: "linear" }}
            className="absolute w-1 h-1 bg-white rounded-full"
            style={{ 
              top: `${Math.random() * 100}%`, 
              left: `${Math.random() * 100}%`,
              filter: `blur(1px)`
            }}
          />
        ))}
      </div>

      {isLoaded && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5 }}
          className="max-w-7xl mx-auto relative z-10"
        >
        
        {/* 2. HEADER */}
        <div className="flex flex-col items-center text-center mb-6">
          <motion.div 
            initial={{ opacity: 0, scale: 0.8 }}
            whileInView={{ opacity: 1, scale: 1 }}
            className="flex items-center gap-3 px-6 py-2 rounded-full border border-white/10 bg-white/[0.03] backdrop-blur-xl mb-10 shadow-2xl"
          >
        
            <span className="text-[10px] font-black tracking-[0.5em] uppercase text-white/50">{content.badge}</span>
          </motion.div>
          
          <h2 
            style={{ ...TYPOGRAPHY.headings.h2, fontSize: "clamp(2.8rem, 8vw, 5rem)", color: COLORS.neutralWhite }}
            className="mb-8 tracking-tighter"
          >
            {content.heading} <span style={{ color: COLORS.primary, filter: `drop-shadow(0 0 15px ${COLORS.primary}40)` }}>{content.headingHighlighted}</span>
          </h2>
          
       
        </div>

        {/* 3. INTERACTIVE TAROT SPREAD */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8 md:gap-10">
          {content.cards.map((card, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 100 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1, duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
              style={{ rotate: i === 0 ? -4 : i === 1 ? -1.5 : i === 2 ? 1.5 : 4 }}
              whileHover={{ 
                y: -40, 
                rotate: 0, 
                scale: 1.05,
                transition: { type: "spring", stiffness: 400, damping: 20 } 
              }}
              className="group relative aspect-[10/16] w-full cursor-pointer"
            >
              {/* The Card Body */}
              <div 
                className="absolute inset-0 rounded-[2.8rem] border border-white/10 overflow-hidden shadow-[0_30px_60px_rgba(0,0,0,0.6)] transition-all duration-700 group-hover:border-primary/60 group-hover:shadow-[0_0_40px_rgba(210,185,255,0.15)]"
                style={{ backgroundColor: COLORS.surface }}
              >
                {/* Dynamic Border Aura */}
                <div className="absolute inset-[2px] rounded-[2.7rem] opacity-0 group-hover:opacity-100 transition-opacity duration-700 border border-primary/20 pointer-events-none" />
                <div className="absolute inset-4 border border-white/5 rounded-[2rem] pointer-events-none transition-colors group-hover:border-secondary/30" />

                {/* Content */}
                <div className="h-full w-full p-10 flex flex-col items-center justify-between text-center relative z-10">
                  
                  {/* Top: Metadata */}
                  <div className="flex flex-col items-center gap-1">
                    <span className="text-[10px] font-black tracking-widest text-white/20 group-hover:text-primary transition-colors uppercase">Arcana</span>
                    <span className="text-xl font-black italic" style={{ color: COLORS.secondary }}>0{i + 1}</span>
                  </div>

                  {/* Center: The Soul Symbol */}
                  <div className="relative">
                    {/* Pulsing Aura */}
                    <div className="absolute inset-0 bg-primary/20 blur-[40px] rounded-full scale-0 group-hover:scale-150 transition-transform duration-1000 opacity-0 group-hover:opacity-40" />
                    <div 
                      className="w-24 h-24 rounded-3xl flex items-center justify-center relative border border-white/10 bg-black/50 backdrop-blur-md group-hover:border-primary/50 group-hover:rotate-[360deg] transition-all duration-[1.5s] ease-in-out"
                    >
                      <Icon icon={card.icon} className="text-5xl text-white group-hover:text-primary transition-colors" />
                    </div>
                  </div>

                  {/* Bottom: Text */}
                  <div className="w-full">
                    <h3 
                      className="text-white font-black leading-none mb-4 uppercase tracking-tighter"
                      style={{ fontFamily: TYPOGRAPHY.fontFamily.heading, fontSize: "1.6rem" }}
                    >
                      {card.title}
                    </h3>
                    <p className="text-[11px] text-white/30 leading-relaxed font-light px-2 mb-6 group-hover:text-white/70 transition-colors">
                      {card.desc}
                    </p>
                    <div className="inline-block px-4 py-1.5 rounded-full border border-white/5 group-hover:border-secondary/40 transition-colors">
                        <span className="text-[9px] font-black tracking-[0.4em] uppercase text-white/20 group-hover:text-secondary transition-colors">
                        {card.energy}
                        </span>
                    </div>
                  </div>
                </div>

                {/* Shimmer Light Sweep */}
                <motion.div 
                  initial={{ x: '-150%' }}
                  whileHover={{ x: '150%' }}
                  transition={{ duration: 1.5, ease: "easeInOut" }}
                  className="absolute inset-0 bg-gradient-to-r from-transparent via-white/[0.08] to-transparent skew-x-[25deg] pointer-events-none"
                />
              </div>

              {/* Floor Shadow Tinted to Theme */}
              <div className="absolute -bottom-14 left-1/2 -translate-x-1/2 w-[85%] h-8 bg-primary/5 blur-[50px] rounded-full opacity-0 group-hover:opacity-100 transition-all duration-700" />
            </motion.div>
          ))}
        </div>

        {/* 4. FOOTER CTA */}
     <motion.div 
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          className="mt-20 flex flex-col items-center"
        >
          <div className="relative group cursor-pointer mb-12">
             <div className="absolute inset-0 bg-primary/20 blur-[60px] rounded-full group-hover:bg-primary/40 transition-all" />
             <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className="relative px-20 py-7 rounded-2xl font-bold text-[13px] tracking-[0.6em] uppercase transition-all shadow-2xl flex items-center gap-6"
                style={{ backgroundColor: COLORS.secondary, color: COLORS.dark }}
              >
                 {content.cta}
              </motion.button>
          </div>
          
          <div className="flex gap-16 text-center">
            {content.stats.map((stat, idx) => (
              <div key={idx} className="flex flex-col gap-1">
                <span className="text-[9px] font-black tracking-widest text-white/20 uppercase">{stat.label}</span>
                <span className="text-xs font-light" style={{ color: COLORS.secondary }}>{stat.value}</span>
              </div>
            ))}
          </div>
        </motion.div>
        </motion.div>
      )}
    </section>
  );
};

export default ServiceSection;