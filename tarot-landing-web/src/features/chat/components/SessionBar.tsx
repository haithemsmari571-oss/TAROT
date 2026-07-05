import { Icon } from "@iconify/react";
import { COLORS, TYPOGRAPHY } from "../../../theme";

interface SessionBarProps {
  /** Elapsed reading time (seconds) — shown as a small caption, not a headline. */
  elapsedSeconds: number;
  /** Remaining time (seconds); null while loading. Drives the calm colour ramp. */
  remainingSeconds: number | null;
  /** Whole minutes of reading remaining (per-minute prepaid model) — the headline. */
  minutesLeft: number | null;
  /** Stardust remaining (live balance); null while loading. */
  stardust: number | null;
  isPaused: boolean;
  isConnected: boolean;
  /** Tapping the Stardust readout tops up (opens the glider). */
  onTopUp: () => void;
}

const fmt = (s: number | null | undefined) => {
  if (s == null || isNaN(s)) return "—";
  const t = Math.max(0, Math.floor(s));
  return `${Math.floor(t / 60)}:${(t % 60).toString().padStart(2, "0")}`;
};

// Calm, warm ramp for Time Left: white → gold (≤5 min) → amber (≤1 min). No red.
const GOLD = COLORS.starGold;
const AMBER = "#EE8A5E";

/**
 * The active-reading status bar. Mobile-first: the two readouts that matter
 * emotionally — Time Left and Stardust — are the primary elements; elapsed time
 * is demoted to a caption. The Stardust readout is a touch target that tops up.
 * Colours stay calm (amber, never alarm-red) so a low balance reassures rather
 * than panics.
 */
export const SessionBar = ({
  elapsedSeconds,
  remainingSeconds,
  minutesLeft,
  stardust,
  isPaused,
  isConnected,
  onTopUp,
}: SessionBarProps) => {
  const low = remainingSeconds != null && remainingSeconds <= 300;
  const critical = remainingSeconds != null && remainingSeconds <= 60;
  const timeColor = isPaused
    ? COLORS.neutralWhite
    : critical
      ? AMBER
      : low
        ? GOLD
        : COLORS.neutralWhite;
  // Per-minute prepaid model: show whole minutes remaining ("2 min").
  const timeValue = isPaused
    ? "Paused"
    : minutesLeft == null
      ? "—"
      : `${Math.max(0, minutesLeft)} min`;

  return (
    <div
      className="px-3 sm:px-5 py-3 border-b border-white/5"
      style={{ backgroundColor: `${COLORS.surface}55`, fontFamily: TYPOGRAPHY.fontFamily.body }}
    >
      <div className="flex items-stretch gap-2.5">
        {/* Time Left — primary */}
        <div
          className="flex-1 rounded-2xl border px-3.5 py-2.5 transition-colors duration-300"
          style={{
            borderColor: isPaused ? "rgba(255,255,255,0.10)" : `${timeColor}44`,
            backgroundColor: isPaused ? "rgba(255,255,255,0.04)" : `${timeColor}12`,
          }}
        >
          <div
            className="text-[10px] font-bold uppercase tracking-[0.16em]"
            style={{ color: isPaused ? "rgba(255,255,255,0.45)" : timeColor }}
          >
            Time Left
          </div>
          <div
            className="mt-0.5 text-2xl font-bold tabular-nums leading-none"
            style={{ fontFamily: TYPOGRAPHY.fontFamily.heading, color: timeColor }}
          >
            {timeValue}
          </div>
        </div>

        {/* Stardust — primary + tap to top up */}
        <button
          type="button"
          onClick={onTopUp}
          aria-label="Add Stardust"
          className="flex-1 rounded-2xl border px-3.5 py-2.5 text-left transition-transform active:scale-[0.99]"
          style={{ borderColor: `${GOLD}33`, backgroundColor: `${GOLD}10` }}
        >
          <div className="flex items-center justify-between">
            <span
              className="text-[10px] font-bold uppercase tracking-[0.16em]"
              style={{ color: GOLD }}
            >
              Stardust
            </span>
            <span
              className="flex h-5 w-5 items-center justify-center rounded-full"
              style={{ backgroundColor: `${GOLD}22`, color: GOLD }}
            >
              <Icon icon="ph:plus-bold" className="text-[11px]" />
            </span>
          </div>
          <div
            className="mt-0.5 flex items-center gap-1 text-2xl font-bold tabular-nums leading-none"
            style={{ fontFamily: TYPOGRAPHY.fontFamily.heading, color: GOLD }}
          >
            <Icon icon="ph:sparkle-fill" className="text-sm" />
            {stardust == null ? "—" : stardust.toLocaleString()}
          </div>
        </button>
      </div>

      {/* Footer: connection (dot always paired with a label) + elapsed caption */}
      <div className="mt-2 flex items-center justify-center gap-2 text-[11px]">
        <span
          className="h-1.5 w-1.5 rounded-full"
          style={{ backgroundColor: isConnected ? "#4ade80" : GOLD }}
        />
        <span
          className="font-semibold uppercase tracking-wider"
          style={{ color: isConnected ? "#4ade80" : GOLD }}
        >
          {isConnected ? "Connected" : "Reconnecting…"}
        </span>
        <span className="text-white/25">·</span>
        <span className="tabular-nums text-white/40">{fmt(elapsedSeconds)} elapsed</span>
      </div>
    </div>
  );
};
