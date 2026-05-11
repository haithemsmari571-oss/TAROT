import React from "react";
import { Icon } from "@iconify/react";
import { COLORS } from "../../../theme";

interface GlassChatCardProps {
  chat: any;
  onAccept?: () => void;
  onDeny?: () => void;
  onEnter?: () => void;
  isProcessing?: boolean;
  isPsychic?: boolean;
}

export const GlassChatCard: React.FC<GlassChatCardProps> = ({
  chat,
  onAccept,
  onDeny,
  onEnter,
  isProcessing,
  isPsychic = true,
}) => {
  
  // Get the other user's info
  const displayName = chat.user_name || "Unknown User";
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
        return "solar:chat-round-dots-bold-duotone";
      case "ENDED":
        return "solar:check-circle-bold-duotone";
      default:
        return "solar:chat-line-bold-duotone";
    }
  };

  const statusColor = getStatusColor(chat.status);
  const statusIcon = getStatusIcon(chat.status);

  return (
    <div
      className="group relative p-6 rounded-2xl border backdrop-blur-xl transition-all duration-300 hover:scale-[1.02] cursor-pointer"
      style={{
        background: `linear-gradient(135deg, ${COLORS.surface}CC 0%, ${COLORS.surfaceAccent}99 100%)`,
        borderColor: `${COLORS.neutralDarkGray}80`,
        boxShadow: `0 8px 32px ${COLORS.dark}40`,
      }}
      onClick={onEnter}
    >
      {/* Glass effect overlay */}
      <div
        className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"
        style={{
          background: `linear-gradient(135deg, ${COLORS.primary}10 0%, transparent 100%)`,
        }}
      />

      {/* Content */}
      <div className="relative z-10">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div
              className="w-12 h-12 rounded-xl flex items-center justify-center"
              style={{ backgroundColor: `${COLORS.primary}20` }}
            >
              <Icon
                icon="solar:user-bold-duotone"
                className="text-2xl"
                style={{ color: COLORS.primary }}
              />
            </div>
            <div>
              <h3 className="text-white font-black text-sm">
                {displayName}
              </h3>
              <p
                className="text-[9px] font-black uppercase tracking-widest"
                style={{ color: COLORS.neutralGray }}
              >
                Chat #{chat.id}
              </p>
            </div>
          </div>

          {/* Status Badge */}
          <div
            className="px-3 py-1.5 rounded-lg flex items-center gap-2"
            style={{
              backgroundColor: `${statusColor}20`,
              border: `1px solid ${statusColor}40`,
            }}
          >
            <Icon icon={statusIcon} className="text-sm" style={{ color: statusColor }} />
            <span
              className="text-[9px] font-black uppercase tracking-wider"
              style={{ color: statusColor }}
            >
              {chat.status}
            </span>
          </div>
        </div>

        {/* Actions */}
        {chat.status === "REQUESTED" && (
          <div className="flex gap-2 mt-4" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={onAccept}
              disabled={isProcessing}
              className="flex-1 px-4 py-2.5 rounded-xl border transition-all duration-300 hover:scale-105 font-black text-[10px] uppercase tracking-widest disabled:opacity-50 flex items-center justify-center gap-2"
              style={{
                backgroundColor: `${COLORS.primary}20`,
                borderColor: COLORS.primary,
                color: COLORS.primary,
              }}
            >
              <Icon icon="solar:check-circle-bold" className="text-base" />
              Accept
            </button>
            <button
              onClick={onDeny}
              disabled={isProcessing}
              className="flex-1 px-4 py-2.5 rounded-xl border transition-all duration-300 hover:scale-105 font-black text-[10px] uppercase tracking-widest disabled:opacity-50 flex items-center justify-center gap-2"
              style={{
                backgroundColor: "rgba(248, 113, 113, 0.2)",
                borderColor: "#F87171",
                color: "#F87171",
              }}
            >
              <Icon icon="solar:close-circle-bold" className="text-base" />
              Decline
            </button>
          </div>
        )}

        {chat.status === "ACTIVE" && (
          <div className="mt-4 flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={onEnter}
              className="flex-1 px-4 py-2.5 rounded-xl border transition-all duration-300 hover:scale-105 font-black text-[10px] uppercase tracking-widest flex items-center justify-center gap-2"
              style={{
                backgroundColor: COLORS.primary,
                borderColor: COLORS.primary,
                color: COLORS.dark,
              }}
            >
              <Icon icon="solar:chat-round-line-bold" className="text-base" />
              Enter Chat
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
