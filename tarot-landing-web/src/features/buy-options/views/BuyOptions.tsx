import { useEffect, useState } from "react";
import { Icon } from "@iconify/react";
import { COLORS, TYPOGRAPHY } from "../../../theme";
import { formatGbp } from "../../../lib/currency";
import { paymentApi } from "../../payment/api/paymentApi";
import type { StardustTiersResponse } from "../../payment/types/payment.types";

// Read-only view of the LIVE Stardust bonus tiers. The source of truth is the
// checkout engine (backend app/services/stardust.py); this page mirrors it so
// operators can see exactly what customers pay. The legacy buy_options table is
// retired — the live checkout never used it. Editing happens in code for now.

const range = (min: number, max: number) => `${formatGbp(min)} – ${formatGbp(max)}`;

const StardustTiers = () => {
  const [tiers, setTiers] = useState<StardustTiersResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchTiers = async () => {
    try {
      setLoading(true);
      setError(null);
      setTiers(await paymentApi.getStardustTiers());
    } catch (err: any) {
      setError(err?.response?.data?.detail || err?.message || "Failed to load Stardust tiers.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTiers();
  }, []);

  if (loading && !tiers) {
    return (
      <div className="p-12 min-h-screen flex items-center justify-center" style={{ backgroundColor: COLORS.dark }}>
        <Icon icon="svg-spinners:3-dots-fade" className="text-5xl" style={{ color: COLORS.primary }} />
      </div>
    );
  }

  if (error && !tiers) {
    return (
      <div className="p-12 min-h-screen flex items-center justify-center" style={{ backgroundColor: COLORS.dark }}>
        <div className="flex flex-col items-center gap-4 max-w-md text-center">
          <Icon icon="solar:danger-circle-bold-duotone" className="text-5xl" style={{ color: COLORS.starGold }} />
          <span className="text-white font-bold text-lg">{error}</span>
          <button
            onClick={fetchTiers}
            className="px-6 py-3 rounded-xl font-bold uppercase text-xs tracking-wider hover:scale-105 transition-transform"
            style={{ backgroundColor: COLORS.primary, color: COLORS.dark }}
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!tiers) return null;

  return (
    <div className="p-12 min-h-screen" style={{ backgroundColor: COLORS.dark, fontFamily: TYPOGRAPHY.fontFamily.body }}>
      {/* Header */}
      <div className="mb-8">
        <h1 style={TYPOGRAPHY.headings.h2} className="uppercase italic tracking-tighter">
          Stardust <span style={{ color: COLORS.primary }}>Tiers</span>
        </h1>
        <p style={{ color: COLORS.neutralGray }} className="text-[10px] font-bold uppercase tracking-[0.5em] mt-2 opacity-50">
          Live Checkout Pricing · Read Only
        </p>
      </div>

      {/* Read-only notice */}
      <div
        className="mb-8 rounded-2xl border p-4 flex items-start gap-3"
        style={{ backgroundColor: `${COLORS.primary}0D`, borderColor: `${COLORS.primary}33` }}
      >
        <Icon icon="solar:info-circle-bold-duotone" className="text-xl flex-shrink-0 mt-0.5" style={{ color: COLORS.primary }} />
        <p className="text-[12px] text-white/70 leading-relaxed">
          These are the <span className="text-white font-bold">live bonus tiers</span> the Stardust checkout awards —
          the exact pricing customers see. Purchases start at <span className="text-white font-bold">{formatGbp(tiers.min_usd)}</span> and
          top out at <span className="text-white font-bold">{formatGbp(tiers.max_usd)}</span> (Lifetime Access). Amounts between bands
          get that band's bonus. This view is read-only; tiers are set in code.
        </p>
      </div>

      {/* Bonus bands */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5 mb-6">
        {tiers.bands.map((b) => {
          const hasBonus = b.bonus_pct > 0;
          return (
            <div
              key={b.key}
              className="p-6 rounded-[24px] border relative overflow-hidden"
              style={{
                backgroundColor: COLORS.surface,
                borderColor: hasBonus ? `${COLORS.starGold}33` : "rgba(255,255,255,0.05)",
              }}
            >
              <div className="flex items-center justify-between mb-4">
                <Icon
                  icon={hasBonus ? "solar:stars-bold-duotone" : "solar:star-bold-duotone"}
                  className="text-3xl"
                  style={{ color: hasBonus ? COLORS.starGold : COLORS.primary }}
                />
                {hasBonus && (
                  <span
                    className="text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-full"
                    style={{ backgroundColor: `${COLORS.starGold}22`, color: COLORS.starGold, border: `1px solid ${COLORS.starGold}44` }}
                  >
                    +{Math.round(b.bonus_pct * 100)}% bonus
                  </span>
                )}
              </div>
              <div className="text-2xl font-black text-white mb-1">{b.name}</div>
              <div className="text-[11px] font-bold uppercase tracking-widest" style={{ color: COLORS.neutralGray }}>
                {range(b.min_usd, b.max_usd)}
              </div>
              <div className="mt-4 text-[12px] text-white/50">
                {hasBonus ? (
                  <>Spend {formatGbp(100)} → get <span className="text-white font-bold">{100 + Math.floor(100 * b.bonus_pct)}</span> Stardust</>
                ) : (
                  <>No bonus · {formatGbp(1)} = 1 Stardust</>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Lifetime */}
      <div
        className="p-6 rounded-[24px] border flex items-center gap-4"
        style={{ backgroundColor: COLORS.surface, borderColor: `${COLORS.primary}33` }}
      >
        <div
          className="w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0"
          style={{ backgroundColor: `${COLORS.primary}18`, border: `1px solid ${COLORS.primary}44` }}
        >
          <Icon icon="solar:crown-star-bold-duotone" className="text-3xl" style={{ color: COLORS.primary }} />
        </div>
        <div className="min-w-0">
          <div className="text-lg font-black text-white">Lifetime Access · {formatGbp(tiers.max_usd)}</div>
          <p className="text-[12px] text-white/50 mt-0.5">{tiers.lifetime_copy} Manually fulfilled — no points awarded.</p>
        </div>
      </div>
    </div>
  );
};

export default StardustTiers;
