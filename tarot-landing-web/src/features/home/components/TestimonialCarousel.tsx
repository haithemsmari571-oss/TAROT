import { motion, useScroll, useTransform, useSpring } from "framer-motion";
import { Icon } from "@iconify/react";
import { useRef, useState, useEffect } from "react";
import axiosClient from "../../../lib/axiosClient";
import { sanitizeClaims } from "../../../lib/copy";
import "../../../styles/glass.css";

const DEFAULT_TESTIMONIALS = [
  { name: "Aria Vance", role: "Soul Seeker", content: "It felt like she was reading the very blueprint of my heart. Every word landed exactly where I needed it." },
  { name: "Julian Thorne", role: "Returning Client", content: "The depth here is unreal. My reading covered every corner of my life and left nothing unspoken." },
  { name: "Elena Rossi", role: "Artist", content: "A single message was all I needed. Short, piercingly clear, and delivered with grace." },
  { name: "Marcus K.", role: "Mentor", content: "Rarely do I find an intuitive with this level of raw, unfiltered honesty. No fluff." },
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
  
  const getInitialTestimonials = () => {
    const cached = localStorage.getItem("landing_testimonials_content");
    if (cached) {
      try {
        return JSON.parse(cached);
      } catch (e) {}
    }
    return DEFAULT_TESTIMONIALS;
  };

  const [testimonials, setTestimonials] = useState(getInitialTestimonials);
  const [isLoaded, setIsLoaded] = useState(() => {
    return !!localStorage.getItem("landing_testimonials_content");
  });

  useEffect(() => {
    axiosClient.get("/landing/testimonials").then((res) => {
      if (res.data?.content?.testimonials) {
        setTestimonials(res.data.content.testimonials);
        localStorage.setItem("landing_testimonials_content", JSON.stringify(res.data.content.testimonials));
      }
      setIsLoaded(true);
    }).catch(() => {
      setIsLoaded(true);
    });
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
      style={{ backgroundColor: "transparent" }}
    >
      {/* 1. SECTION HEADER */}
 

      {/* 2. THE FLOATING FIELD */}
      {isLoaded && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5 }}
          className="absolute inset-0 z-10 w-full h-full"
        >
          {testimonials.slice(0, POSITIONS.length).map((item, idx) => (
            <FloatingCard 
              key={idx} 
              data={{ ...item, ...POSITIONS[idx] }} 
              progress={smoothProgress} 
            />
          ))}
        </motion.div>
      )}

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
      style={{ left: data.x, top: data.y, y: yMovement }}
      initial={{ opacity: 0, scale: 0.8 }}
      whileInView={{ opacity: 1, scale: 1 }}
      className="gl-panel absolute p-6 md:p-8 cursor-grab active:cursor-grabbing w-[280px] md:w-[350px] group"
    >
      <div className="relative z-10">
        <Icon icon="ph:quotes-fill" className="gl-acc text-3xl mb-4 opacity-40" />

        <p className="gl-italic-note leading-relaxed mb-6 text-base md:text-lg">
          “{sanitizeClaims(data.content)}”
        </p>

        <div className="flex flex-col">
          <h4 className="gl-serif gl-t" style={{ fontSize: 18 }}>
            {data.name}
          </h4>
          <span className="gl-tf text-[9px] uppercase tracking-widest mt-1">{data.role}</span>
        </div>
      </div>
    </motion.div>
  );
};

export default TestimonialCarousel;