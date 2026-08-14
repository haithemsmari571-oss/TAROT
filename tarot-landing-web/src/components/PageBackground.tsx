import { useEffect, useState } from "react";

// Shared dimmed full-bleed page backdrop — the same technique used on the Glider
// pricing card and the Life Path & Zodiac reveal, generalized for whole pages.
//
// It renders a fixed, viewport-filling scene behind the page (z-0) so page
// content (kept at `relative z-10`) floats on top. Three intensity presets tune
// how much of the scene survives, by page job:
//   • immersive — landing/discovery moments; the scene is clearly visible.
//   • subtle    — semi-functional pages; atmospheric but recessed.
//   • faint     — dense/functional pages (browse, chat, lists); dimmed so hard
//                 it reads as a faint texture and never competes with content.
//
// Pass an array + `rotate` to slowly crossfade through several scenes (used on
// the reveal flow so it feels alive).

type Variant = "immersive" | "subtle" | "soft" | "faint" | "glass";

// Scrims are built on the app's base dark (#0D1117) so the fade blends into the
// page rather than a different black.
const PRESETS: Record<Variant, { filter: string; scrim: string }> = {
  immersive: {
    filter: "brightness(0.6) saturate(1.08)",
    scrim:
      "linear-gradient(180deg, rgba(13,17,23,0.55) 0%, rgba(13,17,23,0.34) 38%, rgba(13,17,23,0.62) 100%)",
  },
  subtle: {
    filter: "brightness(0.42) saturate(1.02)",
    scrim:
      "linear-gradient(180deg, rgba(13,17,23,0.70) 0%, rgba(13,17,23,0.58) 42%, rgba(13,17,23,0.76) 100%)",
  },
  // Dense pages where the scene should still read clearly (e.g. Psychics browse):
  // noticeably lighter than `faint`, no blur, but enough veil to keep cards legible.
  soft: {
    filter: "brightness(0.52) saturate(1.05)",
    scrim:
      "linear-gradient(180deg, rgba(13,17,23,0.6) 0%, rgba(13,17,23,0.46) 45%, rgba(13,17,23,0.64) 100%)",
  },
  faint: {
    filter: "brightness(0.3) saturate(0.9) blur(1.5px)",
    scrim:
      "linear-gradient(180deg, rgba(13,17,23,0.86) 0%, rgba(13,17,23,0.8) 50%, rgba(13,17,23,0.9) 100%)",
  },
  // Glass design system pages: the artwork stays vivid (no dimming filter) and
  // the mood tint comes from the token sheet, so it flips with the candlelight/
  // daylight theme. Content legibility is carried by glass surfaces, not by
  // washing the scene out.
  glass: {
    filter: "saturate(1.05)",
    scrim: "var(--gl-tint)",
  },
};

interface PageBackgroundProps {
  /** One imported image URL, or several to crossfade through when `rotate`. */
  images: string | string[];
  variant?: Variant;
  /** Slowly crossfade through `images` (needs 2+). */
  rotate?: boolean;
  /** Rotation cadence in ms. */
  intervalMs?: number;
  /** Optional colour-mood tint laid over the scene (soft-light). */
  tint?: string;
  tintOpacity?: number;
}

export default function PageBackground({
  images,
  variant = "immersive",
  rotate = false,
  intervalMs = 9000,
  tint,
  tintOpacity = 0.16,
}: PageBackgroundProps) {
  const list = Array.isArray(images) ? images : [images];
  const [active, setActive] = useState(0);
  const preset = PRESETS[variant];

  useEffect(() => {
    if (!rotate || list.length < 2) return;
    const id = setInterval(
      () => setActive((i) => (i + 1) % list.length),
      intervalMs,
    );
    return () => clearInterval(id);
  }, [rotate, list.length, intervalMs]);

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 overflow-hidden"
      style={{ zIndex: 0 }}
    >
      {list.map((src, i) => (
        <div
          key={src}
          className="absolute inset-0 transition-opacity duration-[2000ms] ease-in-out"
          style={{ opacity: i === active ? 1 : 0 }}
        >
          <img
            src={src}
            alt=""
            className="h-full w-full object-cover"
            style={{ filter: preset.filter }}
          />
        </div>
      ))}
      <div
        className="absolute inset-0"
        style={{ background: preset.scrim, transition: "background 0.6s ease" }}
      />
      {tint && (
        <div
          className="absolute inset-0"
          style={{
            backgroundColor: tint,
            opacity: tintOpacity,
            mixBlendMode: "soft-light",
          }}
        />
      )}
    </div>
  );
}
