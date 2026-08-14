import { motion } from "framer-motion";
import { Icon } from "@iconify/react";
import { useRef, useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import axiosClient from "../../../lib/axiosClient";
import { formatPerMinuteGbp, welcomeCreditMinutes } from "../../../lib/currency";
import { DISPLAY_RATINGS, getTier } from "../../../lib/psychicDisplay";
import "../../../styles/glass.css";

const DEFAULT_PSYCHICS_SECTION = {
  heading: "Find the psychic reader who",
  headingHighlighted: "feels right",
  subtitleLine2: "Find a spiritual advisor online for your needs",
  featuredPsychicIds: [] as number[],
};

const hideScrollbarStyle = {
  msOverflowStyle: "none",
  scrollbarWidth: "none",
  WebkitOverflowScrolling: "touch",
};

const TarotCouncil = () => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [isPaused, setIsPaused] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  
  const getInitialSectionContent = () => {
    const cached = localStorage.getItem("landing_psychics_section_content");
    if (cached) {
      try {
        return JSON.parse(cached);
      } catch (e) {}
    }
    return DEFAULT_PSYCHICS_SECTION;
  };

  const getInitialPsychicsList = () => {
    const cached = localStorage.getItem("landing_psychics_list");
    if (cached) {
      try {
        return JSON.parse(cached);
      } catch (e) {}
    }
    return [];
  };

  const [psychics, setPsychics] = useState<any[]>(getInitialPsychicsList);
  const [sectionContent, setSectionContent] = useState(getInitialSectionContent);
  const [isLoaded, setIsLoaded] = useState(() => {
    return !!localStorage.getItem("landing_psychics_section_content") && !!localStorage.getItem("landing_psychics_list");
  });

  useEffect(() => {
    Promise.all([
      axiosClient.get("/landing/psychics").catch(() => null),
      axiosClient.get("/psychic/", { params: { limit: 100 } }).catch(() => null),
    ]).then(([landingRes, psychicsRes]) => {
      let currentSectionContent = DEFAULT_PSYCHICS_SECTION;
      if (landingRes?.data?.content) {
        currentSectionContent = {
          ...DEFAULT_PSYCHICS_SECTION,
          ...landingRes.data.content,
        };
        setSectionContent(currentSectionContent);
        localStorage.setItem("landing_psychics_section_content", JSON.stringify(currentSectionContent));
      }
      const allPsychics: any[] = psychicsRes?.data?.items || [];
      const featuredIds: number[] =
        landingRes?.data?.content?.featuredPsychicIds || [];
      const filtered =
        featuredIds.length > 0
          ? allPsychics.filter((p: any) => featuredIds.includes(p.id))
          : allPsychics;
      setPsychics(filtered);
      localStorage.setItem("landing_psychics_list", JSON.stringify(filtered));
      setIsLoaded(true);
    }).catch(() => {
      setIsLoaded(true);
    });
  }, []);

  // --- REFINED AUTOSCROLL ---
  useEffect(() => {
    if (isPaused || psychics.length === 0) return;

    const interval = setInterval(() => {
      if (scrollRef.current) {
        const { scrollLeft, scrollWidth, clientWidth } = scrollRef.current;
        const cardWidth = 380;
        const maxScroll = scrollWidth - clientWidth;

        const nextScroll =
          scrollLeft >= maxScroll - 50 ? 0 : scrollLeft + cardWidth;

        scrollRef.current.scrollTo({
          left: nextScroll,
          behavior: "smooth",
        });
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [isPaused, psychics.length]);

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
      style={{ backgroundColor: "transparent" }}
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
    >
      {isLoaded && psychics.length > 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5 }}
          className="w-full h-full"
        >
      <div className="max-w-6xl mx-auto mb-8 text-center space-y-4 relative z-10 px-4">
        <div className="gl-kicker" style={{ marginBottom: 0 }}>Live readers</div>
        <motion.h2
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          className="gl-h2 lg:px-20"
        >
          {sectionContent.heading} <i>{sectionContent.headingHighlighted}</i>
        </motion.h2>
        <p className="gl-sub" style={{ marginBottom: 0 }}>
          Your first reading is on us — <b>£15 free credit</b> with any reader
          below. {sectionContent.subtitleLine2}
        </p>
      </div>

      <div className="absolute top-[55%] left-4 z-40 hidden xl:block">
        <NavBtn icon="ph:caret-left-light" onClick={() => scrollSide("left")} />
      </div>
      <div className="absolute top-[55%] right-4 z-40 hidden xl:block">
        <NavBtn
          icon="ph:caret-right-light"
          onClick={() => scrollSide("right")}
        />
      </div>

      <div
        ref={scrollRef}
        onScroll={handleScroll}
        // @ts-ignore
        style={hideScrollbarStyle}
        className="flex gap-6 overflow-x-auto pt-4 pb-12 snap-x px-[10%] md:px-[15%] xl:px-[20%] [&::-webkit-scrollbar]:hidden"
      >
        {psychics.map((psychic) => (
          <TarotCard key={psychic.id} psychic={psychic} />
        ))}
      </div>

      <div className="flex justify-center gap-2 mt-2">
        {psychics.map((_, i) => (
          <div
            key={i}
            className="h-1 rounded-full transition-all duration-500"
            style={{
              width: i === activeIndex ? "32px" : "8px",
              backgroundColor: i === activeIndex ? "var(--gl-accent)" : "var(--gl-hair)",
              opacity: i === activeIndex ? 1 : 0.5,
            }}
          />
        ))}
      </div>
        </motion.div>
      )}
    </section>
  );
};

const TarotCard = ({ psychic }: { psychic: any }) => {
  const navigate = useNavigate();
  const specialties = psychic.categories?.map((c: any) => c.title) || [];
  const perMinute = psychic.price_per_second ? psychic.price_per_second * 60 : 0;
  const pricePerMinute = formatPerMinuteGbp(perMinute);

  const tier = getTier(perMinute);
  const tierClass = tier.label === "Rising" ? "gl-tier--rising" : "gl-tier--elite";
  const rating = DISPLAY_RATINGS[psychic.id];
  const filledStars = rating != null ? Math.round(rating) : 0;

  const displayName = psychic.username
    ? psychic.username.charAt(0).toUpperCase() + psychic.username.slice(1).toLowerCase()
    : "";

  return (
    <motion.div
      whileHover={{ y: -12 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className="gl-pc relative min-w-[320px] md:min-w-[340px] h-[600px] snap-center flex flex-col group"
      onClick={() => navigate(`/psychics/${psychic.id}/details`)}
    >
      <div className="gl-ph relative w-full overflow-hidden" style={{ height: "42%" }}>
        <motion.img
          src={
            psychic.profile_picture_url ||
            `https://ui-avatars.com/api/?name=${encodeURIComponent(psychic.username)}&background=9a7b4f&color=fff`
          }
          className="w-full h-full object-cover transition-all duration-700"
        />

        {psychic.is_online && (
          <div className="gl-online">
            <span className="gl-dot" /> Online
          </div>
        )}

        <div className={`gl-tier ${tierClass}`}>{tier.label}</div>

        {welcomeCreditMinutes(psychic.price_per_second) > 0 && (
          <div className="gl-gift">
            £15 free · {welcomeCreditMinutes(psychic.price_per_second)} min
          </div>
        )}
      </div>

      <div className="flex-1 flex flex-col items-center text-center px-5 pt-4 pb-5">
        <div className="space-y-2.5">
          <h3 className="gl-pname" style={{ fontSize: 26 }}>{displayName}</h3>
          {rating != null && (
            <div className="gl-stars">
              {"★".repeat(filledStars)}
              {"☆".repeat(Math.max(0, 5 - filledStars))}
              <span>{rating.toFixed(1)}</span>
            </div>
          )}
          <div className="flex flex-wrap justify-center gap-1.5">
            {specialties.slice(0, 3).map((s: string) => (
              <span key={s} className="gl-tag">{s}</span>
            ))}
            {specialties.length > 3 && (
              <span className="gl-tag">+{specialties.length - 3}</span>
            )}
          </div>
        </div>

        <p className="gl-spec px-1 mt-4" style={{ minHeight: 0 }}>
          {psychic.bio || "A gentle guide ready to help you find clarity."}
        </p>

        <div className="gl-prow2 mt-auto w-full">
          <div className="gl-price">
            {pricePerMinute} <span>/ min</span>
          </div>
          <button className="gl-start" type="button">
            Start
          </button>
        </div>
      </div>
    </motion.div>
  );
};

const NavBtn = ({ icon, onClick }: { icon: string; onClick: () => void }) => (
  <button onClick={onClick} className="gl-theme-toggle" style={{ width: 46, height: 46 }}>
    <Icon icon={icon} className="text-xl mx-auto" />
  </button>
);

export default TarotCouncil;
