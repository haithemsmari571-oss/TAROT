import React from "react";
import { Icon } from "@iconify/react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { useNotifications } from "../hooks/useNotifications";
import { COLORS } from "@/theme";

interface NotificationBellProps {
  variant?: "navbar" | "sidebar";
}

export const NotificationBell: React.FC<NotificationBellProps> = ({ variant = "navbar" }) => {
  const navigate = useNavigate();
  const { unreadCount } = useNotifications();

  const handleClick = () => {
    if (variant === "sidebar") {
      navigate("/admin/notifications");
    } else {
      navigate("/notifications");
    }
  };

  if (variant === "sidebar") {
    // Sidebar style for psychic admin
    return (
      <motion.button
        onClick={handleClick}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        className="relative p-3 rounded-xl transition-all"
        style={{
          background: unreadCount > 0 ? `${COLORS.primary}20` : "transparent",
        }}
      >
        <Icon 
          icon="solar:bell-bold-duotone" 
          className="text-2xl"
          style={{ color: unreadCount > 0 ? COLORS.primary : "white" }}
        />
        {unreadCount > 0 && (
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            className="absolute -top-1 -right-1 min-w-[20px] h-5 rounded-full flex items-center justify-center px-1.5 text-xs font-bold text-white"
            style={{ backgroundColor: COLORS.primary }}
          >
            {unreadCount > 99 ? "99+" : unreadCount}
          </motion.div>
        )}
      </motion.button>
    );
  }

  // Navbar style for client
  return (
    <motion.button
      onClick={handleClick}
      whileHover={{ scale: 1.1 }}
      whileTap={{ scale: 0.9 }}
      className="relative p-2 rounded-full transition-all"
    >
      <Icon 
        icon="solar:bell-bold-duotone" 
        className="text-2xl"
        style={{ color: COLORS.primary }}
      />
      {unreadCount > 0 && (
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          className="absolute -top-1 -right-1 min-w-[18px] h-[18px] rounded-full flex items-center justify-center px-1 text-xs font-bold text-white"
          style={{ backgroundColor: COLORS.primary }}
        >
          {unreadCount > 99 ? "99+" : unreadCount}
        </motion.div>
      )}
    </motion.button>
  );
};
