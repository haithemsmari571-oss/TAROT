import React from "react";
import { Icon } from "@iconify/react";
import { COLORS, PERSONAS } from "../../../theme";

interface GlassChatListItemProps {
  chat: any;
  onAccept?: () => void;
  onDeny?: () => void;
  onEnter?: () => void;
  isProcessing?: boolean;
  isPsychic?: boolean;
}

// Semantic status colors — deliberately separate from the gold/crimson oracle
// palette so state reads instantly (green live, amber waiting, orange paused).
const STATUS_META: Record<string, { color: string; label: string }> = {
  REQUESTED: { color: "#F59E0B", label: "Pending" },
  ACTIVE: { color: "#4ADE80", label: "Active" },
  PAUSED: { color: "#FB923C", label: "Paused" },
  ENDED: { color: COLORS.neutralGray, label: "Ended" },
};

// Inbox-style relative time — operational data the operator scans constantly,
// so it stays terse ("5m ago"), rolling up to a short date once it's stale.
const relativeTime = (iso: string | null | undefined) => {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  if (isNaN(then)) return "";
  const secs = Math.floor((Date.now() - then) / 1000);
  if (secs < 60) return "just now";
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
  if (secs < 7 * 86400) return `${Math.floor(secs / 86400)}d ago`;
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
};

/**
 * One row of the sessions-list inbox: avatar, client ✦ reader, relative time,
 * a one-line preview of the latest message, and a needs-attention star on
 * pending requests. The row itself opens the session (same onEnter as before);
 * per-status actions stay as explicit buttons on the right.
 */
export const GlassChatListItem: React.FC<GlassChatListItemProps> = ({
  chat,
  onAccept,
  onDeny,
  onEnter,
  isProcessing,
}) => {
  const status = STATUS_META[chat.status] ?? { color: COLORS.neutralGray, label: chat.status };

  // Admin rows arrive as "client -> psychic"; psychic rows as just the client.
  const [clientName, psychicName] = (chat.user_name || "Unknown User").split(" -> ");
  const isLive = chat.status === "ACTIVE" || chat.status === "PAUSED";

  return (
    <div
      className="group relative flex items-center gap-4 px-5 py-4 cursor-pointer transition-colors duration-300"
      style={{ backgroundColor: "transparent" }}
      onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "rgba(var(--gold-rgb), 0.05)")}
      onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
      onClick={onEnter}
    >
      {/* Status accent hairline on the left edge */}
      <div
        className="absolute left-0 top-2 bottom-2 w-0.5 rounded-full"
        style={{ background: `linear-gradient(180deg, ${status.color} 0%, ${status.color}30 100%)` }}
      />

      {/* Avatar: real profile picture when the API has one, else the client's initial */}
      <div className="relative shrink-0">
        <div
          className="w-11 h-11 rounded-full flex items-center justify-center overflow-hidden"
          style={{
            background: `linear-gradient(135deg, rgba(var(--gold-rgb), 0.18) 0%, rgba(var(--valentina-rgb), 0.14) 100%)`,
            border: "1px solid rgba(var(--gold-rgb), 0.35)",
          }}
        >
          {chat.user_profile_pic_url ? (
            <img
              src={chat.user_profile_pic_url}
              alt=""
              className="w-full h-full object-cover"
            />
          ) : (
            <span className="text-sm font-black" style={{ color: COLORS.starGold }}>
              {(clientName || "?").charAt(0).toUpperCase()}
            </span>
          )}
        </div>
        <div
          className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2"
          style={{ backgroundColor: status.color, borderColor: COLORS.dark }}
        >
          {chat.status === "ACTIVE" && (
            <div
              className="absolute inset-0 rounded-full"
              style={{ backgroundColor: status.color, animation: "pulse 2s ease-in-out infinite" }}
            />
          )}
        </div>
      </div>

      {/* Name + preview — dense operational text, compact scale */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-bold text-white truncate">
            {clientName}
            {psychicName && (
              <span className="font-semibold" style={{ color: "rgba(var(--gold-rgb), 0.75)" }}>
                {" "}✦ {psychicName}
              </span>
            )}
          </h3>
          <span
            className="shrink-0 text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-full border"
            style={{
              color: status.color,
              borderColor: `${status.color}45`,
              backgroundColor: `${status.color}12`,
            }}
          >
            {chat.status === "PAUSED" ? "Paused" : status.label}
          </span>
        </div>
        <p className="text-xs text-white/45 truncate mt-0.5">
          {chat.last_message || "No messages yet"}
        </p>
      </div>

      {/* Right rail: relative time + star + per-status actions */}
      <div className="flex items-center gap-3 shrink-0" onClick={(e) => e.stopPropagation()}>
        <div className="flex flex-col items-end gap-1">
          <span className="text-[10px] font-bold tabular-nums" style={{ color: COLORS.neutralGray }}>
            {relativeTime(chat.updated_at)}
          </span>
          <span className="text-[9px] font-black uppercase tracking-widest" style={{ color: `${COLORS.neutralGray}90` }}>
            #{chat.id}
          </span>
        </div>

        {/* Needs-attention star: a pending request is the inbox's "unread" */}
        {chat.status === "REQUESTED" && (
          <Icon
            icon="solar:star-bold"
            className="text-base"
            style={{ color: COLORS.starGold, filter: `drop-shadow(0 0 6px ${COLORS.starGold}70)` }}
          />
        )}

        {chat.status === "REQUESTED" && (
          <div className="flex items-center gap-2">
            <button
              onClick={onAccept}
              disabled={isProcessing}
              className="px-4 py-2 rounded-xl border transition-all duration-300 font-black text-[10px] uppercase tracking-widest disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
              style={{
                backgroundColor: "rgba(var(--gold-rgb), 0.14)",
                borderColor: "rgba(var(--gold-rgb), 0.55)",
                color: COLORS.starGold,
              }}
            >
              <Icon icon="solar:check-circle-bold-duotone" className="text-sm" />
              {isProcessing ? "…" : "Accept"}
            </button>
            <button
              onClick={onDeny}
              disabled={isProcessing}
              className="px-4 py-2 rounded-xl border transition-all duration-300 font-black text-[10px] uppercase tracking-widest disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
              style={{
                backgroundColor: "rgba(248, 113, 113, 0.12)",
                borderColor: "rgba(248, 113, 113, 0.45)",
                color: "#F87171",
              }}
            >
              <Icon icon="solar:close-circle-bold-duotone" className="text-sm" />
              Decline
            </button>
          </div>
        )}

        {isLive && (
          <button
            onClick={onEnter}
            className="px-4 py-2 rounded-xl transition-all duration-300 font-black text-[10px] uppercase tracking-widest flex items-center gap-1.5"
            style={{
              background: `linear-gradient(100deg, ${COLORS.starGold} 0%, ${PERSONAS.valentina.base} 90%)`,
              color: COLORS.dark,
              boxShadow: "0 2px 14px rgba(var(--gold-rgb), 0.35)",
            }}
          >
            <Icon icon="solar:chat-round-line-bold-duotone" className="text-sm" />
            Enter
          </button>
        )}

        {chat.status === "ENDED" && (
          <button
            onClick={onEnter}
            className="px-4 py-2 rounded-xl border transition-all duration-300 font-black text-[10px] uppercase tracking-widest flex items-center gap-1.5"
            style={{
              backgroundColor: `${COLORS.neutralWhite}06`,
              borderColor: "rgba(var(--gold-rgb), 0.22)",
              color: COLORS.neutralGray,
            }}
          >
            <Icon icon="solar:eye-bold-duotone" className="text-sm" />
            History
          </button>
        )}
      </div>
    </div>
  );
};
