import { motion, useReducedMotion } from "framer-motion";
import { usePageVisible } from "../../hooks/usePageVisible";

const GOLD = "#E7C066";

/**
 * The "confirming" living animation for pending claims — deliberately SLOW and
 * patient (a soft gold pulse with a star quietly orbiting), so it reads as
 * "something is happening on your behalf", distinct from the busier loader.
 * Pauses when hidden / under reduced motion.
 */
const ConfirmingAura = ({ size = 22 }: { size?: number }) => {
  const reduced = useReducedMotion();
  const visible = usePageVisible();
  const active = visible && !reduced;

  return (
    <span
      className="relative inline-flex items-center justify-center align-middle"
      style={{ width: size, height: size }}
      aria-hidden
    >
      {/* slow gold pulse */}
      <motion.span
        className="absolute rounded-full"
        style={{ inset: 0, background: `radial-gradient(circle, ${GOLD}55 0%, transparent 65%)` }}
        animate={active ? { opacity: [0.3, 0.8, 0.3], scale: [0.8, 1.15, 0.8] } : { opacity: 0.5 }}
        transition={active ? { duration: 4.5, repeat: Infinity, ease: "easeInOut" } : { duration: 0 }}
      />
      {/* a single star quietly orbiting */}
      <motion.span
        className="absolute inset-0"
        style={{ transformOrigin: "center" }}
        animate={active ? { rotate: 360 } : { rotate: 0 }}
        transition={active ? { duration: 14, repeat: Infinity, ease: "linear" } : { duration: 0 }}
      >
        <span
          className="absolute"
          style={{ left: "50%", top: -1, transform: "translateX(-50%)", fontSize: size * 0.42, color: GOLD }}
        >
          ✦
        </span>
      </motion.span>
      {/* still centre glyph */}
      <span style={{ color: GOLD, fontSize: size * 0.5, filter: `drop-shadow(0 0 3px ${GOLD})` }}>✧</span>
    </span>
  );
};

export default ConfirmingAura;
