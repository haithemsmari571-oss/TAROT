import { useEffect, useRef, useState } from "react";

// Immersive image-backed panels for the homepage — replaces the old ARCANA
// "What you'll Receive" cards. Uses inline styles + a small <style> block for
// the pulsing glow keyframe, because the glow colours are data-driven and can't
// live in static Tailwind classes.
import panelLove from "../assets/panels/panel-love.jpg";
import panelCareer from "../assets/panels/panel-career.jpg";
import panelFamily from "../assets/panels/panel-family.jpg";
import panelPastlife from "../assets/panels/panel-pastlife.jpg";
import panelMeditation from "../assets/panels/panel-meditation.jpg";

const PANELS = [
  {
    id: "love",
    image: panelLove,
    category: "Love & Relationships",
    number: "01",
    title: "Who stays.\nWho leaves.",
    glowColor: "#FF4D8D",
    glowColorRgb: "255, 77, 141",
    body: [
      "Will he come back. Is she the one. Should you hold on or let go. Your psychic sees the ending before it arrives and tells you who is worth the wait.",
      "The text they almost sent. The reason behind the silence. What he says about you when you are not in the room. Your psychic reads what is hidden.",
      "Timelines. Dates. The month the call comes. The week the shift begins. Your psychic does not speak in someday. She speaks in soon.",
      "The connection you cannot explain. The pull that started before you met. Your psychic knows if this is a twin flame, a karmic lesson, or the one you have been waiting for.",
    ],
  },
  {
    id: "career",
    image: panelCareer,
    category: "Money & Career",
    number: "02",
    title: "What is about\nto change.",
    glowColor: "#F2AE40",
    glowColorRgb: "242, 174, 64",
    body: [
      "The promotion, the offer, the opportunity you have not seen yet. Your psychic sees the door before you reach the hallway.",
      "The person blocking your progress. The colleague who smiles and moves against you. Your psychic names who to trust and who to watch.",
      "The month your finances shift. The season the contract lands. The week the risk pays off. Your psychic gives you the window, not the wish.",
      "The business idea you keep pushing down. The path you are afraid to take. Your psychic sees the version of your life where you finally say yes.",
    ],
  },
  {
    id: "family",
    image: panelFamily,
    category: "Family",
    number: "03",
    title: "What no one\nwill say out loud.",
    glowColor: "#FF7043",
    glowColorRgb: "255, 112, 67",
    body: [
      "The grudge that has been sitting at the table for years. The conversation everyone avoids. Your psychic sees the real fracture underneath the silence.",
      "The parent who loves you in a language you stopped translating. The sibling who pulled away and the reason they never gave. Your psychic reads what the distance actually means.",
      "The cycle you inherited without choosing it. The pattern your mother carried and handed to you without a word. Your psychic traces it back to where it started.",
      "The reconciliation that is closer than you think. The family member who is about to reach out. Your psychic sees the thaw before the ice knows it is melting.",
    ],
  },
  {
    id: "pastlife",
    image: panelPastlife,
    category: "Past Life",
    number: "04",
    title: "Why this life\nfeels familiar.",
    glowColor: "#9B59B6",
    glowColorRgb: "155, 89, 182",
    body: [
      "The person you loved before you met them. The recognition that hit your body before your mind caught up. Your psychic sees the life where you already knew each other.",
      "The fear that makes no sense in this lifetime. The water, the height, the abandonment, the thing you cannot explain with your own history. Your psychic traces the origin.",
      "The talent that came too easily. The place that felt like home the first time you visited. The language your soul already speaks. Your psychic sees where you learned it.",
      "The debt you are still repaying. The lesson your soul signed up for this time. Your psychic reads the contract you wrote before you were born.",
    ],
  },
  {
    id: "meditation",
    image: panelMeditation,
    category: "Guided Meditation",
    number: "05",
    title: "The frequency\nyou have not unlocked.",
    glowColor: "#00C9A7",
    glowColorRgb: "0, 201, 167",
    body: [
      "The energy center that has been blocked since the moment you stopped trusting yourself. Your psychic locates it, names it, and guides you through opening what you shut down to survive.",
      "The manifestation that keeps almost arriving. The job, the person, the money that circles but never lands. Your psychic shows you the vibration you are sending that is pushing it three feet past your reach.",
      "The higher self you talk over every time she speaks. The version of you that already knows the answer but cannot get past the noise. Your psychic quiets the room and lets her through.",
      "The alignment you feel for five seconds in the morning before the world rushes in. Your psychic teaches you how to hold it for five minutes, then five hours, then the rest of your life.",
    ],
  },
];

const HEADING_FONT = "'Bricolage Grotesque', sans-serif";
const BODY_FONT = "'Poppins', sans-serif";
const LAVENDER = "#D2B9FF";
const EASE = "all 0.4s cubic-bezier(0.4, 0, 0.2, 1)";

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(
    typeof window !== "undefined" ? window.innerWidth < 768 : false
  );
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return isMobile;
}

const Panel = ({ panel, active, isMobile, onEnter, onLeave, panelRef }) => {
  return (
    <div
      ref={panelRef}
      className={active ? "psychic-panel psychic-panel-active" : "psychic-panel"}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      style={{
        position: "relative",
        flex: isMobile ? undefined : active ? "1.15" : "1",
        minWidth: 0,
        width: isMobile ? "100%" : undefined,
        height: isMobile ? 520 : undefined,
        minHeight: isMobile ? undefined : 680,
        borderRadius: 16,
        overflow: "hidden",
        cursor: "pointer",
        border: active
          ? `1px solid ${hexToRgba(panel.glowColor, 0.4)}`
          : "1px solid rgba(255,255,255,0.08)",
        // active box-shadow is driven by the glowPulse keyframe (which reads
        // --glow-rgb); leave it unset here so the animation can win.
        boxShadow: active ? undefined : "none",
        transition: EASE,
        // custom property consumed by the @keyframes glowPulse rule
        "--glow-rgb": panel.glowColorRgb,
      }}
    >
      {/* Background image */}
      <img
        src={panel.image}
        alt=""
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          objectFit: "cover",
          objectPosition: "center top",
          transition: EASE,
          transform: active ? "scale(1.04)" : "scale(1)",
        }}
      />

      {/* Dark overlay */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: active ? "rgba(0,0,0,0.48)" : "rgba(0,0,0,0.62)",
          transition: EASE,
        }}
      />

      {/* Content */}
      <div
        style={{
          position: "relative",
          zIndex: 2,
          height: "100%",
          minHeight: "inherit",
          padding: 24,
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          boxSizing: "border-box",
        }}
      >
        {/* TOP: category + number */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            gap: 8,
          }}
        >
          <span
            style={{
              fontFamily: BODY_FONT,
              fontSize: 11,
              letterSpacing: "0.15em",
              textTransform: "uppercase",
              color: active ? panel.glowColor : "rgba(255,255,255,0.55)",
              transition: EASE,
            }}
          >
            {panel.category}
          </span>
          <span
            style={{
              fontFamily: BODY_FONT,
              fontSize: 11,
              opacity: 0.3,
              color: "#fff",
              flexShrink: 0,
            }}
          >
            {panel.number}
          </span>
        </div>

        {/* MIDDLE: full body copy (paragraphs 2-4), only when active */}
        <div
          style={{
            overflow: "hidden",
            maxHeight: active ? 600 : 0,
            opacity: active ? 1 : 0,
            marginTop: active ? 20 : 0,
            transition: "max-height 0.5s cubic-bezier(0.4,0,0.2,1), opacity 0.4s ease, margin-top 0.4s ease",
          }}
        >
          {panel.body.slice(1).map((para, i) => (
            <p
              key={i}
              style={{
                fontFamily: BODY_FONT,
                fontSize: 14,
                lineHeight: 1.7,
                color: "rgba(255,255,255,0.82)",
                margin: "0 0 12px 0",
                transform: active ? "translateY(0)" : "translateY(8px)",
                opacity: active ? 1 : 0,
                transition: `opacity 0.4s ease ${i * 80}ms, transform 0.4s ease ${i * 80}ms`,
              }}
            >
              {para}
            </p>
          ))}
        </div>

        {/* BOTTOM: title + first body paragraph */}
        <div style={{ marginTop: "auto" }}>
          <h3
            style={{
              fontFamily: HEADING_FONT,
              fontWeight: 700,
              fontSize: isMobile ? 22 : 26,
              lineHeight: 1.1,
              color: "#fff",
              margin: "0 0 12px 0",
              whiteSpace: "pre-line",
            }}
          >
            {panel.title}
          </h3>
          <p
            style={{
              fontFamily: BODY_FONT,
              fontSize: 13,
              lineHeight: 1.6,
              color: "rgba(255,255,255,0.9)",
              margin: 0,
              opacity: active ? 0 : 0.7,
              maxHeight: active ? 0 : 60,
              overflow: "hidden",
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
              transition: "opacity 0.3s ease, max-height 0.4s ease",
            }}
          >
            {panel.body[0]}
          </p>
        </div>
      </div>
    </div>
  );
};

function hexToRgba(hex, alpha) {
  const h = hex.replace("#", "");
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

const PsychicPanels = () => {
  const isMobile = useIsMobile();
  const [hovered, setHovered] = useState(null);
  const [inView, setInView] = useState(() => new Set());
  const panelRefs = useRef([]);

  // Mobile: trigger the glow / expanded copy when a panel scrolls into view.
  useEffect(() => {
    if (!isMobile) {
      setInView(new Set());
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        setInView((prev) => {
          const next = new Set(prev);
          entries.forEach((entry) => {
            const idx = Number(entry.target.dataset.index);
            if (entry.isIntersecting) next.add(idx);
            else next.delete(idx);
          });
          return next;
        });
      },
      { threshold: 0.4 }
    );
    panelRefs.current.forEach((el) => el && observer.observe(el));
    return () => observer.disconnect();
  }, [isMobile]);

  const isActive = (i) => (isMobile ? inView.has(i) : hovered === i);

  return (
    <>
      <style>{`
        @keyframes glowPulse {
          0%, 100% {
            box-shadow: 0 0 40px 8px rgba(var(--glow-rgb), 0.35),
                        inset 0 0 60px 0px rgba(var(--glow-rgb), 0.12);
          }
          50% {
            box-shadow: 0 0 48px 10px rgba(var(--glow-rgb), 0.5),
                        inset 0 0 60px 0px rgba(var(--glow-rgb), 0.14);
          }
        }
        .psychic-panel-active {
          animation: glowPulse 3s ease-in-out infinite;
        }
      `}</style>

      {/* Header */}
      <div style={{ textAlign: "center", marginBottom: 48 }}>
        <h2
          style={{
            fontFamily: HEADING_FONT,
            fontWeight: 800,
            fontSize: "clamp(2rem, 6vw, 3.5rem)",
            lineHeight: 1.1,
            color: "#fff",
            margin: 0,
            letterSpacing: "-0.02em",
          }}
        >
          What your psychic <span style={{ color: LAVENDER }}>already</span> sees.
        </h2>
        <p
          style={{
            fontFamily: BODY_FONT,
            fontSize: 14,
            color: "rgba(255,255,255,0.5)",
            marginTop: 14,
            letterSpacing: "0.02em",
          }}
        >
          Five truths. One reading.
        </p>
      </div>

      {/* Panels */}
      <div
        style={{
          display: "flex",
          flexDirection: isMobile ? "column" : "row",
          gap: 16,
        }}
      >
        {PANELS.map((panel, i) => (
          <Panel
            key={panel.id}
            panel={panel}
            active={isActive(i)}
            isMobile={isMobile}
            panelRef={(el) => {
              panelRefs.current[i] = el;
              if (el) el.dataset.index = String(i);
            }}
            onEnter={() => !isMobile && setHovered(i)}
            onLeave={() => !isMobile && setHovered(null)}
          />
        ))}
      </div>
    </>
  );
};

export default PsychicPanels;
