import { useState, useEffect } from "react";
import AboutHero from "../components/AboutHero";
import PageBackground from "../../../components/PageBackground";
import { motion } from "framer-motion";
import axiosClient from "../../../lib/axiosClient";
import type { AboutContent } from "../../landing-editor/types/landingEditor.types";
import zodiacHall from "../../../assets/backgrounds/zodiac-hall-3.webp";
import "../../../styles/glass.css";

const DEFAULT_ABOUT: AboutContent = {
  badge: "The Foundation",
  title: "OUR",
  titleHighlighted: "ETHOS",
  established: "Established 2026",
  tagline: "Guided by the quiet resonance of the stars",
  leftTag: "Celestial Navigation System v1.0",
  rightTag: "Deciphering the Void",
  bodyTitle: "Our Mission",
  bodyContent: "",
  missionTitle: "The Vision",
  missionContent: "",
};

const AboutPage = () => {
  const [content, setContent] = useState(DEFAULT_ABOUT);

  useEffect(() => {
    axiosClient
      .get("/landing/about")
      .then((res) => {
        if (res.data?.content)
          setContent({ ...DEFAULT_ABOUT, ...res.data.content });
      })
      .catch(() => {});
  }, []);

  return (
    <div className="relative min-h-screen">
      {/* The zodiac-hall scene stays vivid in both moods; the token tint carries mood. */}
      <PageBackground images={zodiacHall} variant="glass" />
      <div className="relative z-10">
        <AboutHero content={content} />
        <div className="max-w-4xl mx-auto px-6 pb-32 space-y-10">
          {content.bodyContent && (
            <motion.div
              initial={{ opacity: 0, y: 40 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="gl-panel px-7 py-9 md:px-12 md:py-12 space-y-6"
            >
              <h2 className="gl-h2">{content.bodyTitle}</h2>
              <p
                className="text-base leading-relaxed max-w-2xl"
                style={{
                  color: "var(--gl-text-dim)",
                  fontFamily: "var(--gl-sans)",
                }}
              >
                {content.bodyContent}
              </p>
            </motion.div>
          )}
          {content.missionContent && (
            <motion.div
              initial={{ opacity: 0, y: 40 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="gl-panel gl-panel--2 px-7 py-9 md:px-12 md:py-12 space-y-6"
            >
              <h2 className="gl-h2">{content.missionTitle}</h2>
              <p
                className="text-base leading-relaxed max-w-2xl"
                style={{
                  color: "var(--gl-text-dim)",
                  fontFamily: "var(--gl-sans)",
                }}
              >
                {content.missionContent}
              </p>
            </motion.div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AboutPage;
