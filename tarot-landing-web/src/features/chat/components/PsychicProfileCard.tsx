import { useState } from "react";
import { Icon } from "@iconify/react";
import { COLORS, TYPOGRAPHY } from "../../../theme";
import { formatPerMinuteGbp } from "../../../lib/currency";

interface Category {
  id: number;
  title: string;
}

interface PsychicProfileCardProps {
  name: string;
  avatarUrl?: string | null;
  isVerified?: boolean;
  isOnline?: boolean;
  bio?: string | null;
  categories?: Category[];
  pricePerSecond?: number | null;
}

const BIO_LIMIT = 180;

/**
 * The "who is my reader" card shown during an active chat — as a persistent
 * sidebar on desktop and a bottom sheet on mobile. Warm and minimalist: enough
 * to feel connected and confident (who, verified/online, what she reads on, the
 * rate) without a full biography. Session metrics live in the SessionBar, not here.
 */
export const PsychicProfileCard = ({
  name,
  avatarUrl,
  isVerified,
  isOnline,
  bio,
  categories,
  pricePerSecond,
}: PsychicProfileCardProps) => {
  const [expanded, setExpanded] = useState(false);
  const trimmedBio = (bio || "").trim();
  const isLong = trimmedBio.length > BIO_LIMIT;
  const shownBio =
    expanded || !isLong
      ? trimmedBio
      : trimmedBio.slice(0, BIO_LIMIT).trimEnd() + "…";
  const firstName = name.split(" ")[0] || name;

  return (
    <div
      className="flex flex-col gap-6"
      style={{ fontFamily: TYPOGRAPHY.fontFamily.body }}
    >
      {/* Who */}
      <div className="flex flex-col items-center text-center">
        <div className="relative mb-3">
          <div
            className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-3xl border-2"
            style={{ borderColor: `${COLORS.primary}44`, backgroundColor: `${COLORS.primary}14` }}
          >
            {avatarUrl ? (
              <img src={avatarUrl} alt={name} className="h-full w-full object-cover" />
            ) : (
              <Icon icon="ph:sparkle-fill" className="text-4xl" style={{ color: COLORS.primary }} />
            )}
          </div>
          {isVerified && (
            <div
              className="absolute -bottom-1.5 -right-1.5 flex h-8 w-8 items-center justify-center rounded-2xl text-white shadow-lg"
              style={{ backgroundColor: COLORS.primary }}
            >
              <Icon icon="solar:verified-check-bold" className="text-lg" />
            </div>
          )}
        </div>
        <h2
          className="text-xl font-bold text-white"
          style={{ fontFamily: TYPOGRAPHY.fontFamily.heading }}
        >
          {name}
        </h2>
        <div className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1">
          <span
            className="h-1.5 w-1.5 rounded-full"
            style={{ backgroundColor: isOnline ? "#4ade80" : "rgba(255,255,255,0.3)" }}
          />
          <span
            className="text-xs font-medium"
            style={{ color: isOnline ? "#4ade80" : "rgba(255,255,255,0.6)" }}
          >
            {isOnline ? "Online now" : "Offline"}
          </span>
        </div>
      </div>

      {/* A little about — trimmed, read-more */}
      {trimmedBio && (
        <div>
          <h4 className="mb-2 text-[11px] font-bold uppercase tracking-[0.16em] text-white/40">
            A little about {firstName}
          </h4>
          <p className="text-sm leading-relaxed text-white/70">
            {shownBio}
            {isLong && (
              <button
                onClick={() => setExpanded((e) => !e)}
                className="ml-1 font-semibold transition-opacity hover:opacity-80"
                style={{ color: COLORS.primary }}
              >
                {expanded ? "less" : "read more"}
              </button>
            )}
          </p>
        </div>
      )}

      {/* Reads on */}
      {categories && categories.length > 0 && (
        <div>
          <h4 className="mb-2.5 text-[11px] font-bold uppercase tracking-[0.16em] text-white/40">
            Reads on
          </h4>
          <div className="flex flex-wrap gap-2">
            {categories.map((c) => (
              <span
                key={c.id}
                className="rounded-xl border px-3 py-1.5 text-xs font-semibold text-white/85"
                style={{ borderColor: `${COLORS.primary}33`, backgroundColor: `${COLORS.primary}12` }}
              >
                {c.title}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Rate — calm, transparent */}
      {pricePerSecond ? (
        <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3">
          <span className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/40">
            Your rate
          </span>
          <span className="text-base font-bold tabular-nums text-white">
            {formatPerMinuteGbp(pricePerSecond * 60)}
            <span className="text-xs font-normal text-white/45">/min</span>
          </span>
        </div>
      ) : null}
    </div>
  );
};
