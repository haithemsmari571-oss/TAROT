import { COLORS } from "../../../theme";
import type { DailyCard } from "../types/constellation.types";

/** Daily Ritual & Manifestation — always visible, from the day's content. */
const DailyRitual = ({ card }: { card: DailyCard }) => (
  <section className="w-full space-y-4">
    <div
      className="rounded-2xl p-5"
      style={{
        background: `linear-gradient(135deg, ${COLORS.surface} 0%, ${COLORS.surfaceAccent} 100%)`,
        border: `1px solid ${COLORS.neutralWhite}12`,
      }}
    >
      <p className="text-sm font-bold uppercase tracking-wider mb-2" style={{ color: COLORS.primary }}>
        Today's Manifestation
      </p>
      <p className="text-lg leading-relaxed italic" style={{ color: COLORS.neutralWhite }}>
        “{card.manifestation}”
      </p>
    </div>

    <div
      className="rounded-2xl p-5"
      style={{
        background: `linear-gradient(135deg, ${COLORS.surface} 0%, ${COLORS.surfaceAccent} 100%)`,
        border: `1px solid ${COLORS.neutralWhite}12`,
      }}
    >
      <p className="text-sm font-bold uppercase tracking-wider mb-2" style={{ color: COLORS.primary }}>
        A Small Ritual
      </p>
      <p className="text-base leading-relaxed" style={{ color: `${COLORS.neutralWhite}dd` }}>
        {card.ritual}
      </p>
    </div>
  </section>
);

export default DailyRitual;
