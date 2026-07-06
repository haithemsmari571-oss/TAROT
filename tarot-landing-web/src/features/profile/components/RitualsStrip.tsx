import { useState } from "react";
import { COLORS } from "../../../theme";
import type { Ritual, RotationInfo } from "../types/constellation.types";
import RitualClaimSheet from "./RitualClaimSheet";
import LiveCountdown from "../../../components/motion/LiveCountdown";
import ConfirmingAura from "../../../components/motion/ConfirmingAura";

/** The rotating 4-task strip with a live (to the second) countdown. */
const RitualsStrip = ({
  rotation,
  onClaimed,
}: {
  rotation: RotationInfo;
  onClaimed: () => void;
}) => {
  const [sheetRitual, setSheetRitual] = useState<Ritual | null>(null);

  return (
    <section className="w-full">
      <div className="flex items-baseline justify-between mb-4">
        <h3 className="text-lg font-bold" style={{ color: COLORS.neutralWhite }}>
          Rituals
        </h3>
        <span className="text-base font-semibold" style={{ color: COLORS.primary }}>
          New in <LiveCountdown targetIso={rotation.next_rotation_at} />
        </span>
      </div>

      {rotation.rituals.length === 0 ? (
        <div
          className="rounded-2xl p-7 text-center"
          style={{
            background: `linear-gradient(135deg, ${COLORS.surface} 0%, ${COLORS.surfaceAccent} 100%)`,
            border: `1px solid ${COLORS.primary}22`,
          }}
        >
          <div className="text-3xl mb-2" aria-hidden>✦</div>
          <p className="text-2xl font-black" style={{ color: COLORS.primary }}>
            <LiveCountdown targetIso={rotation.next_rotation_at} />
          </p>
          <p className="text-base mt-2" style={{ color: `${COLORS.neutralWhite}bb` }}>
            New rituals arrive with the next rotation ✨
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {rotation.rituals.map((r) => (
            <div
              key={r.id}
              className="rounded-2xl p-4 flex items-center gap-4"
              style={{
                background: `linear-gradient(135deg, ${COLORS.surface} 0%, ${COLORS.surfaceAccent} 100%)`,
                border: `1px solid ${COLORS.neutralWhite}12`,
              }}
            >
              <div
                className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl shrink-0"
                style={{ backgroundColor: `${COLORS.primary}18` }}
              >
                {r.icon || "✨"}
              </div>

              <div className="flex-1 min-w-0">
                <p className="text-base font-semibold truncate" style={{ color: COLORS.neutralWhite }}>
                  {r.title}
                </p>
                <p className="text-sm" style={{ color: COLORS.starGold }}>
                  +{r.reward} ⭐
                </p>
              </div>

              {/* Action / status — one clear state each */}
              {r.pending ? (
                <span
                  className="flex items-center gap-2 text-sm font-semibold text-right shrink-0"
                  style={{ color: COLORS.starGold }}
                  title="The stars are confirming your offering ✨"
                >
                  <ConfirmingAura size={22} />
                  Confirming
                </span>
              ) : r.is_manual ? (
                <button
                  onClick={() => setSheetRitual(r)}
                  className="rounded-xl px-5 font-bold text-sm shrink-0"
                  style={{ height: 44, backgroundColor: COLORS.primary, color: COLORS.dark }}
                >
                  Submit
                </button>
              ) : (
                <span className="text-sm text-right shrink-0" style={{ color: `${COLORS.neutralWhite}88` }}>
                  Earned as you go
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      {sheetRitual && (
        <RitualClaimSheet
          ritual={sheetRitual}
          onClose={() => setSheetRitual(null)}
          onSubmitted={() => {
            setSheetRitual(null);
            onClaimed(); // refresh so the card flips to "confirming ✨"
          }}
        />
      )}
    </section>
  );
};

export default RitualsStrip;
