import { motion, useTransform, useSpring, useMotionValue } from "framer-motion";
import { Icon } from "@iconify/react";
import { useRef, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { COLORS, TYPOGRAPHY } from "../theme";
import CoverImg from "../assets/Cover.png";
import axiosClient from "../lib/axiosClient";

const DEFAULT_FOOTER = {
  brandName: "The Alchemical Exchange",
  description: "A sanctuary for those ready to transcend. Bridging the gap between mundane reality and celestial clarity through raw, unfiltered, intuitive revelation.",
  socialLinks: [
    { platform: "instagram", url: "#", icon: "ph:instagram-logo-fill" },
    { platform: "youtube", url: "#", icon: "ph:youtube-logo-fill" },
    { platform: "tiktok", url: "#", icon: "ph:tiktok-logo-fill" },
  ],
  copyright: "\u00a9 2026 The Alchemical Exchange",
  navLinks: [
    { name: "Sanctuary", path: "/home" },
    { name: "Psychics", path: "/psychics" },
    { name: "Life Path & Zodiac", path: "/oracle" },
    { name: "About Us", path: "/about" },
  ],
};

const Footer = () => {
  const navigate = useNavigate();
  const footerRef = useRef(null);
  const [content, setContent] = useState(DEFAULT_FOOTER);
  
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);
  const [alchemicalTime, setAlchemicalTime] = useState("");

  useEffect(() => {
    axiosClient.get("/landing/footer").then((res) => {
      if (res.data?.content) setContent({ ...DEFAULT_FOOTER, ...res.data.content });
    }).catch(() => {});
  }, []);

  useEffect(() => {
    const handleMouseMove = (e) => {
      mouseX.set(e.clientX);
      mouseY.set(e.clientY);
    };
    
    const updateTime = () => {
      const hours = new Date().getHours();
      const roman = ["XII", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI"][hours % 12];
      setAlchemicalTime(roman);
    };

    window.addEventListener("mousemove", handleMouseMove);
    updateTime();
    const timer = setInterval(updateTime, 60000);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      clearInterval(timer);
    };
  }, [mouseX, mouseY]);

  const springX = useSpring(mouseX, { stiffness: 40, damping: 20 });
  const springY = useSpring(mouseY, { stiffness: 40, damping: 20 });
  const bgX = useTransform(springX, [0, 2000], [20, -20]);
  const bgY = useTransform(springY, [0, 2000], [20, -20]);

  const scrollToTop = () => window.scrollTo({ top: 0, behavior: "smooth" });

  const legalLinks = [
    { name: "About Us", path: "/about" },
    { name: "Privacy", path: "/privacy" },
    { name: "Terms", path: "/terms" },
  ];

  return (
    <footer 
      ref={footerRef}
      className="relative pt-32 pb-16 px-6 overflow-hidden border-t border-white/5" 
      style={{ backgroundColor: COLORS.dark }}
    >
      {/* BACKGROUND EFFECTS */}
      <div className="absolute inset-0 z-0 pointer-events-none">
        <div className="absolute inset-0 bg-dark z-10 opacity-60" />
        <motion.div style={{ x: bgX, y: bgY, scale: 1.1 }} className="absolute inset-0 opacity-20 contrast-[1.4] grayscale-[0.5]">
          <img src={CoverImg} alt="Soul Nebula" className="w-full h-full object-cover" />
        </motion.div>
        <div className="absolute inset-0 z-20" style={{ background: `radial-gradient(circle at center, transparent 0%, ${COLORS.dark} 90%)` }} />
      </div>

      <div className="max-w-7xl mx-auto relative z-30">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-16 mb-24">
          
          {/* BRAND INFO */}
          <div className="lg:col-span-5 space-y-8">
            <div className="flex items-center gap-4">
              <Icon icon="ph:star-four-fill" style={{ color: COLORS.primary }} className="text-2xl" />
              <h1 style={{ fontFamily: TYPOGRAPHY.fontFamily.heading }} className="text-xl font-black uppercase italic tracking-tighter text-white">
                {content.brandName.split(" ").slice(0, -1).join(" ")} <span style={{ color: COLORS.primary }}>{content.brandName.split(" ").pop()}</span>
              </h1>
            </div>
            <p className="text-sm leading-relaxed max-w-sm text-white/40">
              {content.description}
            </p>
            <div className="flex items-baseline gap-4 border-l border-primary/20 pl-6">
                <span className="text-3xl font-black text-white italic tracking-tighter" style={{ fontFamily: TYPOGRAPHY.fontFamily.heading }}>{alchemicalTime}</span>
                <span className="text-[9px] font-black text-white/20 uppercase tracking-[0.3em]">Cycle Phase {new Date().getDate() % 4 + 1}</span>
            </div>
          </div>

          {/* QUICK NAVIGATION */}
          <div className="lg:col-span-3 space-y-8">
            <h4 className="text-[10px] font-black uppercase tracking-[0.4em] text-white">Explore</h4>
            <ul className="space-y-4">
              {content.navLinks.map((link) => (
                <li key={link.name}>
                  <button 
                    onClick={() => navigate(link.path)}
                    className="text-xs text-white/40 hover:text-primary transition-colors uppercase font-bold tracking-widest"
                  >
                    {link.name}
                  </button>
                </li>
              ))}
            </ul>
          </div>

          {/* SPACER - newsletter removed */}
        </div>

        {/* BOTTOM BAR */}
        <div className="flex flex-col md:flex-row justify-between items-center pt-12 border-t border-white/5 gap-8">
          <div className="flex gap-6 items-center">
            <p className="text-[9px] uppercase tracking-widest text-white/20 font-bold">{content.copyright}</p>
            {legalLinks.map((link) => (
              <button key={link.name} onClick={() => navigate(link.path)} className="text-[9px] uppercase tracking-widest text-white/20 hover:text-primary transition-colors cursor-pointer">{link.name}</button>
            ))}
          </div>
          
          {/* BACK TO TOP */}
          <motion.button 
            onClick={scrollToTop}
            whileHover={{ y: -5 }}
            className="flex flex-col items-center gap-2 group"
          >
            <div className="w-10 h-10 rounded-full border border-white/10 flex items-center justify-center bg-white/[0.02] group-hover:border-primary transition-all">
              <Icon icon="ph:caret-up-bold" style={{ color: COLORS.primary }} className="text-xs" />
            </div>
          </motion.button>

          <div className="flex gap-6">
            {content.socialLinks.map((social, i) => (
              <motion.a key={i} href={social.url} target="_blank" rel="noopener noreferrer" whileHover={{ scale: 1.2, color: COLORS.primary }} className="text-lg text-white/20 cursor-pointer hover:text-primary transition-colors">
                <Icon icon={social.icon || `ph:${social.platform}-logo-fill`} />
              </motion.a>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;