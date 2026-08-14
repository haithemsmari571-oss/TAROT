import { motion } from "framer-motion";
import type { AboutContent } from "../../landing-editor/types/landingEditor.types";
import "../../../styles/glass.css";

interface AboutHeroProps {
  content: AboutContent;
}

const AboutHero = ({ content }: AboutHeroProps) => {
  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.2,
        delayChildren: 0.3,
      },
    },
  };

  const itemVariants = {
    hidden: { y: 40, opacity: 0 },
    visible: {
      y: 0,
      opacity: 1,
      transition: { duration: 1, ease: [0.16, 1, 0.3, 1] }
    },
  };

  return (
    <motion.header
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="relative text-center pt-16 pb-8 px-6 flex flex-col items-center"
    >
      {/* Frosted hero panel carries readability over the artwork in both moods. */}
      <div className="gl-hero-panel--solid relative z-10 w-full max-w-3xl px-6 py-12 md:px-14 md:py-14">
        <motion.div variants={itemVariants}>
          <p className="gl-kicker">{content.badge}</p>
          <h1 className="gl-h1">
            {content.title} <i>{content.titleHighlighted}</i>
          </h1>
        </motion.div>

        <motion.div
          variants={itemVariants}
          className="mt-8 flex flex-col items-center gap-6"
        >
          <div className="gl-divider w-24" />

          <div className="space-y-2">
            <p
              className="uppercase"
              style={{
                fontFamily: "var(--gl-sans)",
                fontSize: 10.5,
                fontWeight: 600,
                letterSpacing: "2.6px",
                color: "var(--gl-text-faint)",
              }}
            >
              {content.established}
            </p>
            <p className="gl-italic-note" style={{ fontSize: 15 }}>
              {content.tagline}
            </p>
          </div>
        </motion.div>
      </div>

      {/* Side Decorative Tags - Minimalist Editorial Touch */}
      <div className="absolute left-2 top-1/2 -rotate-90 origin-left hidden lg:block">
        <span
          className="uppercase"
          style={{
            fontFamily: "var(--gl-sans)",
            fontSize: 9.5,
            fontWeight: 600,
            letterSpacing: "3.2px",
            color: "var(--gl-text-faint)",
            opacity: 0.7,
          }}
        >
          {content.leftTag}
        </span>
      </div>
      <div className="absolute right-2 top-1/2 rotate-90 origin-right hidden lg:block">
        <span
          className="uppercase"
          style={{
            fontFamily: "var(--gl-sans)",
            fontSize: 9.5,
            fontWeight: 600,
            letterSpacing: "3.2px",
            color: "var(--gl-text-faint)",
            opacity: 0.7,
          }}
        >
          {content.rightTag}
        </span>
      </div>
    </motion.header>
  );
};

export default AboutHero;
