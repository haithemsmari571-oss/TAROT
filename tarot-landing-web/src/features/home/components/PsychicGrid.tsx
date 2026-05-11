import { motion } from "framer-motion";
import { Icon } from "@iconify/react";
import { useRef, useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom"; // Added useNavigate
import { COLORS, TYPOGRAPHY } from "../../../theme";
import { PSYCHICS } from "../../about/data/Psychics";

const hideScrollbarStyle = {
  msOverflowStyle: 'none',
  scrollbarWidth: 'none',
  WebkitOverflowScrolling: 'touch',
};

const TarotCouncil = () => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [isPaused, setIsPaused] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  // --- REFINED AUTOSCROLL ---
  useEffect(() => {
    if (isPaused) return;

    const interval = setInterval(() => {
      if (scrollRef.current) {
        const { scrollLeft, scrollWidth, clientWidth } = scrollRef.current;
        const cardWidth = 380; 
        const maxScroll = scrollWidth - clientWidth;
        
        // If at the end, jump back to start, else move forward
        const nextScroll = scrollLeft >= maxScroll - 50 ? 0 : scrollLeft + cardWidth;
        
        scrollRef.current.scrollTo({ 
          left: nextScroll, 
          behavior: "smooth" 
        });
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [isPaused]);

  const handleScroll = () => {
    if (scrollRef.current) {
      const cardWidth = 380;
      const index = Math.round(scrollRef.current.scrollLeft / cardWidth);
      if (index !== activeIndex) setActiveIndex(index);
    }
  };

  const scrollSide = (direction: "left" | "right") => {
    if (scrollRef.current) {
      const distance = direction === "left" ? -380 : 380;
      scrollRef.current.scrollBy({ left: distance, behavior: "smooth" });
    }
  };

  return (
    <section 
      className="relative py-12 overflow-hidden" 
      style={{ backgroundColor: COLORS.dark }}
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
    >
      {/* Background Glows */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-full opacity-10 pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary blur-[120px] rounded-full" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-secondary blur-[120px] rounded-full" />
      </div>

      <div className="max-w-6xl mx-auto mb-8 text-center space-y-3 relative z-10 px-4">
        <motion.h2 
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          style={{ ...TYPOGRAPHY.headings.h2, fontSize: "clamp(2rem, 5vw, 3.5rem)" }} 
          className="tracking-tighter leading-[1] lg:px-20"
        >
          Find the psychic reader who <span style={{ color: COLORS.primary }}>feels right</span>
        </motion.h2>
        <p className="text-sm md:text-base opacity-50 leading-relaxed mx-auto max-w-xl font-medium" style={{ color: COLORS.neutralWhite }}>
          Ready to feel clearer? Your Nebula spiritual advisor is waiting <br/>
          Find a spiritual advisor online for your needs
        </p>
      </div>

      <div className="absolute top-[55%] left-4 z-40 hidden xl:block">
        <NavBtn icon="ph:caret-left-light" onClick={() => scrollSide("left")} />
      </div>
      <div className="absolute top-[55%] right-4 z-40 hidden xl:block">
        <NavBtn icon="ph:caret-right-light" onClick={() => scrollSide("right")} />
      </div>

      <div 
        ref={scrollRef} 
        onScroll={handleScroll} 
        // @ts-ignore
        style={hideScrollbarStyle}
        className="flex gap-6 overflow-x-auto pt-4 pb-12 snap-x px-[10%] md:px-[15%] xl:px-[20%] [&::-webkit-scrollbar]:hidden"
      >
        {PSYCHICS.map((psychic) => (
          <TarotCard key={psychic.id} psychic={psychic} />
        ))}
      </div>

      <div className="flex justify-center gap-2 mt-2">
        {PSYCHICS.map((_, i) => (
          <div key={i} className="h-1 rounded-full transition-all duration-500"
            style={{ 
              width: i === activeIndex ? "32px" : "8px", 
              backgroundColor: i === activeIndex ? COLORS.primary : `${COLORS.neutralDarkGray}80`,
              opacity: i === activeIndex ? 1 : 0.4
            }}
          />
        ))}
      </div>
    </section>
  );
};

const TarotCard = ({ psychic }: { psychic: any }) => {
  const [isBtnHovered, setIsBtnHovered] = useState(false);
  const navigate = useNavigate();

  return (
    <motion.div
      whileHover={{ y: -12 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className="relative min-w-[320px] md:min-w-[340px] h-[600px] snap-center rounded-[2.2rem] p-4 flex flex-col group cursor-pointer"
      onClick={() => navigate(`/psychics/${psychic.id}/details`)}
      style={{ 
        backgroundColor: COLORS.surface, 
        border: `1px solid ${COLORS.neutralDarkGray}40`,
        boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.5)"
      }}
    >
      <div className="absolute inset-3 border border-white/5 rounded-[1.8rem] pointer-events-none" />

      <div className="relative h-[42%] w-full overflow-hidden rounded-[1.6rem] mb-5">
        <motion.img 
          src={psychic.image} 
          whileHover={{ scale: 1.05 }}
          className="w-full h-full object-cover transition-all duration-700  " 
        />
        <div className="absolute inset-0 bg-gradient-to-t from-surface/80 via-transparent to-transparent" />
        
        <div className="absolute top-3 right-3 px-2.5 py-1.5 bg-black/40 backdrop-blur-md rounded-xl border border-white/10 flex items-center gap-1.5">
          <Icon icon="ph:star-fill" style={{ color: COLORS.starGold }} className="text-[10px]" />
          <span className="text-[11px] font-bold text-white">{psychic.rating}</span>
        </div>

        <div className="absolute bottom-3 left-3 px-2.5 py-1 bg-black/60 backdrop-blur-md rounded-full border border-white/10 flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-green-400" />
          <span className="text-[9px] uppercase font-bold tracking-widest text-white">Online</span>
        </div>
      </div>

      <div className="flex-1 flex flex-col items-center text-center space-y-4 px-1">
        <div className="space-y-2">
          <h3 className="uppercase tracking-tight" style={{ ...TYPOGRAPHY.headings.h3, color: COLORS.neutralWhite, fontSize: "1.5rem" }}>
            {psychic.name}
          </h3>
          <div className="flex flex-wrap justify-center gap-1.5">
            {psychic.specialties.map((s: string) => (
              <span key={s} className="px-2.5 py-0.5 rounded-full bg-white/5 border border-white/10 text-[9px] uppercase font-bold text-white/70">
                {s}
              </span>
            ))}
          </div>
        </div>

        <div className="w-full grid grid-cols-2 gap-px border-y border-white/5 py-3 mt-1">
          <div className="text-center">
            <span className="block text-[8px] uppercase tracking-widest opacity-40 text-white mb-0.5">Exp.</span>
            <span className="text-xs text-white font-bold">{psychic.experience}</span>
          </div>
          <div className="text-center border-l border-white/5">
            <span className="block text-[8px] uppercase tracking-widest opacity-40 text-white mb-0.5">Consults</span>
            <span className="text-xs text-white font-bold">{psychic.consultations}</span>
          </div>
        </div>

        <p className="text-[10px] leading-relaxed opacity-40 line-clamp-2 italic px-2" style={{ color: COLORS.neutralWhite }}>
          "{psychic.bio}"
        </p>

        <div className="mt-auto w-full relative">
          <motion.div
            onMouseEnter={() => setIsBtnHovered(true)}
            onMouseLeave={() => setIsBtnHovered(false)}
            whileTap={{ scale: 0.98 }}
            className="w-full py-2.5 px-6 transition-all duration-500 relative flex items-center justify-between overflow-hidden rounded-[1.5rem] group/btn"
            style={{
              fontFamily: TYPOGRAPHY.fontFamily.heading,
              backgroundColor: isBtnHovered ? COLORS.primary : `${COLORS.neutralWhite}15`,
              border: `1px solid ${isBtnHovered ? COLORS.primary : `${COLORS.neutralWhite}15`}`,
              boxShadow: isBtnHovered ? `0 0 15px ${COLORS.primary}30` : "none",
            }}
          >
            <div className="flex flex-col items-start relative z-10 text-left">
              <span className="uppercase tracking-[0.15em] text-[9px] font-black" style={{ color: isBtnHovered ? COLORS.dark : COLORS.primary }}>
                Start Reading
              </span>
              <span className="text-[8px] opacity-60 uppercase font-medium" style={{ color: isBtnHovered ? COLORS.dark : COLORS.primary }}>
                   Instant Connection
              </span>
            </div>

            <div className="relative z-10 flex items-center gap-3">
              <div className="w-[1px] h-5 transition-colors duration-300" 
                style={{ backgroundColor: isBtnHovered ? `${COLORS.dark}20` : `${COLORS.primary}30` }}
              />
              <div className="flex flex-col items-end">
                <span className="text-xs font-black" style={{ color: isBtnHovered ? COLORS.dark : COLORS.primary }}>
                  ${psychic.price}
                </span>
                <span className="text-[7px] uppercase font-bold" style={{ color: isBtnHovered ? COLORS.dark : COLORS.primary }}>
                  / Min
                </span>
              </div>
              <Icon icon="ph:chat-teardrop-dots-fill" className="text-lg" style={{ color: isBtnHovered ? COLORS.dark : COLORS.primary }} />
            </div>
          </motion.div>
        </div>
      </div>
    </motion.div>
  );
};

const NavBtn = ({ icon, onClick }: { icon: string, onClick: () => void }) => (
  <button 
    onClick={onClick} 
    className="w-12 h-12 rounded-full border border-white/5 flex items-center justify-center text-white/20 hover:text-primary hover:border-primary/40 hover:bg-white/5 transition-all active:scale-90 bg-surface/40 backdrop-blur-xl z-50"
  >
    <Icon icon={icon} className="text-2xl" />
  </button>
);

export default TarotCouncil;