import { motion } from "framer-motion";
import { Icon } from "@iconify/react";
import { useRef, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { COLORS, TYPOGRAPHY } from "../theme";
import axiosClient from "../lib/axiosClient";

const DEFAULT_FOOTER = {
  brandName: "Ask Valentina",
  description: "A sanctuary for private, honest love and tarot readings. Talk to an intuitive reader and find clarity on the connection you can't stop thinking about.",
  socialLinks: [
    { platform: "instagram", url: "https://www.instagram.com/askvalentina.co.uk/", icon: "ph:instagram-logo-fill" },
    { platform: "tiktok", url: "https://www.tiktok.com/@valentina_clarity", icon: "ph:tiktok-logo-fill" },
  ],
  copyright: "\u00a9 2026 Ask Valentina",
  navLinks: [
    { name: "Home", path: "/" },
    { name: "Readers", path: "/psychics-browse" },
    { name: "Life Path & Zodiac", path: "/oracle" },
    { name: "About Us", path: "/about" },
  ],
};

const Footer = () => {
  const navigate = useNavigate();
  const footerRef = useRef(null);
  const [content, setContent] = useState(DEFAULT_FOOTER);
  const [alchemicalTime, setAlchemicalTime] = useState("");

  useEffect(() => {
    axiosClient.get("/landing/footer").then((res) => {
      if (res.data?.content) setContent({ ...DEFAULT_FOOTER, ...res.data.content });
    }).catch(() => {});
  }, []);

  useEffect(() => {
    const updateTime = () => {
      const hours = new Date().getHours();
      const roman = ["XII", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI"][hours % 12];
      setAlchemicalTime(roman);
    };

    updateTime();
    const timer = setInterval(updateTime, 60000);
    return () => clearInterval(timer);
  }, []);

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
      style={{ backgroundColor: "transparent" }}
    >
      {/* Legibility veil — fades in from transparent at the top so the page's
          fixed backdrop continues seamlessly into the footer (no dark seam),
          darkening only toward the bottom to keep the fine print readable. */}
      <div
        className="absolute inset-0 z-0 pointer-events-none"
        style={{
          background: `linear-gradient(180deg, transparent 0%, ${COLORS.dark}59 55%, ${COLORS.dark}8c 100%)`,
        }}
      />

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
            {content.socialLinks.filter((social) => social.url && social.url !== "#").map((social, i) => (
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