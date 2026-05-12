import { motion } from "framer-motion";
import { COLORS, TYPOGRAPHY } from "../../../theme";
import type { AboutContent } from "../../landing-editor/types/landingEditor.types";

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
      className="relative text-center py-24 px-4 flex flex-col items-center"
    >
      {/* Background Stylized "O" - Architectural element */}
      <div 
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-[20rem] md:text-[30rem] font-black text-white/[0.02] pointer-events-none select-none z-0"
        style={{ fontFamily: TYPOGRAPHY.fontFamily.heading }}
      >
        A
      </div>

      <motion.div variants={itemVariants} className="relative z-10 space-y-2">
        <span className="text-[10px] font-black uppercase tracking-[0.8em] text-primary/60">
          {content.badge}
        </span>
        <h1 
          style={{ 
            fontFamily: TYPOGRAPHY.fontFamily.heading,
            lineHeight: 0.85
          }} 
          className="text-7xl md:text-[10rem] font-black uppercase tracking-tighter text-white"
        >
          {content.title} <span className="italic font-light" style={{ color: COLORS.primary }}>{content.titleHighlighted}</span>
        </h1>
      </motion.div>

      <motion.div 
        variants={itemVariants}
        className="mt-12 flex flex-col items-center gap-6"
      >
        <div className="h-16 w-[1px] bg-gradient-to-b from-primary/60 to-transparent" />
        
        <div className="space-y-2">
          <p className="text-white/30 uppercase tracking-[0.5em] text-[10px] font-bold">
            {content.established}
          </p>
          <p className="text-white/10 uppercase tracking-[0.3em] text-[9px]">
            {content.tagline}
          </p>
        </div>
      </motion.div>

      {/* Side Decorative Tags - Minimalist Editorial Touch */}
      <div className="absolute left-0 top-1/2 -rotate-90 origin-left hidden lg:block">
        <span className="text-[8px] font-black uppercase tracking-[0.5em] text-white/10">
          {content.leftTag}
        </span>
      </div>
      <div className="absolute right-0 top-1/2 rotate-90 origin-right hidden lg:block">
        <span className="text-[8px] font-black uppercase tracking-[0.5em] text-white/10">
          {content.rightTag}
        </span>
      </div>
    </motion.header>
  );
};

export default AboutHero;
