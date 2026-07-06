import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { COLORS } from "../../../theme";
import type { StardustBreakdown } from "../types/constellation.types";

/** Stardust balance — big total, tap to see the earned/purchased breakdown. */
const StardustBalance = ({ balance }: { balance: StardustBreakdown }) => {
  const [open, setOpen] = useState(false);
  const [display, setDisplay] = useState(balance.total);
  const prev = useRef(balance.total);

  // Gentle count-up when the total changes (e.g. after a reward lands).
  useEffect(() => {
    const from = prev.current;
    const to = balance.total;
    prev.current = to;
    if (from === to) {
      setDisplay(to);
      return;
    }
    const start = performance.now();
    const dur = 700;
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min((t - start) / dur, 1);
      setDisplay(Math.round(from + (to - from) * p));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [balance.total]);

  return (
    <section
      className="w-full rounded-2xl p-5"
      style={{
        background: `linear-gradient(135deg, ${COLORS.surface} 0%, ${COLORS.surfaceAccent} 100%)`,
        border: `1px solid ${COLORS.primary}22`,
      }}
    >
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between"
        aria-expanded={open}
      >
        <div className="text-left">
          <p className="text-sm font-semibold uppercase tracking-wider" style={{ color: `${COLORS.neutralWhite}88` }}>
            Your Stardust
          </p>
          <p className="text-4xl font-black mt-1" style={{ color: COLORS.starGold }}>
            {display} <span className="text-2xl">⭐</span>
          </p>
        </div>
        <span className="text-base font-semibold" style={{ color: COLORS.primary }}>
          {open ? "Hide" : "Details"}
        </span>
      </button>

      {/* Gentle nudge when earned Stardust is within 7 days of fading. */}
      {balance.earned_expiring_soon > 0 && (
        <p className="mt-3 text-sm font-medium" style={{ color: COLORS.starGold }}>
          Some of your Stardust fades soon ✨
        </p>
      )}

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="mt-4 pt-4 space-y-3" style={{ borderTop: `1px solid ${COLORS.neutralWhite}12` }}>
              <Row label="Purchased" value={balance.purchased} hint="Never expires" />
              <Row
                label="Earned (free)"
                value={balance.earned}
                hint="Spends like any Stardust — 1 ⭐ = £1. Fades 30 days after you receive it."
              />
              {balance.earned_expiring_soon > 0 && (
                <Row
                  label="Fading soon"
                  value={balance.earned_expiring_soon}
                  hint="Use these first — they expire within 7 days."
                  warn
                />
              )}
              <p className="text-xs pt-1" style={{ color: `${COLORS.neutralWhite}66` }}>
                Earned Stardust spends like any Stardust — 1 ⭐ = £1. Earned stars fade 30 days after you receive them.
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
};

const Row = ({
  label,
  value,
  hint,
  warn,
}: {
  label: string;
  value: number;
  hint: string;
  warn?: boolean;
}) => (
  <div className="flex items-start justify-between gap-4">
    <div>
      <p className="text-base font-semibold" style={{ color: warn ? COLORS.starGold : COLORS.neutralWhite }}>
        {label}
      </p>
      <p className="text-sm" style={{ color: `${COLORS.neutralWhite}77` }}>
        {hint}
      </p>
    </div>
    <p className="text-lg font-bold whitespace-nowrap" style={{ color: warn ? COLORS.starGold : COLORS.neutralWhite }}>
      {value} ⭐
    </p>
  </div>
);

export default StardustBalance;
