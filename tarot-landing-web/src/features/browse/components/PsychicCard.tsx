import { useState } from "react";
import { Icon } from "@iconify/react";
import { TYPOGRAPHY } from "../../../theme";
import type { Psychic } from "../types/psychic.types";
import {
  DISPLAY_RATINGS,
  getHaloColor,
  getTier,
  hexToRgb,
} from "../../../lib/psychicDisplay";
import { formatPerMinuteGbp } from "../../../lib/currency";

const BG = "#0D1117";

interface PsychicCardProps {
  psychic: Psychic;
  onClick: () => void;
}

const PsychicCard = ({ psychic, onClick }: PsychicCardProps) => {
  const [hovered, setHovered] = useState(false);
  const [btnHover, setBtnHover] = useState(false);

  const halo = getHaloColor(psychic.categories);
  const haloRgb = hexToRgb(halo);
  const perMinute = (psychic.price_per_second || 0) * 60;
  const tier = getTier(perMinute);
  const rating = DISPLAY_RATINGS[psychic.id];

  const categories = psychic.categories ?? [];
  const shownTags = categories.slice(0, 3);
  const extraTags = categories.length - shownTags.length;

  const filledStars = rating != null ? Math.round(rating) : 0;

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "flex",
        flexDirection: "column",
        background: BG,
        borderRadius: 14,
        border: `1px solid rgba(${haloRgb}, ${hovered ? 0.6 : 0.35})`,
        boxShadow: hovered
          ? `0 0 40px 6px rgba(${haloRgb}, 0.3), 0 8px 32px rgba(0,0,0,0.4)`
          : `0 0 20px 2px rgba(${haloRgb}, 0.15)`,
        transform: hovered ? "translateY(-3px)" : "translateY(0)",
        transition: "all 0.35s cubic-bezier(0.4, 0, 0.2, 1)",
        cursor: "pointer",
        overflow: "hidden",
      }}
    >
      {/* PHOTO */}
      <div
        style={{
          position: "relative",
          width: "100%",
          aspectRatio: "3 / 4",
          overflow: "hidden",
          borderRadius: "12px 12px 0 0",
        }}
      >
        {psychic.profile_picture_url ? (
          <img
            src={psychic.profile_picture_url}
            alt={psychic.username}
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
              objectPosition: "center top",
            }}
          />
        ) : (
          <div
            style={{
              width: "100%",
              height: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: `linear-gradient(135deg, #161B22, #21262D)`,
            }}
          >
            <Icon
              icon="ph:user"
              style={{ fontSize: 64, color: `rgba(${haloRgb}, 0.4)` }}
            />
          </div>
        )}

        {/* gradient overlay */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: `linear-gradient(to bottom, transparent 50%, ${BG} 100%)`,
            pointerEvents: "none",
          }}
        />

        {/* ONLINE indicator (top-left) */}
        {psychic.is_online && (
          <div
            style={{
              position: "absolute",
              top: 10,
              left: 10,
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: "#22c55e",
                animation: "psychicPulse 2s ease-in-out infinite",
                display: "inline-block",
              }}
            />
            <span
              style={{
                fontSize: 10,
                letterSpacing: "0.1em",
                color: "#22c55e",
                fontWeight: 700,
              }}
            >
              ONLINE
            </span>
          </div>
        )}

        {/* TIER badge (top-right) */}
        <div
          style={{
            position: "absolute",
            top: 10,
            right: 10,
            background: tier.gradient,
            padding: "3px 10px",
            borderRadius: 20,
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: "0.08em",
            color: BG,
          }}
        >
          {tier.label}
        </div>
      </div>

      {/* BODY */}
      <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
        {/* Name */}
        <h3
          style={{
            fontFamily: TYPOGRAPHY.fontFamily.heading,
            fontSize: 18,
            fontWeight: 700,
            color: "#E6EDF3",
            textTransform: "uppercase",
            letterSpacing: "0.05em",
            margin: "16px 16px 6px",
          }}
        >
          {psychic.username}
        </h3>

        {/* Star rating */}
        {rating != null && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              margin: "0 16px 10px",
            }}
          >
            <span style={{ fontSize: 13, letterSpacing: "1px" }}>
              {[0, 1, 2, 3, 4].map((i) => (
                <span
                  key={i}
                  style={{
                    color:
                      i < filledStars ? "#F2AE40" : "rgba(255,255,255,0.2)",
                  }}
                >
                  {i < filledStars ? "★" : "☆"}
                </span>
              ))}
            </span>
            <span style={{ fontSize: 12, color: "rgba(255,255,255,0.6)" }}>
              {rating.toFixed(1)}
            </span>
          </div>
        )}

        {/* Category tags */}
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 6,
            margin: "0 16px 10px",
          }}
        >
          {shownTags.map((cat, i) => {
            const isPrimary = i === 0;
            return (
              <span
                key={cat.id}
                style={{
                  fontSize: 10,
                  padding: "3px 8px",
                  borderRadius: 20,
                  letterSpacing: "0.05em",
                  textTransform: "uppercase",
                  border: isPrimary
                    ? `1px solid ${halo}`
                    : "1px solid rgba(255,255,255,0.12)",
                  color: isPrimary ? halo : "rgba(255,255,255,0.5)",
                  background: isPrimary ? `rgba(${haloRgb}, 0.08)` : "transparent",
                }}
              >
                {cat.title}
              </span>
            );
          })}
          {extraTags > 0 && (
            <span
              style={{
                fontSize: 10,
                padding: "3px 8px",
                borderRadius: 20,
                letterSpacing: "0.05em",
                textTransform: "uppercase",
                border: "1px solid rgba(255,255,255,0.12)",
                color: "rgba(255,255,255,0.5)",
              }}
            >
              +{extraTags} more
            </span>
          )}
        </div>

        {/* Bio */}
        <p
          style={{
            fontSize: 12,
            lineHeight: 1.6,
            color: "rgba(255,255,255,0.55)",
            fontStyle: "italic",
            margin: "0 16px 14px",
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
          }}
        >
          {psychic.bio}
        </p>

        {/* Bottom row: price + button */}
        <div
          style={{
            marginTop: "auto",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "12px 16px",
            borderTop: "1px solid rgba(255,255,255,0.06)",
          }}
        >
          <div style={{ display: "flex", alignItems: "baseline", gap: 3 }}>
            <span style={{ fontSize: 18, fontWeight: 700, color: tier.color }}>
              {formatPerMinuteGbp(perMinute)}
            </span>
            <span style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>
              /min
            </span>
          </div>
          <button
            onMouseEnter={() => setBtnHover(true)}
            onMouseLeave={() => setBtnHover(false)}
            style={{
              background: btnHover ? "#9B73E2" : "#8A63D2",
              color: "white",
              padding: "8px 16px",
              borderRadius: 8,
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              border: "none",
              cursor: "pointer",
              transition: "background 0.2s ease",
            }}
          >
            Start &rarr;
          </button>
        </div>
      </div>
    </div>
  );
};

export default PsychicCard;
