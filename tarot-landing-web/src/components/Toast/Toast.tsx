import { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Icon } from "@iconify/react";
import { COLORS, TYPOGRAPHY } from "../../theme";

export type ToastType = "success" | "error" | "info" | "warning";

export interface ToastProps {
  id: string;
  message: string;
  type: ToastType;
  duration?: number;
  onClose: (id: string) => void;
}

const Toast = ({ id, message, type, duration = 3000, onClose }: ToastProps) => {
  useEffect(() => {
    const timer = setTimeout(() => {
      onClose(id);
    }, duration);

    return () => clearTimeout(timer);
  }, [id, duration, onClose]);

  const getIcon = () => {
    switch (type) {
      case "success":
        return "solar:check-circle-bold";
      case "error":
        return "solar:danger-circle-bold";
      case "warning":
        return "solar:danger-triangle-bold";
      case "info":
        return "solar:info-circle-bold";
    }
  };

  const getColor = () => {
    switch (type) {
      case "success":
        return COLORS.primary;
      case "error":
        return "#EF4444";
      case "warning":
        return COLORS.starGold;
      case "info":
        return "#3B82F6";
    }
  };

  const color = getColor();

  return (
    <motion.div
      initial={{ opacity: 0, y: -20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95, transition: { duration: 0.2 } }}
      className="flex items-center gap-3 px-6 py-4 rounded-2xl border shadow-2xl backdrop-blur-xl min-w-[320px] max-w-[500px]"
      style={{
        backgroundColor: `${COLORS.surface}E6`,
        borderColor: `${color}40`,
        fontFamily: TYPOGRAPHY.fontFamily.body,
      }}
    >
      <Icon icon={getIcon()} className="text-2xl flex-shrink-0" style={{ color }} />
      <p className="text-sm font-medium text-white flex-1">{message}</p>
      <button
        onClick={() => onClose(id)}
        className="text-white/40 hover:text-white transition-colors flex-shrink-0"
      >
        <Icon icon="solar:close-circle-bold" className="text-lg" />
      </button>
    </motion.div>
  );
};

export default Toast;
