import { motion } from "framer-motion";
import { COLORS } from "../../../theme";
import type { StreakStatus } from "../types/constellation.types";

/** "Your Practice" — 7 stars filling across the current cycle. */
const PracticeStreak = ({ streak }: { streak: StreakStatus }) => {
  const filled = streak.week_position; // 0-7
  const days = streak.length;

  return (
    <section
      className="w-full rounded-2xl p-5"
      style={{
        background: `linear-gradient(135deg, ${COLORS.surface} 0%, ${COLORS.surfaceAccent} 100%)`,
        border: `1px solid ${COLORS.neutralWhite}12`,
      }}
    >
      <div className="flex items-baseline justify-between mb-4">
        <h3 className="text-lg font-bold" style={{ color: COLORS.neutralWhite }}>
          Your Practice
        </h3>
        <span className="text-base font-semibold" style={{ color: COLORS.primary }}>
          {days === 0 ? "Start today" : `${days}-day streak`}
        </span>
      </div>

      {/* 7 stars */}
      <div className="flex items-center justify-between gap-1.5">
        {Array.from({ length: 7 }).map((_, i) => {
          const on = i < filled;
          const isBonus = i === 6;
          return (
            <div key={i} className="flex flex-col items-center gap-1 flex-1">
              <motion.div
                initial={false}
                animate={{ scale: on ? 1 : 0.85 }}
                transition={{ duration: 0.3 }}
                className="text-2xl"
                style={{
                  color: on ? COLORS.starGold : `${COLORS.neutralGray}55`,
                  filter: on ? `drop-shadow(0 0 6px ${COLORS.starGold}88)` : "none",
                }}
              >
                {isBonus ? "✦" : "★"}
              </motion.div>
              <span className="text-[11px]" style={{ color: `${COLORS.neutralWhite}66` }}>
                {isBonus ? "+10" : i + 1}
              </span>
            </div>
          );
        })}
      </div>

      <p className="mt-4 text-base" style={{ color: `${COLORS.neutralWhite}aa` }}>
        {days === 0
          ? "Pull a card each day to build your practice."
          : filled >= 7
          ? "You completed a 7-day practice — enjoy your bonus ✨"
          : `${streak.days_to_bonus} more day${streak.days_to_bonus === 1 ? "" : "s"} to your +10 ⭐ bonus.`}
      </p>
    </section>
  );
};

export default PracticeStreak;
