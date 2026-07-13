import React from "react";

interface TypingIndicatorProps {
  avatarUrl?: string | null;
  name?: string;
}

/**
 * "Reader is typing…" indicator — three bouncing dots in an incoming-style bubble,
 * shown while the reader (Logan) is typing between delivered messages
 * (driven by the backend typing_start / typing_stop events). Presentation only.
 */
export const TypingIndicator: React.FC<TypingIndicatorProps> = ({ avatarUrl, name }) => {
  return (
    <div
      className="flex items-end gap-2 justify-start"
      aria-live="polite"
      aria-label={`${name || "Reader"} is typing`}
    >
      {avatarUrl ? (
        <img
          src={avatarUrl}
          alt=""
          className="w-7 h-7 rounded-full object-cover flex-shrink-0"
        />
      ) : (
        <div className="w-7 h-7 rounded-full bg-white/10 flex-shrink-0" />
      )}
      <div className="px-4 py-3 rounded-2xl rounded-bl-sm bg-white/10 border border-white/10 backdrop-blur-xl">
        <div className="flex items-center gap-1.5">
          <span
            className="w-2 h-2 rounded-full bg-white/60 animate-bounce"
            style={{ animationDelay: "0ms" }}
          />
          <span
            className="w-2 h-2 rounded-full bg-white/60 animate-bounce"
            style={{ animationDelay: "150ms" }}
          />
          <span
            className="w-2 h-2 rounded-full bg-white/60 animate-bounce"
            style={{ animationDelay: "300ms" }}
          />
        </div>
      </div>
    </div>
  );
};

export default TypingIndicator;
