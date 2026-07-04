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
}

const formatTime = (ts?: string | null) => {
  if (!ts) return "";
  const d = new Date(ts);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
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
}: MessageBubbleProps) => {
  const [showTime, setShowTime] = useState(false);
  const time = formatTime(timestamp);

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

          <AnimatePresence initial={false}>
            {showTime && time && (
              <motion.p
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.15 }}
                className={`overflow-hidden px-1.5 text-[11px] text-white/40 ${
                  isOwn ? "self-end text-right" : "self-start text-left"
                }`}
              >
                <span className="mt-1 inline-block">{time}</span>
              </motion.p>
            )}
          </AnimatePresence>
        </div>
      </div>
    </motion.div>
  );
};
