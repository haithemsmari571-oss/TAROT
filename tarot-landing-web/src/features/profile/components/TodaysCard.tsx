import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { COLORS, TYPOGRAPHY } from "../../../theme";
import { getCardArt } from "../cardArt";
import CardBack from "./CardBack";
import BrandedLoader from "../../../components/motion/BrandedLoader";
import type { DailyCard } from "../types/constellation.types";

interface Props {
  card: DailyCard | null;
  pulled: boolean; // server truth — the single source of the state machine
  reward: number | null; // today's reward once pulled
  pulling: boolean;
  revealError: string | null; // only ever set for real/network errors, never 409
  upsell: { headline: string; subline: string; cta_label: string };
  onReveal: () => void;
  onAskValentina: () => void;
}

/**
 * Today's Card. Exactly one of two states, decided by the server `pulled` flag:
 *   available → face-down card + "Reveal today's card"
 *   revealed  → face-up card + interpretation + soft "until tomorrow" caption + CTA
 * Persists across refreshes/re-logins because it mirrors the server pull record.
 */
const TodaysCard = ({
  card,
  pulled,
  reward,
  pulling,
  revealError,
  upsell,
  onReveal,
  onAskValentina,
}: Props) => {
  const art = getCardArt(card?.card_key);

  // One-shot gold burst when the card transitions from available → revealed.
  const [burst, setBurst] = useState(false);
  const prevPulled = useRef(pulled);
  useEffect(() => {
    if (!prevPulled.current && pulled) {
      setBurst(true);
      const t = setTimeout(() => setBurst(false), 1400);
      return () => clearTimeout(t);
    }
    prevPulled.current = pulled;
  }, [pulled]);

  return (
    <section className="w-full">
      <h2
        className="text-center mb-4"
        style={{ ...TYPOGRAPHY.headings.h3, fontSize: "1.5rem", color: COLORS.neutralWhite }}
      >
        Today's Card
      </h2>

      <div className="relative mx-auto" style={{ width: "min(78vw, 300px)", aspectRatio: "600 / 1066" }}>
        <AnimatePresence>
          {burst && (
            <motion.div
              initial={{ opacity: 0, scale: 0.6 }}
              animate={{ opacity: [0, 0.8, 0], scale: 1.8 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 1.4, ease: "easeOut" }}
              className="absolute inset-0 rounded-3xl pointer-events-none z-20"
              style={{
                background: `radial-gradient(circle, ${COLORS.starGold}88 0%, transparent 60%)`,
                filter: "blur(8px)",
              }}
            />
          )}
        </AnimatePresence>

        <AnimatePresence mode="wait">
          {pulled ? (
            <motion.div
              key="front"
              initial={{ opacity: 0, scale: 0.94 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.5, ease: "easeOut" }}
              className="w-full h-full relative z-10"
            >
              {art ? (
                <img
                  src={art}
                  alt={card?.card_name ?? "Your card"}
                  className="w-full h-full object-contain rounded-3xl"
                  style={{ boxShadow: `0 20px 50px ${COLORS.primary}30` }}
                />
              ) : (
                // Safety fallback (shouldn't happen for keys 0-21): never a blank.
                <div
                  className="w-full h-full rounded-3xl flex items-center justify-center text-center px-4"
                  style={{ backgroundColor: COLORS.surfaceAccent, border: `1px solid ${COLORS.primary}40` }}
                >
                  <span className="text-xl font-bold" style={{ color: COLORS.neutralWhite }}>
                    {card?.card_name}
                  </span>
                </div>
              )}
            </motion.div>
          ) : (
            <motion.button
              key="back"
              onClick={onReveal}
              disabled={pulling}
              exit={{ opacity: 0, scale: 0.94 }}
              whileTap={{ scale: 0.97 }}
              className="w-full h-full block relative z-10"
              aria-label="Reveal today's card"
            >
              <CardBack />
              {pulling && (
                <div className="absolute inset-0 flex items-center justify-center rounded-3xl" style={{ backgroundColor: "rgba(16,8,22,0.6)", backdropFilter: "blur(2px)" }}>
                  <BrandedLoader label="Revealing…" size={96} />
                </div>
              )}
            </motion.button>
          )}
        </AnimatePresence>
      </div>

      {/* ── AVAILABLE state: the only place the reveal button exists ────────── */}
      {!pulled && (
        <>
          <button
            onClick={onReveal}
            disabled={pulling}
            className="mt-6 w-full rounded-2xl font-bold text-base flex items-center justify-center disabled:opacity-60"
            style={{ height: 56, backgroundColor: COLORS.primary, color: COLORS.dark }}
          >
            {pulling ? "Revealing…" : "Reveal today's card"}
          </button>
          {revealError && (
            <p className="mt-3 text-center text-sm" style={{ color: COLORS.error }}>
              {revealError}
            </p>
          )}
        </>
      )}

      {/* ── REVEALED state: reward, soft caption, interpretation, upsell ────── */}
      {pulled && (
        <>
          {reward != null && (
            <motion.p
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-center mt-4 text-lg font-bold"
              style={{ color: COLORS.starGold }}
            >
              The stars gave you {reward} ⭐ Stardust
            </motion.p>
          )}

          {card && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 }}
              className="mt-4 text-center px-2"
            >
              <p className="text-xl font-bold mb-1" style={{ color: COLORS.neutralWhite }}>
                {card.card_name}
              </p>
              <p className="text-sm mb-3" style={{ color: `${COLORS.neutralWhite}77` }}>
                Your card until tomorrow ✨
              </p>
              <p className="text-base leading-relaxed" style={{ color: `${COLORS.neutralWhite}cc` }}>
                {card.interpretation}
              </p>
            </motion.div>
          )}

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.35 }}
            className="mt-6 rounded-2xl p-5 text-center"
            style={{
              background: `linear-gradient(135deg, ${COLORS.surface} 0%, ${COLORS.surfaceAccent} 100%)`,
              border: `1px solid ${COLORS.primary}30`,
            }}
          >
            <p className="text-base font-semibold mb-1" style={{ color: COLORS.neutralWhite }}>
              {upsell.headline}
            </p>
            <p className="text-base mb-4" style={{ color: `${COLORS.neutralWhite}aa` }}>
              {upsell.subline}
            </p>
            <button
              onClick={onAskValentina}
              className="w-full rounded-2xl font-bold text-base flex items-center justify-center"
              style={{ height: 56, backgroundColor: COLORS.starGold, color: COLORS.dark }}
            >
              {upsell.cta_label}
            </button>
          </motion.div>
        </>
      )}
    </section>
  );
};

export default TodaysCard;
