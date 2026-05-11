import React from "react";
import { motion } from "framer-motion";
import { Icon } from "@iconify/react";
import { COLORS } from "../../../theme";

interface GlassChatListItemProps {
  chat: any;
  onAccept?: () => void;
  onDeny?: () => void;
  onEnter?: () => void;
  isProcessing?: boolean;
  isPsychic?: boolean;
}

export const GlassChatListItem: React.FC<GlassChatListItemProps> = ({
  chat,
  onAccept,
  onDeny,
  onEnter,
  isProcessing,
  isPsychic = true,
}) => {
  const getStatusColor = (status: string) => {
    switch (status) {
      case "REQUESTED":
        return "#F59E0B";
      case "ACTIVE":
        return "#4ADE80";
      case "ENDED":
        return COLORS.neutralGray;
      default:
        return COLORS.neutralGray;
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "REQUESTED":
        return "solar:bell-bold-duotone";
      case "ACTIVE":
        return "solar:chat-round-line-bold-duotone";
      case "ENDED":
        return "solar:check-circle-bold-duotone";
      default:
        return "solar:chat-line-bold-duotone";
    }
  };

  const displayName = chat.user_name || "Unknown User";

  const statusColor = getStatusColor(chat.status);
  const statusIcon = getStatusIcon(chat.status);

  return (
    <motion.div
      whileHover={{ scale: 1.01, y: -2 }}
      whileTap={{ scale: 0.99 }}
      className="group relative p-5 rounded-2xl border backdrop-blur-xl transition-all duration-300 cursor-pointer overflow-hidden"
      style={{
        background: `linear-gradient(135deg, ${COLORS.surface}EE 0%, ${COLORS.surfaceAccent}BB 100%)`,
        borderColor: `${COLORS.neutralDarkGray}40`,
        boxShadow: `0 4px 20px ${COLORS.dark}50, inset 0 1px 0 ${COLORS.neutralWhite}08`,
      }}
      onClick={onEnter}
    >
      {/* Animated gradient border on hover */}
      <div
        className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500"
        style={{
          background: `linear-gradient(135deg, ${COLORS.primary}10 0%, transparent 50%, ${COLORS.primary}10 100%)`,
          borderRadius: "16px",
        }}
      />

      {/* Status accent bar */}
      <div
        className="absolute left-0 top-0 bottom-0 w-1 rounded-l-2xl"
        style={{
          background: `linear-gradient(180deg, ${statusColor} 0%, ${statusColor}40 100%)`,
        }}
      />

      <div className="relative z-10 flex items-center justify-between">
        {/* Left: User Info */}
        <div className="flex items-center gap-4 flex-1">
          {/* Avatar with enhanced design */}
          <div className="relative">
            <div
              className="w-14 h-14 rounded-full flex items-center justify-center relative overflow-hidden"
              style={{
                background: `linear-gradient(135deg, ${COLORS.primary}50 0%, ${COLORS.primary}20 100%)`,
                border: `2px solid ${COLORS.primary}70`,
              }}
            >
              {/* Shimmer effect */}
              <div
                className="absolute inset-0 opacity-30"
                style={{
                  background: `linear-gradient(135deg, transparent 0%, ${COLORS.neutralWhite}20 50%, transparent 100%)`,
                }}
              />
              <Icon
                icon="solar:user-bold-duotone"
                className="text-2xl relative z-10"
                style={{ color: COLORS.primary }}
              />
            </div>
            
            {/* Status indicator badge */}
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              className="absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full flex items-center justify-center border-2"
              style={{
                backgroundColor: COLORS.dark,
                borderColor: statusColor,
              }}
            >
              <div
                className="w-2.5 h-2.5 rounded-full"
                style={{
                  backgroundColor: statusColor,
                  animation: chat.status === "ACTIVE" ? "pulse 2s ease-in-out infinite" : "none",
                }}
              />
            </motion.div>
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h3 className="text-white font-black text-base truncate">
                {displayName}
              </h3>
              {chat.status === "REQUESTED" && (
                <motion.div
                  animate={{ scale: [1, 1.2, 1] }}
                  transition={{ duration: 2, repeat: Infinity }}
                >
                  <Icon
                    icon="solar:star-bold"
                    className="text-xs"
                    style={{ color: COLORS.primary }}
                  />
                </motion.div>
              )}
            </div>
            <div className="flex items-center gap-2">
              <p
                className="text-[9px] font-black uppercase tracking-widest"
                style={{ color: COLORS.neutralGray }}
              >
                Session #{chat.id}
              </p>
              {chat.created_at && (
                <>
                  <span style={{ color: COLORS.neutralGray }}>•</span>
                  <p
                    className="text-[9px] font-bold"
                    style={{ color: COLORS.neutralGray }}
                  >
                    {new Date(chat.created_at).toLocaleDateString()}
                  </p>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Middle: Status with enhanced design */}
        <div
          className="px-4 py-2 rounded-xl flex items-center gap-2 mx-6 border"
          style={{
            backgroundColor: `${statusColor}12`,
            borderColor: `${statusColor}30`,
            boxShadow: `0 0 20px ${statusColor}15`,
          }}
        >
          <Icon
            icon={statusIcon}
            className="text-base"
            style={{ color: statusColor }}
          />
          <span
            className="text-[10px] font-black uppercase tracking-wider"
            style={{ color: statusColor }}
          >
            {chat.status}
          </span>
        </div>

        {/* Right: Actions with enhanced buttons */}
        <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
          {chat.status === "REQUESTED" && (
            <>
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={onAccept}
                disabled={isProcessing}
                className="px-5 py-2.5 rounded-xl border transition-all duration-300 font-black text-[10px] uppercase tracking-widest disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 relative overflow-hidden"
                style={{
                  backgroundColor: `${COLORS.primary}20`,
                  borderColor: `${COLORS.primary}70`,
                  color: COLORS.primary,
                  boxShadow: `0 0 15px ${COLORS.primary}20`,
                }}
              >
                <div
                  className="absolute inset-0 opacity-0 hover:opacity-100 transition-opacity"
                  style={{
                    background: `linear-gradient(135deg, ${COLORS.primary}10 0%, transparent 100%)`,
                  }}
                />
                <Icon icon="solar:check-circle-bold-duotone" className="text-base relative z-10" />
                <span className="relative z-10">{isProcessing ? "Processing..." : "Accept"}</span>
              </motion.button>
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={onDeny}
                disabled={isProcessing}
                className="px-5 py-2.5 rounded-xl border transition-all duration-300 font-black text-[10px] uppercase tracking-widest disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                style={{
                  backgroundColor: "rgba(248, 113, 113, 0.15)",
                  borderColor: "rgba(248, 113, 113, 0.5)",
                  color: "#F87171",
                }}
              >
                <Icon icon="solar:close-circle-bold-duotone" className="text-base" />
                Decline
              </motion.button>
            </>
          )}

          {chat.status === "ACTIVE" && (
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={onEnter}
              className="px-6 py-2.5 rounded-xl border-2 transition-all duration-300 font-black text-[10px] uppercase tracking-widest flex items-center gap-2 relative overflow-hidden"
              style={{
                backgroundColor: COLORS.primary,
                borderColor: COLORS.primary,
                color: COLORS.dark,
                boxShadow: `0 4px 20px ${COLORS.primary}50`,
              }}
            >
              <div
                className="absolute inset-0 opacity-50"
                style={{
                  background: `linear-gradient(135deg, ${COLORS.neutralWhite}20 0%, transparent 100%)`,
                }}
              />
              <Icon icon="solar:chat-round-line-bold-duotone" className="text-base relative z-10" />
              <span className="relative z-10">Enter Session</span>
            </motion.button>
          )}

          {chat.status === "ENDED" && (
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={onEnter}
              className="px-5 py-2.5 rounded-xl border transition-all duration-300 font-black text-[10px] uppercase tracking-widest flex items-center gap-2"
              style={{
                backgroundColor: `${COLORS.neutralGray}15`,
                borderColor: `${COLORS.neutralGray}50`,
                color: COLORS.neutralGray,
              }}
            >
              <Icon icon="solar:eye-bold-duotone" className="text-base" />
              View History
            </motion.button>
          )}
        </div>
      </div>
    </motion.div>
  );
};
