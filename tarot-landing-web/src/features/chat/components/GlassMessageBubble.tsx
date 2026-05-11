import React from "react";
import { motion } from "framer-motion";
import { Icon } from "@iconify/react";
import { COLORS } from "../../../theme";

interface GlassMessageBubbleProps {
  message: any;
  isOwn: boolean;
}

export const GlassMessageBubble: React.FC<GlassMessageBubbleProps> = ({
  message,
  isOwn,
}) => {
  const formatTime = (timestamp: string) => {
    if (!timestamp) return "";
    
    const date = new Date(timestamp);
    
    // Check if date is valid
    if (isNaN(date.getTime())) {
      return "";
    }
    
    return date.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      className={`flex ${isOwn ? "justify-end" : "justify-start"} mb-4`}
    >
      <div
        className={`max-w-[70%] ${isOwn ? "items-end" : "items-start"} flex flex-col gap-2`}
      >
        {/* Message bubble with enhanced design */}
        <motion.div
          whileHover={{ scale: 1.01 }}
          className="relative group"
        >
          <div
            className="px-5 py-3 backdrop-blur-xl border relative overflow-hidden"
            style={{
              background: isOwn
                ? `linear-gradient(135deg, ${COLORS.primary}60 0%, ${COLORS.primary}40 100%)`
                : `linear-gradient(135deg, ${COLORS.surface}F0 0%, ${COLORS.surfaceAccent}DD 100%)`,
              borderColor: isOwn ? `${COLORS.primary}80` : `${COLORS.neutralDarkGray}40`,
              boxShadow: isOwn
                ? `0 4px 20px ${COLORS.primary}30, 0 2px 10px ${COLORS.primary}20, inset 0 1px 0 ${COLORS.neutralWhite}15`
                : `0 4px 20px ${COLORS.dark}50, 0 2px 10px ${COLORS.dark}30, inset 0 1px 0 ${COLORS.neutralWhite}05`,
              borderRadius: isOwn 
                ? "20px 20px 4px 20px" 
                : "20px 20px 20px 4px",
            }}
          >
            {/* Animated gradient background on hover */}
            <motion.div
              initial={{ opacity: 0 }}
              whileHover={{ opacity: 1 }}
              transition={{ duration: 0.3 }}
              className="absolute inset-0 pointer-events-none"
              style={{
                background: isOwn
                  ? `linear-gradient(135deg, ${COLORS.neutralWhite}10 0%, transparent 50%, ${COLORS.neutralWhite}05 100%)`
                  : `linear-gradient(135deg, ${COLORS.neutralWhite}05 0%, transparent 50%, ${COLORS.neutralWhite}03 100%)`,
                borderRadius: isOwn 
                  ? "20px 20px 4px 20px" 
                  : "20px 20px 20px 4px",
              }}
            />

            {/* Subtle corner decoration for own messages */}
            {isOwn && (
              <div
                className="absolute bottom-1 right-1 w-2 h-2 rounded-full opacity-40"
                style={{
                  background: `radial-gradient(circle, ${COLORS.neutralWhite} 0%, transparent 70%)`,
                }}
              />
            )}

            {/* Message content */}
            <p
              className="text-sm leading-relaxed relative z-10 whitespace-pre-wrap break-words"
              style={{
                color: isOwn ? COLORS.dark : COLORS.neutralWhite,
                fontWeight: isOwn ? 500 : 400,
              }}
            >
              {message.content}
            </p>
          </div>

          {/* Small corner triangle pointer */}
          <div
            className="absolute bottom-0"
            style={{
              [isOwn ? "right" : "left"]: "-4px",
              width: 0,
              height: 0,
              borderLeft: isOwn ? "8px solid transparent" : "none",
              borderRight: !isOwn ? "8px solid transparent" : "none",
              borderTop: `8px solid ${
                isOwn ? `${COLORS.primary}60` : `${COLORS.surface}F0`
              }`,
              filter: "blur(0.5px)",
            }}
          />
        </motion.div>

        {/* Timestamp with enhanced styling */}
        <div
          className={`flex items-center gap-1.5 px-2 ${
            isOwn ? "justify-end" : "justify-start"
          }`}
        >
          <span
            className="text-[9px] font-bold uppercase tracking-wider"
            style={{ color: COLORS.neutralGray, opacity: 0.5 }}
          >
            {formatTime(message.created_at)}
          </span>
        </div>
      </div>
    </motion.div>
  );
};
