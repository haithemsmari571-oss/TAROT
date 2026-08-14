import { Icon } from "@iconify/react";
import type { Psychic } from "../types/psychic.types";
import { DISPLAY_RATINGS, getTier } from "../../../lib/psychicDisplay";
import { formatPerMinuteGbp, welcomeCreditMinutes } from "../../../lib/currency";
import { sanitizeClaims } from "../../../lib/copy";
import "../../../styles/glass.css";

interface PsychicCardProps {
  psychic: Psychic;
  onClick: () => void;
}

const PsychicCard = ({ psychic, onClick }: PsychicCardProps) => {
  const perMinute = (psychic.price_per_second || 0) * 60;
  const freeMinutes = welcomeCreditMinutes(psychic.price_per_second);
  const tier = getTier(perMinute);
  const rating = DISPLAY_RATINGS[psychic.id];

  const categories = psychic.categories ?? [];
  const shownTags = categories.slice(0, 2);
  const extraTags = categories.length - shownTags.length;

  const filledStars = rating != null ? Math.round(rating) : 0;

  // Serif names read as names, not labels — Title case whatever the DB holds.
  const displayName = psychic.username
    ? psychic.username.charAt(0).toUpperCase() + psychic.username.slice(1).toLowerCase()
    : "";

  // Rising keeps a quiet neutral chip; Elite (and above) carries the accent.
  const tierClass = tier.label === "Rising" ? "gl-tier--rising" : "gl-tier--elite";

  return (
    <div className="gl-pc" onClick={onClick}>
      {/* PHOTO */}
      <div className="gl-ph">
        {psychic.profile_picture_url ? (
          <img src={psychic.profile_picture_url} alt={displayName} />
        ) : (
          <div className="gl-ph-fallback">
            <Icon icon="ph:user" />
          </div>
        )}

        {psychic.is_online && (
          <div className="gl-online">
            <span className="gl-dot" /> Online
          </div>
        )}

        <div className={`gl-tier ${tierClass}`}>{tier.label}</div>

        {freeMinutes > 0 && (
          <div className="gl-gift">£15 free · {freeMinutes} min</div>
        )}
      </div>

      {/* BODY */}
      <div className="gl-pbody">
        <div className="gl-prow">
          <div className="gl-pname">{displayName}</div>
          {rating != null && (
            <div className="gl-stars">
              {"★".repeat(filledStars)}
              {"☆".repeat(Math.max(0, 5 - filledStars))}
              <span>{rating.toFixed(1)}</span>
            </div>
          )}
        </div>

        <div className="gl-spec">{sanitizeClaims(psychic.bio)}</div>

        <div className="gl-tags">
          {shownTags.map((cat) => (
            <span key={cat.id} className="gl-tag">
              {cat.title}
            </span>
          ))}
          {extraTags > 0 && <span className="gl-tag">+{extraTags}</span>}
        </div>

        <div className="gl-prow2">
          <div className="gl-price">
            {formatPerMinuteGbp(perMinute)} <span>/ min</span>
          </div>
          <button className="gl-start" type="button">
            Start
          </button>
        </div>
      </div>
    </div>
  );
};

export default PsychicCard;
