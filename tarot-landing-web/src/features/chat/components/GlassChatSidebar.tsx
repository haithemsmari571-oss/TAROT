import React, { useState } from "react";
import { motion } from "framer-motion";
import { Icon } from "@iconify/react";
import { COLORS } from "../../../theme";
import { formatGbp } from "../../../lib/currency";

interface GlassChatSidebarProps {
  chat: any;
  clientDob?: string | null;
  seconds: number;
  estimatedCost: number;
  remainingSeconds?: number | null;
  clientBalance?: number | null;
  creditBalance?: number | null;
  paidBalance?: number | null;
  // Billing sub-state: 'AWAITING_JOIN' = accepted, client not joined yet →
  // frozen meter, "not billing". 'ACTIVE' = client joined, meter running.
  // 'GRACE' = out of balance, client in the top-up hold.
  sessionStatus?: 'ACTIVE' | 'AWAITING_JOIN' | 'GRACE' | null;
  remainingMinutes?: number;
  graceSecondsLeft?: number;
  isToppingUp?: boolean;
  showCriticalWarning?: boolean;
  showLowBalanceWarning?: boolean;
  onEndChat: () => void;
  isEnding?: boolean;
}

export const GlassChatSidebar: React.FC<GlassChatSidebarProps> = ({
  chat,
  clientDob,
  seconds,
  estimatedCost,
  remainingSeconds,
  clientBalance,
  creditBalance,
  paidBalance,
  sessionStatus,
  remainingMinutes,
  graceSecondsLeft,
  isToppingUp,
  showCriticalWarning = false,
  showLowBalanceWarning = false,
  onEndChat,
  isEnding,
}) => {
  const [showSeconds, setShowSeconds] = useState(true);
  
  // Debug logging
  React.useEffect(() => {
    console.log("GlassChatSidebar received:", { seconds, estimatedCost });
  }, [seconds, estimatedCost]);

  const formatTime = (totalSeconds: number, includeSeconds: boolean = true) => {
    if (isNaN(totalSeconds) || totalSeconds < 0) {
      return includeSeconds ? "00:00:00" : "00:00";
    }
    
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const secs = totalSeconds % 60;
    
    if (includeSeconds) {
      return `${hours.toString().padStart(2, "0")}:${minutes
        .toString()
        .padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
    } else {
      return `${hours.toString().padStart(2, "0")}:${minutes
        .toString()
        .padStart(2, "0")}`;
    }
  };

  // Exact, shared formatting (1 point = £1) — matches every other screen.
  const formatCurrency = (amount: number) => {
    if (isNaN(amount) || amount < 0) return "£0";
    return formatGbp(amount);
  };

  // A client with a large stardust balance legitimately holds thousands of
  // prepaid minutes; raw values ("9615383 min", "160256:22:13") don't fit a
  // compact tile. Roll up to the largest unit that reads at a glance.
  const formatCompactMinutes = (mins: number) => {
    if (isNaN(mins) || mins < 0) return "0 min";
    if (mins < 120) return `${Math.floor(mins)} min`;
    const hours = mins / 60;
    if (hours < 48) return `${Math.round(hours)} hrs`;
    return `${Math.round(hours / 24).toLocaleString("en-GB")} days`;
  };

  const formatRemainingTime = (totalSeconds: number, includeSeconds: boolean) => {
    const hours = totalSeconds / 3600;
    if (hours < 48) return formatTime(totalSeconds, includeSeconds);
    const days = hours / 24;
    if (days < 100) return `${Math.floor(days)}d ${Math.floor(hours % 24)}h`;
    return `${Math.round(days).toLocaleString("en-GB")} days`;
  };

  const displayName = chat.user_name || "Unknown User";

  const getStatusColor = (status: string) => {
    switch (status) {
      case "REQUESTED":
        return "#F59E0B";
      case "ACTIVE":
        return "#4ADE80";
      case "PAUSED":
        return "#FB923C";
      case "ENDED":
        return COLORS.neutralGray;
      default:
        return COLORS.neutralGray;
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case "REQUESTED":
        return "Pending";
      case "ACTIVE":
        return "Active";
      case "PAUSED":
        return "Paused";
      case "ENDED":
        return "Ended";
      default:
        return status;
    }
  };

  const statusColor = getStatusColor(chat.status);

  // The chat is live (accepted) but the client hasn't opened it yet → the meter
  // is frozen and NOTHING is billed. Show a clear "not billing" state instead of
  // a 00:00 counter that looks broken.
  const isAwaitingJoin = sessionStatus === "AWAITING_JOIN";
  // Client has joined → the join-anchored per-minute meter is running.
  const isBillingLive = sessionStatus === "ACTIVE" && chat.status !== "ENDED";
  // Out of balance → client is in the top-up hold; billing frozen, input locked.
  const isGrace = sessionStatus === "GRACE";

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      className="glass-panel w-full relative overflow-hidden"
    >
      {/* Mystical background pattern */}
      <div
        className="absolute inset-0 opacity-5"
        style={{
          backgroundImage: `radial-gradient(circle, rgb(var(--oracle-rgb)) 1px, transparent 1px)`,
          backgroundSize: "24px 24px",
        }}
      />

      {/* Top decorative gradient */}
      <div
        className="absolute top-0 left-0 right-0 h-24 opacity-30 pointer-events-none"
        style={{
          background: `radial-gradient(circle at 50% 0%, rgba(var(--oracle-rgb), 0.19) 0%, transparent 70%)`,
        }}
      />

      <div className="relative z-10 p-6 space-y-6">
        {/* Client Info with mystical card design */}
        {/* Compact identity row — the old oversized avatar/ring ornament ate a
            large empty block; a 36px mark + name + chat# + DOB says the same in
            one line. */}
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="flex items-center gap-3"
        >
          <div
            className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
            style={{
              background: `linear-gradient(135deg, ${COLORS.primary}40 0%, ${COLORS.primary}15 100%)`,
              border: `1.5px solid ${COLORS.primary}60`,
            }}
          >
            <Icon icon="solar:user-bold-duotone" className="text-lg" style={{ color: COLORS.primary }} />
          </div>
          <div className="min-w-0">
            <h3 className="text-base font-black text-white leading-tight truncate">{displayName}</h3>
            <p
              className="text-[10px] font-bold tracking-wide flex items-center gap-2"
              style={{ color: clientDob ? "rgb(var(--oracle-rgb))" : COLORS.neutralGray }}
            >
              <span style={{ color: COLORS.neutralGray }}>#{chat.id}</span>
              <Icon icon="solar:calendar-bold-duotone" className="text-[10px]" />
              {clientDob
                ? new Date(clientDob).toLocaleDateString("en-GB", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })
                : "DOB not provided"}
            </p>
          </div>
        </motion.div>

        {/* Elegant divider */}
        <div className="flex items-center gap-3">
          <div
            className="flex-1 h-px"
            style={{
              background: `linear-gradient(90deg, transparent 0%, rgba(var(--oracle-rgb), 0.33) 50%, transparent 100%)`,
            }}
          />
          <Icon
            icon="solar:star-bold"
            className="text-xs"
            style={{ color: "rgb(var(--oracle-rgb))", opacity: 0.6 }}
          />
          <div
            className="flex-1 h-px"
            style={{
              background: `linear-gradient(90deg, transparent 0%, rgba(var(--oracle-rgb), 0.33) 50%, transparent 100%)`,
            }}
          />
        </div>

        {/* Status Card */}
        <motion.div
          initial={{ y: 10, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.2 }}
        >
          <p
            className="oracle-label mb-3"
          >
            Session Status
          </p>
          <div
            className="px-5 py-3 rounded-xl flex items-center justify-center gap-3 border relative overflow-hidden"
            style={{
              backgroundColor: `${statusColor}15`,
              borderColor: `${statusColor}40`,
              boxShadow: `0 0 25px ${statusColor}15`,
            }}
          >
            {/* Animated background pulse */}
            {chat.status === "ACTIVE" && (
              <motion.div
                animate={{ scale: [1, 1.5, 1], opacity: [0.5, 0, 0.5] }}
                transition={{ duration: 2, repeat: Infinity }}
                className="absolute inset-0"
                style={{
                  background: `radial-gradient(circle, ${statusColor}30 0%, transparent 70%)`,
                }}
              />
            )}
            
            <div
              className="w-3 h-3 rounded-full relative z-10"
              style={{
                backgroundColor: statusColor,
                boxShadow: `0 0 15px ${statusColor}80`,
                animation: chat.status === "ACTIVE" ? "pulse 2s ease-in-out infinite" : "none",
              }}
            />
            <span
              className="text-sm font-black uppercase tracking-wider relative z-10"
              style={{ color: statusColor }}
            >
              {getStatusLabel(chat.status)}
            </span>
          </div>
        </motion.div>

        {/* Waiting for client — accepted but not joined yet → NOT billing. */}
        {isAwaitingJoin && (
          <motion.div
            initial={{ y: 10, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.3 }}
          >
            <div
              className="px-5 py-5 rounded-xl text-center relative overflow-hidden border"
              style={{
                backgroundColor: "rgba(251, 146, 60, 0.12)",
                borderColor: "rgba(251, 146, 60, 0.4)",
                boxShadow: `inset 0 2px 10px ${COLORS.dark}40`,
              }}
            >
              <div className="flex flex-col items-center gap-2 relative z-10">
                <motion.div
                  animate={{ opacity: [0.4, 1, 0.4] }}
                  transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                >
                  <Icon
                    icon="solar:hourglass-line-duotone"
                    className="text-3xl"
                    style={{ color: "#FB923C" }}
                  />
                </motion.div>
                <span
                  className="text-sm font-black uppercase tracking-wider"
                  style={{ color: "#FB923C" }}
                >
                  Waiting for client
                </span>
                <span
                  className="text-[10px] font-bold uppercase tracking-[0.15em]"
                  style={{ color: COLORS.neutralGray }}
                >
                  Not billing — timer starts on join
                </span>
              </div>
            </div>
          </motion.div>
        )}

        {/* Out-of-balance grace: client is topping up — psychic please hold. */}
        {isGrace && (
          <motion.div
            initial={{ y: 10, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.3 }}
          >
            <div
              className="px-5 py-5 rounded-xl text-center relative overflow-hidden border"
              style={{
                backgroundColor: "rgba(251, 146, 60, 0.14)",
                borderColor: "rgba(251, 146, 60, 0.45)",
                boxShadow: `inset 0 2px 10px ${COLORS.dark}40`,
              }}
            >
              <div className="flex flex-col items-center gap-2 relative z-10">
                <motion.div
                  animate={{ opacity: [0.4, 1, 0.4] }}
                  transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
                >
                  <Icon
                    icon={isToppingUp ? "solar:card-bold-duotone" : "solar:hourglass-line-duotone"}
                    className="text-3xl"
                    style={{ color: "#FB923C" }}
                  />
                </motion.div>
                <span className="text-sm font-black uppercase tracking-wider" style={{ color: "#FB923C" }}>
                  {isToppingUp ? "Client is topping up" : "Client is out of Stardust"}
                </span>
                <span className="text-[11px] font-bold text-white/70">
                  {isToppingUp ? "Please hold — resuming after payment" : "Please hold — offering a top-up"}
                </span>
                {typeof graceSecondsLeft === "number" && graceSecondsLeft > 0 && !isToppingUp && (
                  <span className="text-2xl font-black tabular-nums" style={{ color: "#FB923C" }}>
                    0:{String(Math.max(0, graceSecondsLeft)).padStart(2, "0")}
                  </span>
                )}
              </div>
            </div>
          </motion.div>
        )}

        {/* Session vitals — dense operational readouts the operator glances at
            constantly: a 2-up grid of compact tiles, figures at text-lg. Display
            drama stays reserved for identity moments (the Valentina title);
            working data is information-dense. */}
        {isBillingLive && (
          <motion.div
            initial={{ y: 10, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.3 }}
            className="space-y-2"
          >
            <div className="flex items-center justify-between">
              <p className="oracle-label">Session vitals</p>
              <button
                onClick={() => setShowSeconds(!showSeconds)}
                className="px-2 py-0.5 rounded-lg border transition-all"
                style={{ borderColor: "rgba(var(--oracle-rgb), 0.25)" }}
              >
                <span
                  className="text-[8px] font-black uppercase tracking-wider"
                  style={{ color: COLORS.neutralGray }}
                >
                  {showSeconds ? "HH:MM" : "HH:MM:SS"}
                </span>
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="oracle-tile px-3 py-2.5">
                <div className="text-[8px] font-bold uppercase tracking-wider text-white/40 mb-0.5">
                  Session time
                </div>
                <div className="oracle-figure text-lg flex items-center gap-1.5">
                  <Icon icon="solar:clock-circle-bold-duotone" className="text-sm shrink-0" style={{ color: "rgb(var(--oracle-rgb))" }} />
                  {formatTime(seconds, showSeconds)}
                </div>
              </div>

              <div className="oracle-tile px-3 py-2.5" title="What the client pays — client spend only">
                <div className="text-[8px] font-bold uppercase tracking-wider text-white/40 mb-0.5">
                  Charged so far
                </div>
                <div className="oracle-figure text-lg flex items-center gap-1.5">
                  <Icon icon="solar:banknote-2-bold-duotone" className="text-sm shrink-0" style={{ color: "rgb(var(--oracle-rgb))" }} />
                  {formatCurrency(estimatedCost)}
                </div>
              </div>

              {typeof remainingMinutes === "number" && (
                <div className="oracle-tile px-3 py-2.5">
                  <div className="text-[8px] font-bold uppercase tracking-wider text-white/40 mb-0.5">
                    Minutes left
                  </div>
                  <div className="oracle-figure text-lg">{formatCompactMinutes(Math.max(0, remainingMinutes))}</div>
                </div>
              )}

              {remainingSeconds !== null && remainingSeconds !== undefined && remainingSeconds > 0 && (
                <div
                  className="oracle-tile px-3 py-2.5"
                  style={
                    showCriticalWarning
                      ? {
                          backgroundColor: "rgba(239, 68, 68, 0.2)",
                          borderColor: "rgba(239, 68, 68, 0.5)",
                          boxShadow: "0 0 30px rgba(239, 68, 68, 0.3)",
                        }
                      : showLowBalanceWarning
                        ? {
                            backgroundColor: "rgba(251, 146, 60, 0.15)",
                            borderColor: "rgba(251, 146, 60, 0.4)",
                            boxShadow: "0 0 25px rgba(251, 146, 60, 0.2)",
                          }
                        : undefined
                  }
                >
                  <div className="text-[8px] font-bold uppercase tracking-wider text-white/40 mb-0.5">
                    Client time left
                  </div>
                  <div
                    className="oracle-figure text-lg flex items-center gap-1.5"
                    style={
                      showCriticalWarning
                        ? { color: "#EF4444" }
                        : showLowBalanceWarning
                          ? { color: "#FB923C" }
                          : undefined
                    }
                  >
                    <Icon icon="solar:hourglass-bold-duotone" className="text-sm shrink-0" />
                    {formatRemainingTime(Math.max(0, Math.floor(remainingSeconds)), showSeconds)}
                  </div>
                  {showCriticalWarning && (
                    <p className="text-[9px] font-bold uppercase tracking-wider mt-1" style={{ color: '#EF4444' }}>
                      🚨 Critical: &lt; 1 Minute
                    </p>
                  )}
                  {showLowBalanceWarning && !showCriticalWarning && (
                    <p className="text-[9px] font-bold uppercase tracking-wider mt-1" style={{ color: '#FB923C' }}>
                      ⚠️ Low Balance
                    </p>
                  )}
                </div>
              )}
            </div>
          </motion.div>
        )}

        {/* Balance + controls — shown whether awaiting join, billing, or in the
            grace hold (a psychic needs the client's balance and an End button). */}
        {(isAwaitingJoin || isBillingLive || isGrace) && (
          <>
            {/* Client Balance Display — total + free/paid split. Orange = free
                welcome/gift credit, purple = purchased balance. */}
            {clientBalance !== null && clientBalance !== undefined && (
              <motion.div
                initial={{ y: 10, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.5 }}
              >
                <p
                  className="oracle-label mb-3"
                >
                  Client Balance
                </p>
                <div
                  className="oracle-tile px-5 py-3 text-center relative overflow-hidden"
                  style={{
                                      }}
                >
                  <div className="flex items-center justify-center gap-2 relative z-10">
                    <Icon
                      icon="solar:wallet-bold-duotone"
                      className="text-lg"
                      style={{ color: COLORS.neutralGray }}
                    />
                    <span
                      className="oracle-figure text-xl"
                    >
                      {formatCurrency(clientBalance)}
                    </span>
                  </div>
                  {/* Free vs paid split */}
                  {(creditBalance != null || paidBalance != null) && (
                    <div className="flex items-center justify-center gap-3 mt-2 relative z-10">
                      <span
                        className="text-[10px] font-bold tracking-wide"
                        style={{ color: "#FB923C" }}
                      >
                        {formatCurrency(creditBalance ?? 0)} free
                      </span>
                      <span
                        className="text-[10px] font-bold"
                        style={{ color: COLORS.neutralDarkGray }}
                      >
                        ·
                      </span>
                      <span
                        className="text-[10px] font-bold tracking-wide"
                        style={{ color: COLORS.primary }}
                      >
                        {formatCurrency(paidBalance ?? 0)} paid
                      </span>
                    </div>
                  )}
                </div>
              </motion.div>
            )}

            {/* Elegant divider */}
            <div className="flex items-center gap-3">
              <div
                className="flex-1 h-px"
                style={{
                  background: `linear-gradient(90deg, transparent 0%, rgba(var(--oracle-rgb), 0.33) 50%, transparent 100%)`,
                }}
              />
              <Icon
                icon="solar:star-bold"
                className="text-xs"
                style={{ color: "rgb(var(--oracle-rgb))", opacity: 0.6 }}
              />
              <div
                className="flex-1 h-px"
                style={{
                  background: `linear-gradient(90deg, transparent 0%, rgba(var(--oracle-rgb), 0.33) 50%, transparent 100%)`,
                }}
              />
            </div>

            {/* End Chat Button */}
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              initial={{ y: 10, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.5 }}
              onClick={onEndChat}
              disabled={isEnding}
              className="w-full px-6 py-4 rounded-xl border transition-all duration-300 font-black text-[11px] uppercase tracking-widest disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2.5 relative overflow-hidden group"
              style={{
                backgroundColor: "rgba(248, 113, 113, 0.15)",
                borderColor: "#F87171",
                color: "#F87171",
                boxShadow: "0 0 20px rgba(248, 113, 113, 0.2)",
              }}
            >
              <div
                className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                style={{
                  background: `linear-gradient(135deg, rgba(248, 113, 113, 0.1) 0%, transparent 100%)`,
                }}
              />
              <Icon icon="solar:end-call-bold-duotone" className="text-xl relative z-10" />
              <span className="relative z-10">{isEnding ? "Ending Session..." : "End Session"}</span>
            </motion.button>
          </>
        )}
      </div>
    </motion.div>
  );
};
