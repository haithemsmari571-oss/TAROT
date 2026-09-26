import type { KeyboardEvent } from "react";
import { Icon } from "@iconify/react";
import type { Psychic } from "../types/psychic.types";
import { formatGbp, formatPerMinuteGbp, welcomeCreditMinutes } from "../../../lib/currency";
import { useBillingMode } from "@/features/billing-mode/BillingModeContext";
import { hasWelcomeCredit, welcomeCreditLine } from "@/features/client-app/useWelcomeCredit";
import { sanitizeClaims } from "../../../lib/copy";
import "../../../styles/glass.css";

interface PsychicCardProps {
  psychic: Psychic;
  onClick: () => void;
  /** The welcome credit in pounds, from useWelcomeCredit. The gift line, per
      message or per minute, is drawn only when it is known and above 0. */
  welcomeCreditGbp?: number;
}

const PsychicCard = ({ psychic, onClick, welcomeCreditGbp }: PsychicCardProps) => {
  const perMinute = (psychic.price_per_second || 0) * 60;
  const freeMinutes = hasWelcomeCredit(welcomeCreditGbp) ? welcomeCreditMinutes(welcomeCreditGbp, psychic.price_per_second) : 0;
  /* Per-message billing (step 5b): the card prices a message, not a minute,
     and a reader with no per-message price shows no price line or badge. */
  const { billingMode } = useBillingMode();
  const perMessage = billingMode === "per_message";
  const perMessagePrice =
    psychic.price_per_message != null && psychic.price_per_message > 0 ? psychic.price_per_message : null;
  /* The price line is per minute only on a per_minute site and only with a
     per-second price. Otherwise, the mode still unknown (in flight or failed)
     included, it is the per-message price, or no line. Never "£0.00". */
  const perMinuteLine = billingMode === "per_minute" && perMinute > 0;

  const categories = psychic.categories ?? [];
  const shownTags = categories.slice(0, 2);
  const extraTags = categories.length - shownTags.length;

  // Serif names read as names, not labels — Title case whatever the DB holds.
  const displayName = psychic.username
    ? psychic.username.charAt(0).toUpperCase() + psychic.username.slice(1).toLowerCase()
    : "";

  // Enter and Space on the card itself do what a click does. A key pressed on the
  // Start button inside is left to the button, whose own click bubbles up here.
  // Start does nothing the card does not, so it stays out of the Tab order and
  // out of the accessibility tree.
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget || (event.key !== "Enter" && event.key !== " ")) return;
    event.preventDefault();
    onClick();
  };

  return (
    <div className="gl-pc" role="button" tabIndex={0} aria-label={`Open ${displayName}'s profile`} onClick={onClick} onKeyDown={onKeyDown}>
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

        {perMessage && perMessagePrice != null ? (
          hasWelcomeCredit(welcomeCreditGbp) && <div className="gl-gift">{welcomeCreditLine(welcomeCreditGbp, perMessagePrice)}</div>
        ) : billingMode === "per_minute" && hasWelcomeCredit(welcomeCreditGbp) && freeMinutes > 0 && (
          <div className="gl-gift">{formatGbp(welcomeCreditGbp)} free · {freeMinutes} min</div>
        )}
      </div>

      {/* BODY */}
      <div className="gl-pbody">
        <div className="gl-prow">
          <div className="gl-pname">{displayName}</div>
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
          {perMinuteLine ? (
            <div className="gl-price">
              {formatPerMinuteGbp(perMinute)} <span>/ min</span>
            </div>
          ) : (
            perMessagePrice != null && (
              <div className="gl-price">
                {formatGbp(perMessagePrice)} <span>per message</span>
              </div>
            )
          )}
          <button className="gl-start" type="button" tabIndex={-1} aria-hidden="true">
            Start
          </button>
        </div>
      </div>
    </div>
  );
};

export default PsychicCard;
