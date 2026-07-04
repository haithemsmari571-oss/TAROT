import { useNavigate } from "react-router-dom";
import { Icon } from "@iconify/react";
import { COLORS, TYPOGRAPHY } from "../theme";

// Slim, sticky, site-wide welcome-offer bar. Fixed to the very top of the public
// layout; the navbar is offset down by this bar's height (36px) so it's always
// visible above the fold. Uses the existing brand palette/typography only — no
// new design language.
export default function AnnouncementBar() {
  const navigate = useNavigate();

  return (
    <button
      type="button"
      onClick={() => navigate("/register")}
      className="fixed inset-x-0 top-0 z-[55] h-9 w-full flex items-center justify-center gap-2 px-4 transition-all hover:brightness-125"
      style={{
        backgroundColor: COLORS.surface,
        borderBottom: `1px solid ${COLORS.primary}26`,
        fontFamily: TYPOGRAPHY.fontFamily.body,
      }}
    >
      <Icon icon="ph:sparkle-fill" className="text-sm shrink-0" style={{ color: COLORS.starGold }} />
      <span className="text-[11px] sm:text-xs tracking-wide" style={{ color: `${COLORS.neutralWhite}CC` }}>
        New here? Your first reading is on us —{" "}
        <span className="font-bold" style={{ color: COLORS.primary }}>£15 free credit.</span>
      </span>
    </button>
  );
}
