/* The hold panel's amounts — one source, shared by the live room (HallRoom)
   and the design harness (Hall preview).

   Every number and word here comes from stardustTiers.ts, the module the
   /billing glider reads: the presets, the minimum they respect, the Stardust
   received and the bonus tier names and percentages are all computed by
   calculateStardustQuote — never re-derived, never copied across. Duplicated
   numbers have cost real money five separate times in this codebase.

   startHall's paintAmounts appends the minutes each amount buys (at the
   reader's real rate) after the Stardust figure, reading it from data-star so
   the two writers can never clobber each other. */
import {
  STARDUST_HOLD_PRESETS,
  calculateStardustQuote,
} from "@/features/payment/stardustTiers";

/* `id` defaults to the hold panel's #amts. The reflect panel renders the SAME
   component under #rfamts, so two panels can share one DOM without a
   duplicate id — startHall binds both containers to the same handlers. */
export default function HoldAmounts({ id = "amts" }: { id?: string } = {}) {
  return (
    <div className="amts" id={id}>
      {STARDUST_HOLD_PRESETS.map((a, i) => {
        const q = calculateStardustQuote(a);
        return (
          <button
            key={a}
            type="button"
            className="pill amt"
            data-amt={a}
            /* data-default survives paintAmounts (which owns aria-pressed), so
               startHall can adopt the chosen amount from the markup itself */
            data-default={i === 1 ? "true" : undefined}
            aria-pressed={i === 1 ? "true" : "false"}
          >
            {/* the bonus, in the glider's own words ("Whisper +25%") — and no
                badge at all when the amount carries none */}
            {q.bonusPct > 0 && (
              <span className="tag">
                {q.tierName} +{Math.round(q.bonusPct * 100)}%
              </span>
            )}
            <b>£{q.amountUsd}</b>
            {/* the unit may wrap under its number on a narrow pill; the minutes token
                startHall appends stays whole (its own no-break space) */}
            <i data-star={`${q.totalPoints.toLocaleString()} stardust`}></i>
          </button>
        );
      })}
    </div>
  );
}
