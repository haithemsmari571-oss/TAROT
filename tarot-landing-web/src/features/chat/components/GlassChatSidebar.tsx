import React, { useState } from "react";
import { motion } from "framer-motion";
import { Icon } from "@iconify/react";
import { COLORS } from "../../../theme";

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

  const formatCurrency = (amount: number) => {
    if (isNaN(amount) || amount < 0) {
      return "£0.00";
    }
    // amount is already in points (1 point = £1) — do NOT divide by 100.
    return new Intl.NumberFormat("en-GB", {
      style: "currency",
      currency: "GBP",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
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
      className="w-[340px] rounded-2xl backdrop-blur-xl border relative overflow-hidden"
      style={{
        background: `linear-gradient(135deg, ${COLORS.surface}EE 0%, ${COLORS.surfaceAccent}BB 100%)`,
        borderColor: `${COLORS.neutralDarkGray}30`,
        boxShadow: `0 8px 32px ${COLORS.dark}60, inset 0 1px 0 ${COLORS.neutralWhite}10`,
      }}
    >
      {/* Mystical background pattern */}
      <div
        className="absolute inset-0 opacity-5"
        style={{
          backgroundImage: `radial-gradient(circle, ${COLORS.primary} 1px, transparent 1px)`,
          backgroundSize: "24px 24px",
        }}
      />

      {/* Top decorative gradient */}
      <div
        className="absolute top-0 left-0 right-0 h-24 opacity-30 pointer-events-none"
        style={{
          background: `radial-gradient(circle at 50% 0%, ${COLORS.primary}40 0%, transparent 70%)`,
        }}
      />

      <div className="relative z-10 p-6 space-y-6">
        {/* Client Info with mystical card design */}
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.1 }}
          className="text-center"
        >
          <div className="relative inline-block mb-4">
            {/* Outer glow ring */}
            <div
              className="absolute -inset-2 rounded-full blur-lg opacity-50"
              style={{
                background: `radial-gradient(circle, ${COLORS.primary}60 0%, transparent 70%)`,
              }}
            />
            
            {/* Avatar container */}
            <div
              className="relative w-24 h-24 rounded-full flex items-center justify-center overflow-hidden"
              style={{
                background: `linear-gradient(135deg, ${COLORS.primary}50 0%, ${COLORS.primary}20 100%)`,
                border: `3px solid ${COLORS.primary}70`,
                boxShadow: `0 0 30px ${COLORS.primary}30, inset 0 2px 10px ${COLORS.dark}40`,
              }}
            >
              {/* Inner shine effect */}
              <div
                className="absolute inset-0 opacity-40"
                style={{
                  background: `linear-gradient(135deg, ${COLORS.neutralWhite}20 0%, transparent 50%, ${COLORS.neutralWhite}10 100%)`,
                }}
              />
              
              <Icon
                icon="solar:user-bold-duotone"
                className="text-5xl relative z-10"
                style={{ color: COLORS.primary }}
              />
              
              {/* Status indicator ring */}
              {chat.status === "ACTIVE" && (
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
                  className="absolute inset-0"
                  style={{
                    border: `2px dashed ${COLORS.primary}60`,
                    borderRadius: "50%",
                  }}
                />
              )}
            </div>
          </div>

          <h3 className="text-xl font-black text-white mb-2">
            {displayName}
          </h3>
          <p
            className="text-[9px] font-black uppercase tracking-[0.2em] mb-1"
            style={{ color: COLORS.neutralGray }}
          >
            Chat #{chat.id}
          </p>
          {/* Client date of birth — the reader needs this for the reading */}
          <p
            className="text-[11px] font-bold tracking-wide mt-1 flex items-center justify-center gap-1.5"
            style={{ color: clientDob ? COLORS.starGold : COLORS.neutralGray }}
          >
            <Icon icon="solar:calendar-bold-duotone" className="text-xs" />
            DOB:{" "}
            {clientDob
              ? new Date(clientDob).toLocaleDateString("en-GB", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                })
              : "not provided"}
          </p>
        </motion.div>

        {/* Elegant divider */}
        <div className="flex items-center gap-3">
          <div
            className="flex-1 h-px"
            style={{
              background: `linear-gradient(90deg, transparent 0%, ${COLORS.neutralDarkGray}60 50%, transparent 100%)`,
            }}
          />
          <Icon
            icon="solar:star-bold"
            className="text-xs"
            style={{ color: COLORS.primary, opacity: 0.5 }}
          />
          <div
            className="flex-1 h-px"
            style={{
              background: `linear-gradient(90deg, transparent 0%, ${COLORS.neutralDarkGray}60 50%, transparent 100%)`,
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
            className="text-[9px] font-black uppercase tracking-[0.15em] mb-3"
            style={{ color: COLORS.neutralGray }}
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

        {/* Session Time & Earnings — only once the client has joined (billing). */}
        {isBillingLive && (
          <>
            {/* Minutes remaining (per-minute prepaid) */}
            {typeof remainingMinutes === "number" && (
              <motion.div
                initial={{ y: 10, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.28 }}
              >
                <p
                  className="text-[9px] font-black uppercase tracking-[0.15em] mb-3"
                  style={{ color: COLORS.neutralGray }}
                >
                  Minutes Remaining
                </p>
                <div
                  className="px-5 py-3 rounded-xl text-center border"
                  style={{ backgroundColor: `${COLORS.primary}12`, borderColor: `${COLORS.primary}33` }}
                >
                  <span className="text-2xl font-black" style={{ color: COLORS.neutralWhite }}>
                    {Math.max(0, remainingMinutes)} min
                  </span>
                </div>
              </motion.div>
            )}

            {/* Session Time Card */}
            <motion.div
              initial={{ y: 10, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.3 }}
            >
              <div className="flex items-center justify-between mb-3">
                <p
                  className="text-[9px] font-black uppercase tracking-[0.15em]"
                  style={{ color: COLORS.neutralGray }}
                >
                  Session Time
                </p>
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => setShowSeconds(!showSeconds)}
                  className="px-2.5 py-1 rounded-lg transition-all duration-300 border"
                  style={{
                    backgroundColor: `${COLORS.neutralWhite}08`,
                    borderColor: `${COLORS.neutralWhite}15`,
                  }}
                >
                  <span
                    className="text-[8px] font-black uppercase tracking-wider"
                    style={{ color: COLORS.neutralGray }}
                  >
                    {showSeconds ? "HH:MM" : "HH:MM:SS"}
                  </span>
                </motion.button>
              </div>
              
              <div
                className="px-5 py-4 rounded-xl text-center relative overflow-hidden border"
                style={{
                  backgroundColor: `${COLORS.neutralWhite}08`,
                  borderColor: `${COLORS.neutralWhite}15`,
                  boxShadow: `inset 0 2px 10px ${COLORS.dark}40`,
                }}
              >
                {/* Subtle animated gradient */}
                <motion.div
                  animate={{
                    backgroundPosition: ["0% 50%", "100% 50%", "0% 50%"],
                  }}
                  transition={{ duration: 5, repeat: Infinity }}
                  className="absolute inset-0 opacity-10"
                  style={{
                    background: `linear-gradient(90deg, transparent 0%, ${COLORS.primary}60 50%, transparent 100%)`,
                    backgroundSize: "200% 100%",
                  }}
                />

                <div className="flex items-center justify-center gap-3 relative z-10">
                  <Icon
                    icon="solar:clock-circle-bold-duotone"
                    className="text-2xl"
                    style={{ color: COLORS.primary }}
                  />
                  <span
                    className="text-3xl font-black tabular-nums"
                    style={{ color: COLORS.neutralWhite }}
                  >
                    {formatTime(seconds, showSeconds)}
                  </span>
                </div>
              </div>
            </motion.div>

            {/* Estimated Earnings Card */}
            <motion.div
              initial={{ y: 10, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.4 }}
            >
              <p
                className="text-[9px] font-black uppercase tracking-[0.15em] mb-3"
                style={{ color: COLORS.neutralGray }}
              >
                Charged so far · what the client pays
              </p>
              <div
                className="px-5 py-4 rounded-xl text-center relative overflow-hidden border"
                style={{
                  backgroundColor: `${COLORS.starGold}15`,
                  borderColor: `${COLORS.starGold}40`,
                  boxShadow: `0 0 25px ${COLORS.starGold}15, inset 0 2px 10px ${COLORS.dark}40`,
                }}
              >
                {/* Shimmer effect */}
                <motion.div
                  animate={{
                    x: ["-100%", "100%"],
                  }}
                  transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
                  className="absolute inset-0 opacity-20"
                  style={{
                    background: `linear-gradient(90deg, transparent 0%, ${COLORS.neutralWhite}60 50%, transparent 100%)`,
                    width: "50%",
                  }}
                />

                <div className="flex items-center justify-center gap-3 relative z-10">
                  <Icon
                    icon="solar:banknote-2-bold-duotone"
                    className="text-2xl"
                    style={{ color: COLORS.starGold }}
                  />
                  <span
                    className="text-3xl font-black"
                    style={{ color: COLORS.neutralWhite }}
                  >
                    {formatCurrency(estimatedCost)}
                  </span>
                </div>
              </div>
            </motion.div>

            {/* Client Remaining Time Card */}
            {remainingSeconds !== null && remainingSeconds !== undefined && remainingSeconds > 0 && (
              <motion.div
                initial={{ y: 10, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.45 }}
              >
                <p
                  className="text-[9px] font-black uppercase tracking-[0.15em] mb-3"
                  style={{ color: COLORS.neutralGray }}
                >
                  Client Time Remaining
                </p>
                <div
                  className="px-5 py-4 rounded-xl text-center relative overflow-hidden border"
                  style={{
                    backgroundColor: showCriticalWarning 
                      ? `rgba(239, 68, 68, 0.2)` 
                      : showLowBalanceWarning 
                        ? `rgba(251, 146, 60, 0.15)` 
                        : `${COLORS.neutralWhite}08`,
                    borderColor: showCriticalWarning 
                      ? `rgba(239, 68, 68, 0.5)` 
                      : showLowBalanceWarning 
                        ? `rgba(251, 146, 60, 0.4)` 
                        : `${COLORS.neutralWhite}15`,
                    boxShadow: showCriticalWarning 
                      ? `0 0 30px rgba(239, 68, 68, 0.3), inset 0 2px 10px ${COLORS.dark}40`
                      : showLowBalanceWarning 
                        ? `0 0 25px rgba(251, 146, 60, 0.2), inset 0 2px 10px ${COLORS.dark}40`
                        : `inset 0 2px 10px ${COLORS.dark}40`,
                  }}
                >
                  <div className="flex items-center justify-center gap-3 relative z-10">
                    <Icon
                      icon="solar:hourglass-bold-duotone"
                      className="text-2xl"
                      style={{ 
                        color: showCriticalWarning 
                          ? '#EF4444' 
                          : showLowBalanceWarning 
                            ? '#FB923C' 
                            : COLORS.primary 
                      }}
                    />
                    <span
                      className="text-3xl font-black tabular-nums"
                      style={{ 
                        color: showCriticalWarning 
                          ? '#EF4444' 
                          : showLowBalanceWarning 
                            ? '#FB923C' 
                            : COLORS.neutralWhite 
                      }}
                    >
                      {formatTime(Math.max(0, Math.floor(remainingSeconds)), showSeconds)}
                    </span>
                  </div>
                  
                  {showCriticalWarning && (
                    <p className="text-[9px] font-bold uppercase tracking-wider mt-2" style={{ color: '#EF4444' }}>
                      🚨 Critical: &lt; 1 Minute
                    </p>
                  )}
                  {showLowBalanceWarning && !showCriticalWarning && (
                    <p className="text-[9px] font-bold uppercase tracking-wider mt-2" style={{ color: '#FB923C' }}>
                      ⚠️ Low Balance Warning
                    </p>
                  )}
                </div>
              </motion.div>
            )}

          </>
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
                  className="text-[9px] font-black uppercase tracking-[0.15em] mb-3"
                  style={{ color: COLORS.neutralGray }}
                >
                  Client Balance
                </p>
                <div
                  className="px-5 py-3 rounded-xl text-center relative overflow-hidden border"
                  style={{
                    backgroundColor: `${COLORS.neutralWhite}08`,
                    borderColor: `${COLORS.neutralWhite}15`,
                  }}
                >
                  <div className="flex items-center justify-center gap-2 relative z-10">
                    <Icon
                      icon="solar:wallet-bold-duotone"
                      className="text-lg"
                      style={{ color: COLORS.neutralGray }}
                    />
                    <span
                      className="text-xl font-black"
                      style={{ color: COLORS.neutralWhite }}
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
                  background: `linear-gradient(90deg, transparent 0%, ${COLORS.neutralDarkGray}60 50%, transparent 100%)`,
                }}
              />
              <Icon
                icon="solar:star-bold"
                className="text-xs"
                style={{ color: COLORS.primary, opacity: 0.5 }}
              />
              <div
                className="flex-1 h-px"
                style={{
                  background: `linear-gradient(90deg, transparent 0%, ${COLORS.neutralDarkGray}60 50%, transparent 100%)`,
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
