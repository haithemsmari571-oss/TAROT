import { useState } from "react";
import { COLORS } from "../../../theme";
import backArt from "../../../assets/tarot-cards/back.webp";

/**
 * The face-down card. Uses the owner's real card-back artwork; the styled
 * placeholder below is kept only as a fallback if that image fails to load.
 */
const CardBack = ({ className = "" }: { className?: string }) => {
  const [failed, setFailed] = useState(false);

  if (!failed) {
    return (
      <img
        src={backArt}
        alt="Face-down card"
        onError={() => setFailed(true)}
        className={`w-full h-full object-cover rounded-3xl ${className}`}
        style={{ boxShadow: `0 20px 50px ${COLORS.primary}25` }}
      />
    );
  }

  // Fallback placeholder (only shown if the artwork can't load).
  return (
    <div
      className={`relative w-full h-full rounded-3xl overflow-hidden flex items-center justify-center ${className}`}
      style={{
        background: `linear-gradient(160deg, ${COLORS.surfaceAccent} 0%, ${COLORS.dark} 100%)`,
        border: `2px solid ${COLORS.primary}55`,
        boxShadow: `inset 0 0 60px ${COLORS.primary}15`,
      }}
    >
      <div
        className="absolute inset-0 opacity-40"
        style={{
          backgroundImage: `radial-gradient(${COLORS.primary}66 1px, transparent 1px)`,
          backgroundSize: "22px 22px",
        }}
      />
      <div className="relative flex flex-col items-center gap-3">
        <span className="text-5xl" aria-hidden>
          ✦
        </span>
        <span
          className="text-xs font-semibold uppercase tracking-[0.3em]"
          style={{ color: COLORS.primary }}
        >
          Ask Valentina
        </span>
      </div>
    </div>
  );
};

export default CardBack;
