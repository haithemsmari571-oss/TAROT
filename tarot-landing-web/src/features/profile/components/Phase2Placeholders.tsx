import { COLORS } from "../../../theme";

/** Referral + Constellation-progress placeholders — Phase 2. Clearly marked so
 * they read as "coming", not broken. */
const Phase2Placeholders = () => (
  <div className="w-full space-y-4">
    <Placeholder
      title="Gift a friend a free card pull"
      body="Soon you'll be able to share Valentina with a friend and both be rewarded."
      badge="Coming soon"
    />
    <Placeholder
      title="Your Constellation path"
      body="Seeker → Initiate → Oracle's Circle. Your journey will light up here as you go."
      badge="Coming soon"
    />
  </div>
);

const Placeholder = ({
  title,
  body,
  badge,
}: {
  title: string;
  body: string;
  badge: string;
}) => (
  <section
    className="w-full rounded-2xl p-5 relative overflow-hidden"
    style={{
      backgroundColor: COLORS.surface,
      border: `1px dashed ${COLORS.neutralWhite}22`,
    }}
  >
    <div className="flex items-start justify-between gap-3 mb-1">
      <h3 className="text-lg font-bold" style={{ color: `${COLORS.neutralWhite}cc` }}>
        {title}
      </h3>
      <span
        className="text-[11px] font-bold uppercase tracking-wider px-2 py-1 rounded-lg shrink-0"
        style={{ backgroundColor: `${COLORS.primary}20`, color: COLORS.primary }}
      >
        {badge}
      </span>
    </div>
    <p className="text-base" style={{ color: `${COLORS.neutralWhite}88` }}>
      {body}
    </p>
  </section>
);

export default Phase2Placeholders;
