import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Icon } from "@iconify/react";
import { COLORS, TYPOGRAPHY } from "../../../theme";

interface MessageBubbleProps {
  content: string;
  /** ISO timestamp; revealed on tap. */
  timestamp?: string | null;
  /** True for the current user's own messages (right-aligned, gradient). */
  isOwn: boolean;
  /** First message of a same-sender run — gets the avatar + name and more top gap. */
  isGroupStart: boolean;
  /** The OTHER party's display name (shown above the first bubble of their run). */
  senderName?: string;
  /** The OTHER party's avatar (shown once per run). */
  senderAvatarUrl?: string | null;
  /** Read-receipt status of an own message: DELIVERED | READ (else none). */
  status?: string;
}

const formatTime = (ts?: string | null) => {
  if (!ts) return "";
  const d = new Date(ts);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
};

// Two-tier receipt: single check = delivered, double check (accent) = seen.
const READ_ACCENT = "#B79CFF"; // soft lavender accent, on-brand and unobtrusive
const receiptFor = (status?: string) => {
  const s = (status || "").toUpperCase();
  if (s === "READ") return { icon: "ph:checks-bold", color: READ_ACCENT }; // seen
  if (s === "DELIVERED")
    return { icon: "ph:check-bold", color: "rgba(255,255,255,0.4)" }; // delivered
  return null; // SENT / sending / unknown → no check (2-tier)
};

/**
 * Shared chat message bubble — used by both the client and psychic conversation
 * views so they stay identical. Mobile-first: comfortable line-length on narrow
 * screens, the whole bubble is the touch target (tap to reveal the time), and
 * the "other" bubble uses a dark glass that stays legible over the bright
 * chat backdrop.
 */
export const MessageBubble = ({
  content,
  timestamp,
  isOwn,
  isGroupStart,
  senderName,
  senderAvatarUrl,
  status,
}: MessageBubbleProps) => {
  const [showTime, setShowTime] = useState(false);
  const time = formatTime(timestamp);
  const receipt = isOwn ? receiptFor(status) : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18, ease: "easeOut" }}
      className={`flex ${isOwn ? "justify-end" : "justify-start"} ${
        isGroupStart ? "mt-4" : "mt-1"
      }`}
    >
      <div className={`max-w-[85%] sm:max-w-[72%] ${isOwn ? "" : "flex gap-2.5"}`}>
        {/* Other party's avatar — visible once per run, kept (hidden) for alignment. */}
        {!isOwn && (
          <div
            className="w-8 h-8 self-end flex-shrink-0 overflow-hidden rounded-full border border-white/10 bg-gradient-to-br from-primary/25 to-secondary/25 flex items-center justify-center"
            style={{ visibility: isGroupStart ? "visible" : "hidden" }}
          >
            {senderAvatarUrl ? (
              <img
                src={senderAvatarUrl}
                alt={senderName || ""}
                className="h-full w-full object-cover"
              />
            ) : (
              <Icon icon="ph:user-fill" className="text-sm text-white/80" />
            )}
          </div>
        )}

        <div className="flex min-w-0 flex-col">
          {!isOwn && isGroupStart && senderName && (
            <span
              className="mb-1 ml-1 text-[12px] font-semibold"
              style={{
                color: COLORS.primary,
                fontFamily: TYPOGRAPHY.fontFamily.heading,
              }}
            >
              {senderName}
            </span>
          )}

          {/* The bubble is the tap target (well over 44px) — tap toggles the time. */}
          <button
            type="button"
            onClick={() => setShowTime((s) => !s)}
            aria-label={time ? `Message · sent ${time}` : "Message"}
            className={`w-fit px-3.5 py-2.5 text-left shadow-lg transition-transform active:scale-[0.99] sm:px-[18px] sm:py-3 ${
              isOwn
                ? "self-end rounded-[22px] rounded-br-md text-white"
                : "self-start rounded-[22px] rounded-bl-md text-white"
            }`}
            style={
              isOwn
                ? {
                    background: `linear-gradient(135deg, ${COLORS.primary} 0%, ${COLORS.secondary} 100%)`,
                  }
                : {
                    backgroundColor: "rgba(18,18,26,0.62)",
                    backdropFilter: "blur(12px)",
                    border: "1px solid rgba(255,255,255,0.10)",
                  }
            }
          >
            <p className="text-[15px] leading-relaxed break-words whitespace-pre-wrap">
              {content}
            </p>
          </button>

          {/* Timestamp reveals on tap; the receipt check (own messages) stays
              visible so "seen" is legible at a glance without tapping. */}
          {(showTime || receipt) && (
            <div
              className={`mt-1 flex items-center gap-1 px-1.5 text-[11px] leading-none ${
                isOwn ? "self-end justify-end" : "self-start"
              }`}
            >
              <AnimatePresence initial={false}>
                {showTime && time && (
                  <motion.span
                    initial={{ opacity: 0, width: 0 }}
                    animate={{ opacity: 1, width: "auto" }}
                    exit={{ opacity: 0, width: 0 }}
                    transition={{ duration: 0.15 }}
                    className="overflow-hidden whitespace-nowrap text-white/40"
                  >
                    {time}
                  </motion.span>
                )}
              </AnimatePresence>
              {receipt && (
                <Icon
                  icon={receipt.icon}
                  className="text-[13px]"
                  style={{ color: receipt.color }}
                  aria-label={
                    (status || "").toUpperCase() === "READ" ? "Seen" : "Delivered"
                  }
                />
              )}
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
};
