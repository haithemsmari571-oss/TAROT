import React, { useEffect } from "react";
import { motion } from "framer-motion";
import { Icon } from "@iconify/react";
import { COLORS, TYPOGRAPHY } from "@/theme";
import { useNotifications } from "../hooks/useNotifications";
import { NotificationType } from "../types/notification.types";
import { useNavigate } from "react-router-dom";

const NotificationsPage = () => {
  const navigate = useNavigate();
  const { notifications, unreadCount, markAllAsRead } = useNotifications();

  useEffect(() => {
    // Mark all as read when user views the page
    if (unreadCount > 0) {
      const timer = setTimeout(() => {
        markAllAsRead();
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [unreadCount, markAllAsRead]);

  const getNotificationIcon = (type: NotificationType) => {
    switch (type) {
      case NotificationType.CHAT_ACCEPTED:
        return "solar:check-circle-bold-duotone";
      case NotificationType.CHAT_REQUESTED:
        return "solar:chat-dots-bold-duotone";
      case NotificationType.CHAT_ENDED:
        return "solar:close-circle-bold-duotone";
      case NotificationType.MESSAGE_RECEIVED:
        return "solar:letter-bold-duotone";
      case NotificationType.BALANCE_LOW:
        return "solar:wallet-bold-duotone";
      default:
        return "solar:bell-bold-duotone";
    }
  };

  const getNotificationColor = (type: NotificationType) => {
    switch (type) {
      case NotificationType.CHAT_ACCEPTED:
        return COLORS.primary;
      case NotificationType.CHAT_REQUESTED:
        return COLORS.secondary;
      case NotificationType.CHAT_ENDED:
        return "#f59e0b";
      case NotificationType.MESSAGE_RECEIVED:
        return "#3b82f6";
      case NotificationType.BALANCE_LOW:
        return "#ef4444";
      default:
        return COLORS.primary;
    }
  };

  const handleNotificationClick = (notification: any) => {
    // Navigate based on notification type
    if (notification.data?.chat_id) {
      navigate(`/chats`);
    }
  };

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

    if (diffInSeconds < 60) return "Just now";
    if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
    if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
    return `${Math.floor(diffInSeconds / 86400)}d ago`;
  };

  return (
    <div
      className="min-h-screen pt-20 pb-10 px-4 md:px-8"
      style={{
        fontFamily: TYPOGRAPHY.fontFamily.body,
        backgroundColor: COLORS.dark,
      }}
    >
      {/* Header */}
      <div className="max-w-4xl mx-auto mb-8">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center justify-between"
        >
          <div>
            <h1
              className="text-4xl font-bold text-white mb-2"
              style={{ fontFamily: TYPOGRAPHY.fontFamily.heading }}
            >
              Notifications
            </h1>
            <p className="text-white/60">
              {notifications.length === 0
                ? "No notifications yet"
                : `${notifications.length} notification${notifications.length !== 1 ? "s" : ""}`}
            </p>
          </div>
          {unreadCount > 0 && (
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={markAllAsRead}
              className="px-4 py-2 rounded-xl text-sm font-semibold text-white bg-white/10 hover:bg-white/20 transition-all"
            >
              Mark all as read
            </motion.button>
          )}
        </motion.div>
      </div>

      {/* Notifications List */}
      <div className="max-w-4xl mx-auto space-y-3">
        {notifications.length === 0 ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-center py-20"
          >
            <Icon
              icon="solar:bell-off-bold-duotone"
              className="text-8xl text-white/20 mx-auto mb-4"
            />
            <p className="text-white/40 text-lg">No notifications yet</p>
            <p className="text-white/30 text-sm mt-2">
              You'll see updates about your chats and account here
            </p>
          </motion.div>
        ) : (
          notifications.map((notification, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.05 }}
              onClick={() => handleNotificationClick(notification)}
              className="group relative p-5 rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl hover:bg-white/10 transition-all cursor-pointer"
            >
              <div className="flex gap-4">
                {/* Icon */}
                <div
                  className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{
                    backgroundColor: `${getNotificationColor(notification.notification_type)}20`,
                  }}
                >
                  <Icon
                    icon={getNotificationIcon(notification.notification_type)}
                    className="text-2xl"
                    style={{
                      color: getNotificationColor(notification.notification_type),
                    }}
                  />
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <h3 className="text-white font-semibold mb-1">
                    {notification.title}
                  </h3>
                  <p className="text-white/70 text-sm mb-2">
                    {notification.message}
                  </p>
                  <span className="text-white/40 text-xs">
                    {formatTime(notification.timestamp)}
                  </span>
                </div>

                {/* Arrow */}
                <div className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Icon
                    icon="solar:alt-arrow-right-bold"
                    className="text-white/40 text-xl"
                  />
                </div>
              </div>
            </motion.div>
          ))
        )}
      </div>
    </div>
  );
};

export default NotificationsPage;
