import { motion, useScroll, useTransform, useSpring } from "framer-motion";
import { Icon } from "@iconify/react";
import { useRef, useState, useEffect } from "react";
import { COLORS, TYPOGRAPHY } from "../../../theme";
import axiosClient from "../../../lib/axiosClient";

const DEFAULT_TESTIMONIALS = [
  { name: "Aria Vance", role: "Soul Seeker", content: "The Two-Fold Truth reading felt like she was reading the very blueprint of my heart." },
  { name: "Julian Thorne", role: "Returning Client", content: "Deep Soul Access is an understatement. The 10 questions covered every corner of my life." },
  { name: "Elena Rossi", role: "Artist", content: "A Whisper Message was all I needed. Short, piercingly accurate, and delivered with grace." },
  { name: "Marcus K.", role: "Mentor", content: "Rarely do I find an intuitive with this level of raw, unfiltered accuracy. No fluff." },
  { name: "Sasha L.", role: "Seeker", content: "The channeled card spread is now my daily meditation. It speaks to me daily." },
];

const POSITIONS = [
  { x: "15%", y: "20%", depth: 1.2 },
  { x: "65%", y: "15%", depth: 0.8 },
  { x: "40%", y: "50%", depth: 1.5 },
  { x: "10%", y: "70%", depth: 0.9 },
  { x: "70%", y: "75%", depth: 1.1 },
];

const TestimonialCarousel = () => {
  const containerRef = useRef(null);
  const [testimonials, setTestimonials] = useState(DEFAULT_TESTIMONIALS);

  useEffect(() => {
    axiosClient.get("/landing/testimonials").then((res) => {
      if (res.data?.content?.testimonials) setTestimonials(res.data.content.testimonials);
    }).catch(() => {});
  }, []);
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start end", "end start"],
  });

  // Smooth spring for parallax movement
  const smoothProgress = useSpring(scrollYProgress, { stiffness: 100, damping: 30 });

  return (
    <section 
      ref={containerRef}
      className="relative min-h-[120vh] py-32 overflow-hidden flex flex-col items-center justify-start" 
      style={{ backgroundColor: COLORS.dark }}
    >
      {/* 1. SECTION HEADER */}
 

      {/* 2. THE FLOATING FIELD */}
      <div className="absolute inset-0 z-10 w-full h-full">
        {testimonials.slice(0, POSITIONS.length).map((item, idx) => (
          <FloatingCard 
            key={idx} 
            data={{ ...item, ...POSITIONS[idx] }} 
            progress={smoothProgress} 
          />
        ))}
      </div>

      {/* 3. BACKGROUND AMBIENCE */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-full opacity-30 pointer-events-none">
          <div 
            className="absolute inset-0 blur-[150px]"
            style={{ background: `radial-gradient(circle at center, ${COLORS.primaryDark} 0%, transparent 70%)` }}
          />
      </div>
    </section>
  );
};

const FloatingCard = ({ data, progress }) => {
  // Parallax: Each card moves at a different speed based on its 'depth' property
  const yMovement = useTransform(progress, [0, 1], [100 * data.depth, -100 * data.depth]);
  
  return (
    <motion.div
      drag
      dragConstraints={{ left: 0, right: 0, top: 0, bottom: 0 }}
      dragElastic={0.2}
      whileDrag={{ scale: 1.05, zIndex: 50 }}
      style={{ 
        left: data.x, 
        top: data.y, 
        y: yMovement,
        backgroundColor: COLORS.surface,
        borderColor: "rgba(255,255,255,0.05)"
      }}
      initial={{ opacity: 0, scale: 0.8 }}
      whileInView={{ opacity: 1, scale: 1 }}
      className="absolute p-6 md:p-8 rounded-3xl border backdrop-blur-xl shadow-2xl cursor-grab active:cursor-grabbing w-[280px] md:w-[350px] group transition-colors hover:border-primary/30"
    >
      {/* Sparkle Icon */}
      

      <div className="relative z-10">
        <Icon 
          icon="ph:quotes-fill" 
          style={{ color: COLORS.primary }} 
          className="text-3xl mb-4 opacity-30" 
        />
        
        <p 
          className="italic font-light leading-relaxed mb-6 text-sm md:text-base"
          style={{ color: COLORS.neutralWhite, fontFamily: TYPOGRAPHY.fontFamily.body }}
        >
          “{data.content}”
        </p>

        <div className="flex flex-col">
          <h4 
            className=" font-bold "
            style={{ fontFamily: TYPOGRAPHY.fontFamily.heading, color: COLORS.primary }}
          >
            {data.name}
          </h4>
          <span className="text-[9px] uppercase opacity-40 text-white tracking-widest">{data.role}</span>
        </div>
      </div>

      {/* Subtle card glow */}
      <div className="absolute inset-0 opacity-0 group-hover:opacity-10 transition-opacity pointer-events-none rounded-3xl"
           style={{ background: `radial-gradient(circle at center, ${COLORS.primary}, transparent)` }} />
    </motion.div>
  );
};

export default TestimonialCarousel;