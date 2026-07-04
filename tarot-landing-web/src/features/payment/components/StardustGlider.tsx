import { useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { Icon } from "@iconify/react";
import { COLORS, TYPOGRAPHY } from "../../../theme";
import {
  STARDUST_MIN_USD,
  STARDUST_MAX_USD,
  STARDUST_TIERS,
  calculateStardustQuote,
} from "../stardustTiers";

// Brand palette. The card/page background stays constant near-black; the colour
// that sweeps with the slider lives only in the beacon glow, track fill and
// thumb glow — never the page background.
const LAVENDER = "#D2B9FF";
const GOLD = "#F2AE40";
const CARD_DARK = "#0B0B0B";

// Distinct thin-line icon per tier (Solar -linear, matching the header wand).
const TIER_ICONS: Record<string, string> = {
  base: "ph:sparkle",
  whisper: "solar:moon-linear",
  revelation: "solar:eye-linear",
  devotion: "solar:fire-linear",
  lifetime: "solar:crown-star-bold", // kept as-is
};

// Optional per-tier background scenes (optimized WebP in assets/tiers/). Loaded
// build-safe via glob so a missing file simply yields no image (the card stays
// plain dark) — the build never breaks before the art is dropped in.
const TIER_IMAGE_KEYS = ["base", "whisper", "revelation", "devotion", "lifetime"] as const;
const tierImageModules = import.meta.glob("../../../assets/tiers/*.webp", {
  eager: true,
  import: "default",
}) as Record<string, string>;
const tierImage = (key: string): string | undefined => {
  const hit = Object.entries(tierImageModules).find(([path]) =>
    path.endsWith(`/${key}.webp`),
  );
  return hit?.[1];
};

// ── Continuous "beacon" colour sweep ────────────────────────────────────────
// Colour anchors by dollar amount. We interpolate linearly between them so the
// hue sweeps smoothly rather than snapping into four flat states. Lifetime gold
// is handled separately as its own moment.
type Beacon = { color: string; intensity: number; radius: number };

const BEACON_STOPS: { at: number; c: [number, number, number]; i: number; r: number }[] = [
  { at: 15, c: [210, 185, 255], i: 0.12, r: 1.0 }, // #D2B9FF pale lavender
  { at: 100, c: [201, 166, 255], i: 0.24, r: 1.16 }, // #C9A6FF deeper lavender
  { at: 250, c: [255, 110, 199], i: 0.36, r: 1.36 }, // #FF6EC7 vivid magenta
  { at: 450, c: [255, 107, 92], i: 0.46, r: 1.54 }, // #FF6B5C warm coral-rose
  { at: 999, c: [255, 107, 92], i: 0.5, r: 1.6 }, // hold coral through Devotion
];

const GOLD_BEACON: Beacon = { color: GOLD, intensity: 0.62, radius: 1.9 };

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const toHex = (c: number[]) =>
  "#" + c.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");

// Pick the button text colour by WCAG contrast, not by eye — guarantees a
// readable label on every colour the beacon sweeps through.
const hexToRgb = (hex: string): [number, number, number] => {
  const h = hex.replace("#", "");
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
};
const srgbToLinear = (v: number) => {
  const s = v / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
};
const relativeLuminance = ([r, g, b]: [number, number, number]) =>
  0.2126 * srgbToLinear(r) + 0.7152 * srgbToLinear(g) + 0.0722 * srgbToLinear(b);
const contrastRatio = (l1: number, l2: number) =>
  (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
// Returns near-black or white — whichever has the higher contrast on the bg.
const readableTextOn = (hex: string) => {
  const l = relativeLuminance(hexToRgb(hex));
  return contrastRatio(l, 0) >= contrastRatio(l, 1) ? CARD_DARK : "#ffffff";
};

const beaconFor = (amount: number): Beacon => {
  if (amount <= BEACON_STOPS[0].at) {
    const s = BEACON_STOPS[0];
    return { color: toHex(s.c), intensity: s.i, radius: s.r };
  }
  for (let k = 0; k < BEACON_STOPS.length - 1; k++) {
    const a = BEACON_STOPS[k];
    const b = BEACON_STOPS[k + 1];
    if (amount >= a.at && amount <= b.at) {
      const t = (amount - a.at) / (b.at - a.at);
      return {
        color: toHex([
          lerp(a.c[0], b.c[0], t),
          lerp(a.c[1], b.c[1], t),
          lerp(a.c[2], b.c[2], t),
        ]),
        intensity: lerp(a.i, b.i, t),
        radius: lerp(a.r, b.r, t),
      };
    }
  }
  const s = BEACON_STOPS[BEACON_STOPS.length - 1];
  return { color: toHex(s.c), intensity: s.i, radius: s.r };
};

// Scrim treatments: the card-scoped one is diagonal (heavy behind the heading,
// dipping over the mid-card); the full-bleed one is a vertical vignette (darker
// top/bottom for text zones, scene visible through the middle).
const TIER_SCRIM_CARD = `linear-gradient(125deg, ${CARD_DARK}e6 0%, ${CARD_DARK}80 40%, ${CARD_DARK}66 60%, ${CARD_DARK}a6 100%)`;
const TIER_SCRIM_FULL = `linear-gradient(180deg, ${CARD_DARK}8c 0%, ${CARD_DARK}59 38%, ${CARD_DARK}8c 100%)`;

// Crossfading tier scenes + legibility scrim + beacon colour tint. Shared by the
// full-bleed page background and the card-scoped (embedded) variant so the fade
// logic lives in one place. The beacon tint (soft-light) carries the per-tier
// colour mood now that the separate flat glow is gone.
const TierScenes = ({
  activeImageKey,
  beacon,
  fullBleed = false,
}: {
  activeImageKey: string | null;
  beacon: Beacon;
  fullBleed?: boolean;
}) => (
  <>
    {TIER_IMAGE_KEYS.map((key) => {
      const src = tierImage(key);
      if (!src) return null;
      return (
        <div
          key={key}
          aria-hidden
          className="pointer-events-none absolute inset-0 z-0 transition-opacity duration-700 ease-out"
          style={{ opacity: activeImageKey === key ? 1 : 0 }}
        >
          <img
            src={src}
            alt=""
            className="h-full w-full object-cover"
            style={{ filter: `brightness(${fullBleed ? 0.82 : 0.8}) saturate(1.08)` }}
          />
          <div
            className="absolute inset-0"
            style={{ background: fullBleed ? TIER_SCRIM_FULL : TIER_SCRIM_CARD }}
          />
        </div>
      );
    })}
    {/* Only tint when a scene is showing — at base (no image) the backdrop must
        stay plain dark, not a full-screen colour wash over the black body. */}
    {activeImageKey && (
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 transition-colors duration-300"
        style={{
          backgroundColor: beacon.color,
          opacity: fullBleed ? 0.42 : 0.3,
          mixBlendMode: "soft-light",
        }}
      />
    )}
  </>
);

interface StardustGliderProps {
  loading?: boolean;
  onPurchase: (amountUsd: number) => void | Promise<void>;
  /**
   * When true the dimmed tier scene fills the whole viewport (fixed, crossfading)
   * and the card floats on top as a glass panel — used for the standalone glider
   * experience. Default false keeps the scene scoped to the card so the component
   * can sit inside a scrolling page (e.g. Billing) without hijacking its backdrop.
   */
  fullBleed?: boolean;
}

const StardustGlider = ({
  loading = false,
  onPurchase,
  fullBleed = false,
}: StardustGliderProps) => {
  const [amount, setAmount] = useState<number>(50);

  const quote = useMemo(() => calculateStardustQuote(amount), [amount]);
  const isLifetime = quote.isLifetime;

  const pct =
    ((amount - STARDUST_MIN_USD) / (STARDUST_MAX_USD - STARDUST_MIN_USD)) * 100;

  // The single source of truth for the live colour. Lifetime keeps the gold moment.
  const beacon = isLifetime ? GOLD_BEACON : beaconFor(amount);
  const chipIcon = isLifetime
    ? TIER_ICONS.lifetime
    : TIER_ICONS[quote.tier] ?? "ph:sparkle";

  // Which tier scene is showing. Every band now has a scene, including the
  // entry ("base") state — the pale moonlit balcony for "just browsing".
  const activeImageKey = quote.tier;

  // Filled portion sweeps lavender → current beacon colour; unfilled is a faint track.
  const trackBackground = `linear-gradient(90deg, ${LAVENDER}, var(--beacon)) 0 / ${pct}% 100% no-repeat, rgba(255,255,255,0.08)`;

  // --beacon carries the live colour to the track fill, thumb glow and stage
  // glow. JS recomputes it per $1 input step (no rAF loop), so the drag sweep is
  // continuous on its own; the consuming elements add short transitions to ease
  // larger jumps. (A CSS transition on the variable itself is intentionally
  // avoided — transitioning a registered custom property stalls in Chrome.)
  const wrapperStyle = { "--beacon": beacon.color } as CSSProperties;

  return (
    <div className="relative" style={wrapperStyle}>
      {/* Scoped range-input styling + registered --beacon for smooth colour tweening. */}
      <style>{`
        .stardust-range { -webkit-appearance: none; appearance: none; width: 100%; height: 10px; border-radius: 999px; outline: none; cursor: pointer; }
        .stardust-range::-webkit-slider-thumb {
          -webkit-appearance: none; appearance: none;
          width: 30px; height: 30px; border-radius: 50%;
          background: var(--beacon);
          border: 3px solid rgba(255,255,255,0.28);
          box-shadow: 0 0 0 4px color-mix(in srgb, var(--beacon) 26%, transparent),
                      0 0 22px color-mix(in srgb, var(--beacon) 80%, transparent),
                      0 4px 12px rgba(0,0,0,0.5);
          transition: transform 0.1s ease;
        }
        .stardust-range::-webkit-slider-thumb:hover { transform: scale(1.08); }
        .stardust-range:active::-webkit-slider-thumb {
          box-shadow: 0 0 0 6px color-mix(in srgb, var(--beacon) 30%, transparent),
                      0 0 30px color-mix(in srgb, var(--beacon) 90%, transparent),
                      0 4px 12px rgba(0,0,0,0.5);
        }
        .stardust-range::-moz-range-thumb {
          width: 30px; height: 30px; border-radius: 50%;
          background: var(--beacon); border: 3px solid rgba(255,255,255,0.28);
          box-shadow: 0 0 0 4px color-mix(in srgb, var(--beacon) 26%, transparent),
                      0 0 22px color-mix(in srgb, var(--beacon) 80%, transparent),
                      0 4px 12px rgba(0,0,0,0.5);
        }
      `}</style>

      {/* ── Full-bleed tier scene: fills the viewport, crossfades per tier. The
             card floats on top; the beacon tint replaces the old flat glow. ── */}
      {fullBleed && (
        <div
          aria-hidden
          className="pointer-events-none fixed inset-0 overflow-hidden"
          style={{ zIndex: 0 }}
        >
          <TierScenes
            activeImageKey={activeImageKey}
            beacon={beacon}
            fullBleed
          />
        </div>
      )}

      <div
        className="relative z-10 overflow-hidden rounded-[28px] border p-6 sm:p-8 md:p-10 backdrop-blur-2xl transition-all duration-500"
        style={{
          // Translucent glass so the full-bleed scene shows through the blur; the
          // embedded (card-scoped) variant renders its own scene layer below.
          background: isLifetime
            ? `linear-gradient(160deg, rgba(22,27,34,0.56) 0%, rgba(36,26,4,0.5) 60%, rgba(11,11,11,0.62) 100%)`
            : `linear-gradient(160deg, rgba(22,27,34,0.52) 0%, rgba(11,11,11,0.62) 100%)`,
          borderColor: isLifetime ? `${GOLD}88` : `${beacon.color}44`,
          boxShadow: isLifetime
            ? `0 0 60px ${GOLD}3a, 0 24px 80px rgba(0,0,0,0.55)`
            : `0 24px 80px rgba(0,0,0,0.5), 0 0 44px ${beacon.color}22`,
          fontFamily: TYPOGRAPHY.fontFamily.body,
        }}
      >
        {/* Card-scoped scene (embedded mode only — full-bleed lives behind). */}
        {!fullBleed && (
          <TierScenes activeImageKey={activeImageKey} beacon={beacon} />
        )}

        <div className="relative z-10">
        {/* Label */}
        <div className="mb-6 flex w-fit items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5">
          <Icon
            icon="solar:magic-stick-3-bold-duotone"
            style={{ color: isLifetime ? GOLD : LAVENDER }}
            className="text-base"
          />
          <span
            className="text-[9px] font-black uppercase tracking-[0.24em] text-white/50"
            style={{ fontFamily: TYPOGRAPHY.fontFamily.body }}
          >
            Stardust Tiers
          </span>
        </div>

        <h2
          className="text-3xl font-black uppercase leading-none sm:text-4xl"
          style={{
            fontFamily: TYPOGRAPHY.fontFamily.heading,
            color: COLORS.neutralWhite,
          }}
        >
          Name your{" "}
          <span
            style={{
              backgroundImage: `linear-gradient(135deg, ${LAVENDER} 0%, ${GOLD} 100%)`,
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
            }}
          >
            offering
          </span>
        </h2>
        <p className="mt-2 max-w-xl text-sm leading-6 text-white/45">
          Slide to choose any amount from £{STARDUST_MIN_USD} to £{STARDUST_MAX_USD}. Larger
          offerings unlock bigger bonus Stardust.
        </p>

        {/* ── Live display ── */}
        <div className="mt-8 grid grid-cols-1 gap-5 md:grid-cols-[1.2fr_1fr] md:items-center">
          {/* Left: amount + tier */}
          <div>
            <div className="flex items-end gap-2">
              <span
                className="text-6xl font-black leading-none sm:text-7xl"
                style={{
                  fontFamily: TYPOGRAPHY.fontFamily.heading,
                  backgroundImage: isLifetime
                    ? `linear-gradient(135deg, ${GOLD} 0%, #FFE7A8 100%)`
                    : `linear-gradient(135deg, #ffffff 0%, ${LAVENDER} 100%)`,
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  backgroundClip: "text",
                }}
              >
                £{amount}
              </span>
              <span className="pb-2 text-xs font-black uppercase tracking-[0.22em] text-white/40">
                GBP
              </span>
            </div>

            <div
              className="mt-3 inline-flex items-center gap-2 rounded-full border px-3 py-1 transition-colors duration-200"
              style={{
                borderColor: `${beacon.color}55`,
                backgroundColor: `${beacon.color}12`,
              }}
            >
              <Icon
                icon={chipIcon}
                style={{ color: beacon.color }}
                className="text-sm"
              />
              <span
                className="text-[10px] font-black uppercase tracking-[0.2em]"
                style={{ color: beacon.color }}
              >
                {isLifetime
                  ? "Lifetime Access"
                  : quote.bonusPct > 0
                    ? `${quote.tierName} · +${Math.round(quote.bonusPct * 100)}% bonus`
                    : "No bonus"}
              </span>
            </div>
          </div>

          {/* Right: points / lifetime copy */}
          <div
            className="rounded-2xl border p-5 transition-all duration-500"
            style={{
              borderColor: isLifetime ? `${GOLD}44` : "rgba(255,255,255,0.10)",
              background: isLifetime ? `${GOLD}0d` : "rgba(255,255,255,0.035)",
            }}
          >
            {isLifetime ? (
              <div>
                <div className="text-[9px] font-black uppercase tracking-[0.22em] text-white/40">
                  Unlocked
                </div>
                <p
                  className="mt-2 text-sm font-bold leading-6"
                  style={{
                    backgroundImage: `linear-gradient(135deg, ${GOLD} 0%, #FFE7A8 100%)`,
                    WebkitBackgroundClip: "text",
                    WebkitTextFillColor: "transparent",
                    backgroundClip: "text",
                  }}
                >
                  Lifetime Access Unlocked — 1 hour of reading time, daily, for
                  life.
                </p>
              </div>
            ) : (
              <div>
                <div className="text-[9px] font-black uppercase tracking-[0.22em] text-white/40">
                  You receive
                </div>
                <div className="mt-1 flex items-baseline gap-2">
                  <span
                    className="text-4xl font-black sm:text-5xl transition-colors duration-200"
                    style={{ color: beacon.color }}
                  >
                    {quote.totalPoints.toLocaleString()}
                  </span>
                  <span className="text-xs font-black uppercase tracking-[0.2em] text-white/40">
                    Stardust
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[10px] font-bold uppercase tracking-wider text-white/45">
                  <span>{quote.basePoints.toLocaleString()} base</span>
                  {quote.bonusPoints > 0 && (
                    <span style={{ color: beacon.color }}>
                      +{quote.bonusPoints.toLocaleString()} bonus
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── Slider ── */}
        <div className="mt-9">
          <input
            type="range"
            min={STARDUST_MIN_USD}
            max={STARDUST_MAX_USD}
            step={1}
            value={amount}
            onChange={(e) => setAmount(Number(e.target.value))}
            className="stardust-range"
            style={{ background: trackBackground }}
            aria-label="Stardust offering amount in US dollars"
          />

          {/* Tier legend / markers */}
          <div className="mt-5 flex flex-wrap items-center gap-2">
            {STARDUST_TIERS.map((tier) => {
              const active = amount >= tier.minUsd && amount <= tier.maxUsd;
              return (
                <div
                  key={tier.key}
                  className="flex items-center gap-1.5 rounded-full border px-3 py-1 text-[9px] font-black uppercase tracking-[0.18em] transition-all duration-200"
                  style={{
                    borderColor: active ? `${beacon.color}88` : "rgba(255,255,255,0.08)",
                    backgroundColor: active ? `${beacon.color}18` : "transparent",
                    color: active ? beacon.color : "rgba(255,255,255,0.4)",
                  }}
                >
                  <Icon icon={TIER_ICONS[tier.key]} className="text-sm" />
                  {tier.name} +{Math.round(tier.bonusPct * 100)}%
                </div>
              );
            })}
            <div
              className="flex items-center gap-1.5 rounded-full border px-3 py-1 text-[9px] font-black uppercase tracking-[0.18em] transition-all duration-200"
              style={{
                borderColor: isLifetime ? `${GOLD}88` : "rgba(255,255,255,0.08)",
                backgroundColor: isLifetime ? `${GOLD}18` : "transparent",
                color: isLifetime ? GOLD : "rgba(255,255,255,0.4)",
              }}
            >
              <Icon icon={TIER_ICONS.lifetime} className="text-sm" />
              Lifetime £{STARDUST_MAX_USD}
            </div>
          </div>
        </div>

        {/* ── Purchase ── */}
        <button
          onClick={() => onPurchase(amount)}
          disabled={loading}
          className="group relative mt-8 w-full overflow-hidden rounded-2xl px-6 py-4 text-[11px] font-black uppercase tracking-widest transition-transform hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:scale-100"
          style={{
            backgroundColor: beacon.color,
            color: readableTextOn(beacon.color),
            boxShadow: `0 10px ${isLifetime ? 40 : 30}px ${beacon.color}${isLifetime ? "66" : "40"}`,
          }}
        >
          <span className="relative z-10 flex items-center justify-center gap-2">
            {loading ? (
              <>
                <Icon icon="svg-spinners:3-dots-fade" className="text-base" />
                Processing…
              </>
            ) : isLifetime ? (
              <>
                <Icon icon="solar:crown-star-bold" className="text-base" />
                Unlock Lifetime Access · £{amount}
              </>
            ) : (
              <>Buy {quote.totalPoints.toLocaleString()} Stardust · £{amount}</>
            )}
          </span>
        </button>

        <p className="mt-3 text-center text-[10px] font-bold uppercase tracking-wider text-white/30">
          Secure Stripe checkout · GBP
        </p>
        </div>
      </div>
    </div>
  );
};

export default StardustGlider;
