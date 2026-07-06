import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { TYPOGRAPHY } from "../../theme";
import type { Celebration } from "./types";

// Royal velvet + candlelight palette (local to the celebration).
const WINE = "#4A1226";
const VIOLET = "#2A1B52";
const GOLD = "#E7C066";
const GOLD_SOFT = "rgba(231,192,102,0.5)";
const OFFWHITE = "#F6EEE2";
const AUTO_DISMISS_MS = 30000;

const CelebrationModal = ({
  celebration,
  onDismiss,
  onUseStardust,
}: {
  celebration: Celebration;
  onDismiss: () => void;
  onUseStardust: () => void;
}) => {
  const [shown, setShown] = useState(0);
  const dismissedRef = useRef(false);

  // Fire dismissal at most once — never depends on any animation finishing.
  const safeDismiss = () => {
    if (dismissedRef.current) return;
    dismissedRef.current = true;
    onDismiss();
  };

  // Lock page scroll while open; restore exactly on close.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  // Esc to close + hard 30s auto-dismiss safety.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") safeDismiss();
    };
    window.addEventListener("keydown", onKey);
    const timer = window.setTimeout(safeDismiss, AUTO_DISMISS_MS);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Gentle count-up of the reward amount.
  useEffect(() => {
    const target = celebration.amount || 0;
    if (target <= 0) {
      setShown(0);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const dur = 700;
    const tick = (t: number) => {
      const p = Math.min((t - start) / dur, 1);
      setShown(Math.round(target * p));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [celebration.amount]);

  const isGift = celebration.kind === "gift";

  return (
    // Backdrop: deep violet-black at ~70% with a soft blur. Tap outside closes.
    <div
      onClick={safeDismiss}
      className="fixed inset-0 z-[9999] flex items-center justify-center p-5"
      style={{
        backgroundColor: "rgba(16, 8, 22, 0.72)",
        backdropFilter: "blur(6px)",
        WebkitBackdropFilter: "blur(6px)",
        fontFamily: TYPOGRAPHY.fontFamily.body,
      }}
    >
      <motion.div
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        initial={{ opacity: 0, scale: 0.92 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.3, ease: "easeOut" }}
        className="relative w-full max-w-[360px] rounded-[28px] px-7 pt-9 pb-7 text-center overflow-hidden"
        style={{
          background: `linear-gradient(165deg, ${WINE} 0%, #3A1A45 52%, ${VIOLET} 100%)`,
          border: `1px solid ${GOLD_SOFT}`,
          boxShadow: `0 0 44px rgba(231,192,102,0.22), 0 28px 80px rgba(0,0,0,0.6)`,
          color: OFFWHITE,
        }}
      >
        {/* one soft gold ring — bursts once, then rests */}
        <motion.div
          initial={{ opacity: 0, scale: 0.5 }}
          animate={{ opacity: [0, 0.55, 0], scale: 1.7 }}
          transition={{ duration: 1.3, ease: "easeOut" }}
          className="absolute left-1/2 top-16 -translate-x-1/2 w-56 h-56 rounded-full pointer-events-none"
          style={{ background: `radial-gradient(circle, ${GOLD}66 0%, transparent 60%)`, filter: "blur(8px)" }}
        />

        {/* gift / star moment */}
        <motion.div
          initial={{ scale: 0.7, rotate: -6, opacity: 0 }}
          animate={{ scale: 1, rotate: 0, opacity: 1 }}
          transition={{ type: "spring", damping: 15, stiffness: 220 }}
          className="relative mx-auto mb-5 flex items-center justify-center"
          style={{ width: 84, height: 84 }}
        >
          <span className="text-6xl" style={{ filter: `drop-shadow(0 0 14px ${GOLD})` }}>
            {isGift ? "🎁" : "✦"}
          </span>
        </motion.div>

        <p className="text-xl font-bold mb-2" style={{ color: OFFWHITE }}>
          {celebration.title}
        </p>

        <p className="text-4xl font-black mb-4" style={{ color: GOLD }}>
          +{shown} ⭐
        </p>

        {/* personal note (gifts) — a handwritten card from Valentina */}
        {isGift && celebration.message && (
          <div
            className="mb-6 rounded-2xl px-5 py-4 text-left"
            style={{
              backgroundColor: "rgba(255,255,255,0.06)",
              borderLeft: `3px solid ${GOLD}`,
            }}
          >
            <p
              className="text-lg leading-relaxed italic"
              style={{ color: OFFWHITE, fontFamily: TYPOGRAPHY.fontFamily.heading }}
            >
              “{celebration.message}”
            </p>
            <p className="mt-2 text-sm text-right" style={{ color: GOLD }}>
              — Valentina
            </p>
          </div>
        )}

        {!isGift && celebration.message && (
          <p className="text-base mb-6" style={{ color: "rgba(246,238,226,0.8)" }}>
            {celebration.message}
          </p>
        )}

        <button
          onClick={onUseStardust}
          className="w-full rounded-2xl font-bold text-base"
          style={{ height: 56, backgroundColor: GOLD, color: "#2A0E18" }}
        >
          Use your Stardust ✨
        </button>
        <button
          onClick={safeDismiss}
          className="mt-3 w-full rounded-2xl font-semibold text-base"
          style={{ height: 44, color: "rgba(246,238,226,0.7)" }}
        >
          Later
        </button>
      </motion.div>
    </div>
  );
};

export default CelebrationModal;
