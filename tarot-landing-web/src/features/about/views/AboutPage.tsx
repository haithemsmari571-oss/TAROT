import { useState, useEffect } from "react";
import { COLORS, TYPOGRAPHY } from "../../../theme";
import AboutHero from "../components/AboutHero";
import CelestialBackground from "../components/CelestialBackground";
import { motion } from "framer-motion";
import axiosClient from "../../../lib/axiosClient";
import type { AboutContent } from "../../landing-editor/types/landingEditor.types";

const DEFAULT_ABOUT: AboutContent = {
  badge: "The Foundation",
  title: "OUR",
  titleHighlighted: "ETHOS",
  established: "Established 2026",
  tagline: "Guided by the absolute resonance of the stars",
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
    <div
      className="relative min-h-screen"
      style={{ backgroundColor: COLORS.dark }}
    >
      <CelestialBackground scrollY={0} />
      <div className="relative z-10">
        <AboutHero content={content} />
        <div className="max-w-4xl mx-auto px-6 pb-32 space-y-20">
          {content.bodyContent && (
            <motion.div
              initial={{ opacity: 0, y: 40 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="space-y-8"
            >
              <h2
                className="text-4xl md:text-5xl font-black uppercase tracking-tighter"
                style={{
                  ...TYPOGRAPHY.headings.h2,
                  color: COLORS.neutralWhite,
                }}
              >
                {content.bodyTitle}
              </h2>
              <p
                className="text-base md:text-lg leading-relaxed max-w-2xl"
                style={{ color: COLORS.neutralGray }}
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
              className="space-y-8"
            >
              <h2
                className="text-4xl md:text-5xl font-black uppercase tracking-tighter"
                style={{
                  ...TYPOGRAPHY.headings.h2,
                  color: COLORS.neutralWhite,
                }}
              >
                {content.missionTitle}
              </h2>
              <p
                className="text-base md:text-lg leading-relaxed max-w-2xl"
                style={{ color: COLORS.neutralGray }}
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
