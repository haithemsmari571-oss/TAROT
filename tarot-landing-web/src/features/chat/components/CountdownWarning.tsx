import { motion, AnimatePresence } from "framer-motion";
import { Icon } from "@iconify/react";

interface CountdownWarningProps {
  secondsRemaining: number | null;
  isVisible: boolean;
  isCritical?: boolean;
}

const formatTime = (seconds: number): string => {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
};

export const CountdownWarning = ({
  secondsRemaining,
  isVisible,
  isCritical = false,
}: CountdownWarningProps) => {
  if (!isVisible || secondsRemaining === null) return null;

  const warningColor = isCritical ? "red" : secondsRemaining <= 30 ? "orange" : "yellow";
  const bgColor = isCritical 
    ? "bg-red-500/10 border-red-500/30" 
    : secondsRemaining <= 30 
    ? "bg-orange-500/10 border-orange-500/30"
    : "bg-yellow-500/10 border-yellow-500/30";
  
  const iconColor = isCritical 
    ? "text-red-400" 
    : secondsRemaining <= 30 
    ? "text-orange-400"
    : "text-yellow-400";

  const message = isCritical
    ? "Session ending very soon!"
    : secondsRemaining <= 30
    ? "Session ending soon"
    : "Low balance warning";

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -20, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -20, scale: 0.95 }}
        transition={{ type: "spring", stiffness: 300, damping: 25 }}
        className={`fixed top-20 right-6 z-50 p-4 rounded-2xl backdrop-blur-xl border ${bgColor}`}
      >
        <div className="flex items-center gap-3">
          <motion.div
            animate={{
              scale: isCritical ? [1, 1.1, 1] : 1,
            }}
            transition={{
              duration: 0.8,
              repeat: isCritical ? Infinity : 0,
              ease: "easeInOut",
            }}
          >
            <Icon
              icon="solar:clock-circle-bold"
              className={`${iconColor} text-2xl ${isCritical ? "animate-pulse" : ""}`}
            />
          </motion.div>
          <div>
            <p className="text-sm font-bold text-white">{message}</p>
            <p className={`text-xs ${iconColor} font-mono`}>
              {formatTime(secondsRemaining)} remaining
            </p>
          </div>
        </div>
        {isCritical && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="mt-2 text-xs text-red-300"
          >
            Please top up your balance to continue
          </motion.div>
        )}
      </motion.div>
    </AnimatePresence>
  );
};
