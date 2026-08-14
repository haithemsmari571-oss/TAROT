import { motion } from "framer-motion";
import { Icon } from "@iconify/react";
import { useRef, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import axiosClient from "../lib/axiosClient";
import "../styles/glass.css";

const DEFAULT_FOOTER = {
  brandName: "Ask Valentina",
  description: "A sanctuary for private, honest love and tarot readings. Talk to an intuitive reader and find clarity on the connection you can't stop thinking about.",
  socialLinks: [
    { platform: "instagram", url: "https://www.instagram.com/askvalentina.co.uk/", icon: "ph:instagram-logo-fill" },
    { platform: "tiktok", url: "https://www.tiktok.com/@valentina_clarity", icon: "ph:tiktok-logo-fill" },
  ],
  copyright: "© 2026 Ask Valentina",
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
      className="gl-footer relative pt-24 pb-14 px-6 overflow-hidden"
    >
      <div className="max-w-7xl mx-auto relative z-30">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-16 mb-20">

          {/* BRAND INFO */}
          <div className="lg:col-span-5 space-y-7">
            <div className="flex items-center gap-3">
              <Icon icon="ph:star-four-fill" className="gl-acc text-xl" />
              <h1 className="gl-wm" style={{ fontSize: 22 }}>
                {content.brandName}
              </h1>
            </div>
            <p className="gl-td text-sm leading-relaxed max-w-sm">
              {content.description}
            </p>
            <div
              className="flex items-baseline gap-4 pl-6"
              style={{ borderLeft: "1px solid var(--gl-hair)" }}
            >
              <span
                className="gl-t text-3xl"
                style={{ fontFamily: "var(--gl-serif)", fontWeight: 300, fontStyle: "italic" }}
              >
                {alchemicalTime}
              </span>
              <span className="gl-tf text-[9px] font-semibold uppercase tracking-[0.3em]">
                Cycle Phase {new Date().getDate() % 4 + 1}
              </span>
            </div>
          </div>

          {/* QUICK NAVIGATION */}
          <div className="lg:col-span-3 space-y-7">
            <h4 className="gl-acc text-[10px] font-semibold uppercase tracking-[0.4em]">Explore</h4>
            <ul className="space-y-4">
              {content.navLinks.map((link) => (
                <li key={link.name}>
                  <button
                    onClick={() => navigate(link.path)}
                    className="gl-navlink"
                  >
                    {link.name}
                  </button>
                </li>
              ))}
            </ul>
          </div>

          {/* SPACER - newsletter removed */}
        </div>

        {/* WELCOME-CREDIT TERMS — site-wide fine print */}
        <div className="gl-acc flex items-center justify-center gap-1.5 mb-6" style={{ opacity: 0.8 }}>
          <Icon icon="ph:gift-fill" className="text-[11px]" />
          <span className="text-[10px] uppercase tracking-[0.2em] font-semibold">
            £15 welcome credit — new members only, one per person.
          </span>
        </div>

        {/* GUIDANCE LINE — must stay on every version of this footer */}
        <div className="gl-foot-line mb-10">
          Readings are for guidance and entertainment · <b>Ask Valentina</b> · Private &amp; judgment-free
        </div>

        {/* BOTTOM BAR */}
        <div
          className="flex flex-col md:flex-row justify-between items-center pt-10 gap-8"
          style={{ borderTop: "1px solid var(--gl-hair-soft)" }}
        >
          <div className="flex gap-6 items-center flex-wrap justify-center">
            <p className="gl-tf text-[9px] uppercase tracking-widest font-semibold">{content.copyright}</p>
            {legalLinks.map((link) => (
              <button
                key={link.name}
                onClick={() => navigate(link.path)}
                className="gl-tf text-[9px] uppercase tracking-widest cursor-pointer transition-colors hover:opacity-70"
              >
                {link.name}
              </button>
            ))}
          </div>

          {/* BACK TO TOP */}
          <motion.button
            onClick={scrollToTop}
            whileHover={{ y: -5 }}
            className="flex flex-col items-center gap-2 group"
            title="Back to top"
          >
            <div className="gl-theme-toggle grid place-items-center">
              <Icon icon="ph:caret-up-bold" className="gl-acc text-xs" />
            </div>
          </motion.button>

          <div className="flex gap-6">
            {content.socialLinks.filter((social) => social.url && social.url !== "#").map((social, i) => (
              <motion.a
                key={i}
                href={social.url}
                target="_blank"
                rel="noopener noreferrer"
                whileHover={{ scale: 1.2 }}
                className="gl-tf text-lg cursor-pointer transition-colors hover:opacity-70"
              >
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
