import { motion } from "framer-motion";
import { Icon } from "@iconify/react";
import { useRef, useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import axiosClient from "../../../lib/axiosClient";
import { formatGbp, formatPerMinuteGbp } from "../../../lib/currency";
import { sanitizeClaims } from "../../../lib/copy";
import { useBillingMode } from "../../billing-mode/BillingModeContext";
import { hasWelcomeCredit, useWelcomeCredit, welcomeCreditLine } from "../../client-app/useWelcomeCredit";
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
  const welcomeCreditGbp = useWelcomeCredit();
  
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
          {hasWelcomeCredit(welcomeCreditGbp) && (
            <>
              Your first reading is on us — <b>{formatGbp(welcomeCreditGbp)} free credit</b> with any reader
              below.{" "}
            </>
          )}
          {sectionContent.subtitleLine2}
        </p>
      </div>

      <div className="absolute top-[55%] left-4 z-40 hidden xl:block">
        <NavBtn icon="ph:caret-left-light" label="Previous readers" onClick={() => scrollSide("left")} />
      </div>
      <div className="absolute top-[55%] right-4 z-40 hidden xl:block">
        <NavBtn
          icon="ph:caret-right-light"
          label="Next readers"
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
          <TarotCard key={psychic.id} psychic={psychic} welcomeCreditGbp={welcomeCreditGbp} />
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

const TarotCard = ({ psychic, welcomeCreditGbp }: { psychic: any; welcomeCreditGbp: number | undefined }) => {
  const navigate = useNavigate();
  const specialties = psychic.categories?.map((c: any) => c.title) || [];
  const perMinute = psychic.price_per_second ? psychic.price_per_second * 60 : 0;
  const pricePerMinute = formatPerMinuteGbp(perMinute);
  /* The site's billing mode decides the price line, by PsychicCard.tsx's rule
     (:23-30): per minute only on a per_minute site and only with a per-second
     price. Otherwise, the mode still unknown (in flight or failed) included,
     the reader's per-message price, or no line. Never "£0.00". */
  const { billingMode } = useBillingMode();
  const perMessage = billingMode === "per_message";
  const perMessagePrice =
    psychic.price_per_message != null && psychic.price_per_message > 0 ? psychic.price_per_message : null;
  const perMinuteLine = billingMode === "per_minute" && perMinute > 0;
  /* A picture that fails to load gives way to the initials disc below. Held
     against its URL, so a new URL for the same reader is tried afresh. */
  const [failedPicture, setFailedPicture] = useState<string | null>(null);
  const picture =
    psychic.profile_picture_url && psychic.profile_picture_url !== failedPicture ? psychic.profile_picture_url : null;

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
        {picture ? (
          <motion.img
            src={picture}
            alt={displayName}
            onError={() => setFailedPicture(picture)}
            className="w-full h-full object-cover transition-all duration-700"
          />
        ) : (
          /* No picture, or one that failed to load: the reader's initial in a
             circle, as ReaderDisc draws it (client-app/appReaders.tsx), in the
             colours this card's old ui-avatars fallback asked for. Inline, so
             no app stylesheet is pulled onto the landing page. */
          <div style={{ height: "100%", display: "grid", placeItems: "center" }}>
            <span
              aria-hidden="true"
              style={{
                width: 128,
                height: 128,
                borderRadius: "50%",
                display: "grid",
                placeItems: "center",
                background: "#9a7b4f",
                color: "#fff",
                font: "400 56px/1 var(--gl-serif)",
              }}
            >
              {displayName.slice(0, 1)}
            </span>
          </div>
        )}

        {psychic.is_online && (
          <div className="gl-online">
            <span className="gl-dot" /> Online
          </div>
        )}

        {perMessage && perMessagePrice != null && hasWelcomeCredit(welcomeCreditGbp) && (
          <div className="gl-gift">{welcomeCreditLine(welcomeCreditGbp, perMessagePrice)}</div>
        )}
      </div>

      <div className="flex-1 flex flex-col items-center text-center px-5 pt-4 pb-5">
        {/* max-w-full holds this block to the card's width. Otherwise a long name
            widens it past both edges, and the name line's ellipsis (glass.css
            .gl-pname) never draws. */}
        <div className="space-y-2.5 max-w-full">
          <h3 className="gl-pname" style={{ fontSize: 26 }}>{displayName}</h3>
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
          {sanitizeClaims(psychic.bio) || "A gentle guide ready to help you find clarity."}
        </p>

        <div className="gl-prow2 mt-auto w-full">
          {perMinuteLine ? (
            <div className="gl-price">
              {pricePerMinute} <span>/ min</span>
            </div>
          ) : (
            perMessagePrice != null && (
              <div className="gl-price">
                {formatGbp(perMessagePrice)} <span>/ message</span>
              </div>
            )
          )}
          <button className="gl-start" type="button">
            Start
          </button>
        </div>
      </div>
    </motion.div>
  );
};

// Icon only, so the label is its accessible name.
const NavBtn = ({ icon, label, onClick }: { icon: string; label: string; onClick: () => void }) => (
  <button onClick={onClick} aria-label={label} className="gl-theme-toggle" style={{ width: 46, height: 46 }}>
    <Icon icon={icon} className="text-xl mx-auto" />
  </button>
);

export default TarotCouncil;
