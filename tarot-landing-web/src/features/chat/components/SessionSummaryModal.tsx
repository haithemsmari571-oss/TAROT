import { motion, AnimatePresence } from "framer-motion";
import { Icon } from "@iconify/react";
import { useNavigate } from "react-router-dom";
import { COLORS, TYPOGRAPHY } from "../../../theme";

interface SessionSummaryModalProps {
  isOpen: boolean;
  onClose: () => void;
  sessionData: {
    duration: number; // in seconds
    cost: number;
    endReason: string;
  };
  onTopUp?: () => void;
}

const formatDuration = (seconds: number): string => {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, "0")}:${secs
      .toString()
      .padStart(2, "0")}`;
  }
  return `${minutes}:${secs.toString().padStart(2, "0")}`;
};

const formatCost = (cost: number): string => {
  return cost.toFixed(2);
};

export const SessionSummaryModal = ({
  isOpen,
  onClose,
  sessionData,
  onTopUp,
}: SessionSummaryModalProps) => {
  const navigate = useNavigate();

  // Distinguish "ran out of Stardust" from a normal end so the copy stays warm.
  const ranOutOfBalance = /balance|insufficient|run out|ran out/i.test(
    sessionData.endReason || ""
  );

  const handleTopUp = () => {
    onClose();
    if (onTopUp) {
      onTopUp();
    } else {
      navigate("/billing");
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            transition={{ type: "spring", stiffness: 300, damping: 25 }}
            className="relative w-full max-w-md rounded-3xl p-8 shadow-2xl backdrop-blur-xl border border-white/10"
            style={{ backgroundColor: COLORS.surface }}
          >
            {/* Close button */}
            <button
              onClick={onClose}
              className="absolute top-4 right-4 p-2 rounded-full hover:bg-white/10 transition-colors"
            >
              <Icon icon="solar:close-circle-bold" className="text-white/60 text-2xl" />
            </button>

            {/* Icon */}
            <div className="flex justify-center mb-6">
              <div
                className="w-20 h-20 rounded-3xl flex items-center justify-center"
                style={{
                  backgroundColor: ranOutOfBalance ? `${COLORS.starGold}1f` : `${COLORS.primary}1f`,
                  border: `1px solid ${ranOutOfBalance ? COLORS.starGold : COLORS.primary}44`,
                }}
              >
                <Icon
                  icon={ranOutOfBalance ? "solar:hourglass-line-duotone" : "solar:moon-stars-bold-duotone"}
                  className="text-4xl"
                  style={{ color: ranOutOfBalance ? COLORS.starGold : COLORS.primary }}
                />
              </div>
            </div>

            {/* Title */}
            <h2
              className="text-2xl font-bold text-center text-white mb-2"
              style={{ fontFamily: TYPOGRAPHY.fontFamily.heading }}
            >
              {ranOutOfBalance ? "Your reading time has run out" : "Your reading has ended"}
            </h2>
            <p className="text-center text-white/60 mb-6 leading-relaxed">
              {ranOutOfBalance
                ? "Add Stardust to keep going — your reader is just a tap away."
                : "We hope it brought you clarity. You're welcome back any time."}
            </p>

            {/* Stats */}
            <div className="space-y-4 mb-8">
              <div className="flex items-center justify-between p-4 rounded-2xl bg-white/5 border border-white/10">
                <div className="flex items-center gap-3">
                  <Icon
                    icon="solar:clock-circle-bold-duotone"
                    className="text-blue-400 text-2xl"
                  />
                  <span className="text-white/80">Duration</span>
                </div>
                <span className="text-xl font-bold text-white font-mono">
                  {formatDuration(sessionData.duration)}
                </span>
              </div>

              <div className="flex items-center justify-between p-4 rounded-2xl bg-white/5 border border-white/10">
                <div className="flex items-center gap-3">
                  <Icon
                    icon="solar:wallet-money-bold-duotone"
                    className="text-green-400 text-2xl"
                  />
                  <span className="text-white/80">Stardust spent</span>
                </div>
                <span className="text-xl font-bold text-white tabular-nums">
                  {formatCost(sessionData.cost)}
                </span>
              </div>
            </div>

            {/* Actions */}
            <div className="space-y-3">
              {ranOutOfBalance ? (
                <button
                  onClick={handleTopUp}
                  className="w-full py-3.5 px-6 rounded-2xl font-bold transition-transform hover:scale-[1.01] active:scale-[0.99] shadow-lg flex items-center justify-center gap-2"
                  style={{ backgroundColor: COLORS.starGold, color: COLORS.dark }}
                >
                  <Icon icon="ph:sparkle-fill" className="text-lg" />
                  Add Stardust
                </button>
              ) : (
                <button
                  onClick={() => { onClose(); navigate("/psychics-browse"); }}
                  className="w-full py-3.5 px-6 rounded-2xl font-bold text-white transition-opacity hover:opacity-90 shadow-lg flex items-center justify-center gap-2"
                  style={{ background: `linear-gradient(135deg, ${COLORS.primary} 0%, ${COLORS.secondary} 100%)` }}
                >
                  <Icon icon="solar:users-group-rounded-bold-duotone" className="text-lg" />
                  Book another reading
                </button>
              )}
              <button
                onClick={onClose}
                className="w-full py-3.5 px-6 rounded-2xl bg-white/10 text-white font-semibold hover:bg-white/20 transition-colors border border-white/15"
              >
                Close
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
