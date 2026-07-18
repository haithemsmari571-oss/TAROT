import HALO from "vanta/dist/vanta.halo.min";
import { COLORS } from "../../../theme";
import { VantaBackground } from "../../../components/VantaBackground";

const hexNum = (hex: string) => parseInt(hex.slice(1), 16);

/** Per-persona halo palettes. Sabri's base uses the brand royal purple token
 * (COLORS.primaryDark); the rest have no true theme counterpart and stay bespoke. */
const HALO_VARIANTS = {
  valentina: {
    baseColor: hexNum("#C1443A"),        // crimson-gold
    backgroundColor: hexNum("#2A1408"),  // warm dark
  },
  sabri: {
    baseColor: hexNum(COLORS.primaryDark), // #5D3A9B royal purple (brand token)
    backgroundColor: hexNum("#14092E"),    // dark indigo
  },
} as const;

const AVATAR_STYLE = {
  valentina: { label: "V", ring: "#C1443A" },
  sabri: { label: "S", ring: COLORS.primaryDark },
} as const;

/**
 * A small circular node for the active AI persona (Valentina / Sabri), with a scoped
 * Vanta Halo mounted BEHIND it only while that persona is actively generating — the
 * same signal that drives "Valentina is writing…"; no second flag. Never full-screen.
 *
 * Halo's backgroundColor is an opaque WebGL clear colour, so the canvas lives inside a
 * rounded, overflow-hidden container sized ~2x the avatar diameter — it reads as a glow
 * ring around the avatar, not a coloured square. Going idle UNMOUNTS the effect (full
 * .destroy() via VantaBackground's cleanup), never just hides it with CSS; scale /
 * scaleMobile render the tiny canvas at reduced internal resolution to keep Halo cheap
 * next to the clouds layer.
 */
export const PersonaBadge = ({
  persona,
  active,
  size = 36,
}: {
  persona: "valentina" | "sabri";
  active: boolean;
  size?: number;
}) => {
  const variant = HALO_VARIANTS[persona];
  const avatar = AVATAR_STYLE[persona];
  const haloSize = size * 2;

  return (
    <div
      className="relative flex items-center justify-center"
      style={{ width: size, height: size }}
      title={persona === "valentina" ? "Valentina" : "Sabri"}
    >
      {active && (
        <div
          className="absolute rounded-full overflow-hidden pointer-events-none"
          style={{
            width: haloSize,
            height: haloSize,
            left: -(haloSize - size) / 2,
            top: -(haloSize - size) / 2,
          }}
        >
          <VantaBackground
            effect={HALO}
            options={{
              mouseControls: false,
              touchControls: false,
              gyroControls: false,
              scale: 0.75,
              scaleMobile: 0.5,
              size: 0.8,
              ...variant,
            }}
            className="w-full h-full"
            // Reduced-motion / init-failure fallback: a static radial glow, same palette.
            fallbackStyle={{
              background: `radial-gradient(circle, ${avatar.ring}66 0%, transparent 70%)`,
            }}
          />
        </div>
      )}
      <div
        className="relative z-10 rounded-full flex items-center justify-center text-xs font-bold border"
        style={{
          width: size,
          height: size,
          background: `${COLORS.surface}E6`,
          borderColor: active ? avatar.ring : `${COLORS.neutralDarkGray}80`,
          color: active ? avatar.ring : COLORS.neutralGray,
          boxShadow: active ? `0 0 10px ${avatar.ring}55` : "none",
          transition: "border-color 0.3s, color 0.3s, box-shadow 0.3s",
        }}
      >
        {avatar.label}
      </div>
    </div>
  );
};
