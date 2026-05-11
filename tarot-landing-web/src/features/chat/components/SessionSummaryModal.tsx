import { motion, AnimatePresence } from "framer-motion";
import { Icon } from "@iconify/react";
import { useNavigate } from "react-router-dom";

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

  const handleTopUp = () => {
    onClose();
    if (onTopUp) {
      onTopUp();
    } else {
      navigate("/client/wallet");
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
            className="relative w-full max-w-md rounded-3xl bg-gradient-to-br from-purple-900/40 to-pink-900/40 p-8 shadow-2xl backdrop-blur-xl border border-white/10"
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
              <div className="p-4 rounded-full bg-purple-500/20">
                <Icon
                  icon="solar:clock-circle-bold"
                  className="text-purple-400 text-5xl"
                />
              </div>
            </div>

            {/* Title */}
            <h2 className="text-2xl font-bold text-center text-white mb-2">
              Session Ended
            </h2>
            <p className="text-center text-white/60 mb-6">{sessionData.endReason}</p>

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
                  <span className="text-white/80">Total Cost</span>
                </div>
                <span className="text-xl font-bold text-white">
                  {formatCost(sessionData.cost)} pts
                </span>
              </div>
            </div>

            {/* Actions */}
            <div className="space-y-3">
              {sessionData.endReason.toLowerCase().includes("balance") && (
                <button
                  onClick={handleTopUp}
                  className="w-full py-3 px-6 rounded-full bg-gradient-to-r from-purple-500 to-pink-500 text-white font-semibold hover:from-purple-600 hover:to-pink-600 transition-all duration-300 shadow-lg hover:shadow-xl"
                >
                  Top Up Balance
                </button>
              )}
              <button
                onClick={onClose}
                className="w-full py-3 px-6 rounded-full bg-white/10 text-white font-semibold hover:bg-white/20 transition-all duration-300 border border-white/20"
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
