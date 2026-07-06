import { motion, useReducedMotion } from "framer-motion";
import { usePageVisible } from "../../hooks/usePageVisible";
import { TYPOGRAPHY } from "../../theme";

const GOLD = "#E7C066";
const VIOLET = "#2A1B52";

interface Props {
  label?: string;
  size?: number;
  fullscreen?: boolean;
}

// Three little stars orbit the mark, spaced evenly.
const ORBIT_DEGREES = [0, 120, 240];

/**
 * The one branded, celestial loader — a glowing gold "V" with stars orbiting it
 * inside a soft breathing halo. On-brand, GPU-only (transform/opacity), and it
 * pauses when the tab is hidden or the user prefers reduced motion.
 */
const BrandedLoader = ({ label, size = 128, fullscreen = false }: Props) => {
  const reduced = useReducedMotion();
  const visible = usePageVisible();
  const active = visible && !reduced;
  const radius = size / 2 - 8;

  const inner = (
    <div className="flex flex-col items-center gap-5">
      <div className="relative" style={{ width: size, height: size }}>
        {/* breathing gold halo */}
        <motion.div
          className="absolute inset-0 rounded-full"
          style={{ background: `radial-gradient(circle, ${GOLD}44 0%, transparent 62%)`, filter: "blur(8px)" }}
          animate={active ? { opacity: [0.4, 0.85, 0.4], scale: [0.9, 1.06, 0.9] } : { opacity: 0.6 }}
          transition={active ? { duration: 3.4, repeat: Infinity, ease: "easeInOut" } : { duration: 0 }}
        />
        {/* thin gold ring */}
        <div className="absolute rounded-full" style={{ inset: "16%", border: `1px solid ${GOLD}55` }} />

        {/* orbiting stars */}
        <motion.div
          className="absolute inset-0"
          style={{ transformOrigin: "center" }}
          animate={active ? { rotate: 360 } : { rotate: 0 }}
          transition={active ? { duration: 9, repeat: Infinity, ease: "linear" } : { duration: 0 }}
        >
          {ORBIT_DEGREES.map((deg, i) => {
            const rad = (deg * Math.PI) / 180;
            const x = size / 2 + radius * Math.cos(rad);
            const y = size / 2 + radius * Math.sin(rad);
            return (
              <span
                key={i}
                className="absolute"
                style={{
                  left: x,
                  top: y,
                  transform: "translate(-50%, -50%)",
                  fontSize: size * 0.11,
                  color: GOLD,
                  filter: `drop-shadow(0 0 4px ${GOLD})`,
                }}
              >
                ✦
              </span>
            );
          })}
        </motion.div>

        {/* central V mark */}
        <div className="absolute inset-0 flex items-center justify-center">
          <span
            style={{
              fontFamily: TYPOGRAPHY.fontFamily.heading,
              fontSize: size * 0.44,
              fontWeight: 800,
              color: GOLD,
              lineHeight: 1,
              filter: `drop-shadow(0 0 10px ${GOLD}aa)`,
            }}
          >
            V
          </span>
        </div>
      </div>

      {label && (
        <span className="text-base text-center" style={{ color: "rgba(246,238,226,0.85)" }}>
          {label}
        </span>
      )}
    </div>
  );

  if (!fullscreen) return inner;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center"
      style={{
        background: `radial-gradient(circle at 50% 40%, ${VIOLET}dd 0%, rgba(8,5,14,0.97) 70%)`,
      }}
    >
      {inner}
    </div>
  );
};

export default BrandedLoader;
