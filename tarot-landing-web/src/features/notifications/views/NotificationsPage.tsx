import { Icon } from "@iconify/react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { COLORS, TYPOGRAPHY } from "@/theme";
import { NotificationType } from "../types/notification.types";
import {
  usePaginatedNotifications,
  type NotificationTab,
} from "../hooks/usePaginatedNotifications";

const TABS: { key: NotificationTab; label: string; icon: string }[] = [
  { key: "all", label: "All", icon: "solar:bell-bold-duotone" },
  { key: "unread", label: "Unread", icon: "solar:inbox-bold-duotone" },
  { key: "chats", label: "Chats", icon: "solar:chat-dots-bold-duotone" },
  { key: "payments", label: "Payments", icon: "solar:card-bold-duotone" },
];

function getNotificationIcon(type: NotificationType) {
  switch (type) {
    case NotificationType.CHAT_ACCEPTED:
      return "solar:check-circle-bold-duotone";
    case NotificationType.CHAT_REQUESTED:
      return "solar:chat-dots-bold-duotone";
    case NotificationType.CHAT_ENDED:
      return "solar:close-circle-bold-duotone";
    case NotificationType.CHAT_RESUMED:
      return "solar:play-circle-bold-duotone";
    case NotificationType.BALANCE_LOW:
      return "solar:wallet-bold-duotone";
    case NotificationType.TOPUP_SUCCESS:
      return "solar:card-bold-duotone";
    case NotificationType.INSUFFICIENT_BALANCE_AFTER_PAYMENT:
      return "solar:wallet-money-bold-duotone";
    case NotificationType.PAYMENT_SUCCESS_CHAT_NEEDS_MANUAL_RESUME:
      return "solar:refresh-circle-bold-duotone";
    case NotificationType.RESUME_ERROR_AFTER_PAYMENT:
      return "solar:danger-circle-bold-duotone";
    default:
      return "solar:bell-bold-duotone";
  }
}

function getNotificationColor(type: NotificationType) {
  switch (type) {
    case NotificationType.CHAT_ACCEPTED:
      return COLORS.primary;
    case NotificationType.CHAT_REQUESTED:
      return COLORS.secondary;
    case NotificationType.CHAT_ENDED:
      return "#f59e0b";
    case NotificationType.CHAT_RESUMED:
      return "#22c55e";
    case NotificationType.BALANCE_LOW:
      return "#ef4444";
    case NotificationType.TOPUP_SUCCESS:
      return "#22c55e";
    case NotificationType.INSUFFICIENT_BALANCE_AFTER_PAYMENT:
      return "#ef4444";
    case NotificationType.PAYMENT_SUCCESS_CHAT_NEEDS_MANUAL_RESUME:
      return "#3b82f6";
    case NotificationType.RESUME_ERROR_AFTER_PAYMENT:
      return "#ef4444";
    default:
      return COLORS.primary;
  }
}

function formatTime(timestamp: string) {
  const date = new Date(timestamp);
  const now = new Date();
  const diff = Math.floor((now.getTime() - date.getTime()) / 1000);
  if (diff < 60) return "Just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

const NotificationsPage = () => {
  const navigate = useNavigate();
  const {
    notifications,
    total,
    totalPages,
    currentPage,
    unreadCount,
    loading,
    error,
    activeTab,
    switchTab,
    goToPage,
    markAsRead,
    markAllAsRead,
  } = usePaginatedNotifications();

  const handleClick = (notification: (typeof notifications)[0]) => {
    if (!notification.is_read) markAsRead(notification.id);
    if (notification.data?.chat_id) navigate("/chats");
  };

  return (
    <div
      className="min-h-screen pt-20 pb-10 px-4 md:px-8"
      style={{
        fontFamily: TYPOGRAPHY.fontFamily.body,
        backgroundColor: COLORS.dark,
      }}
    >
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center justify-between mb-6"
        >
          <div>
            <h1
              className="text-4xl font-bold text-white mb-2"
              style={{ fontFamily: TYPOGRAPHY.fontFamily.heading }}
            >
              Notifications
            </h1>
            <p className="text-white/60">
              {total === 0
                ? "No notifications yet"
                : `${total} notification${total !== 1 ? "s" : ""}`}
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

        {/* Tabs */}
        <div className="flex gap-2 mb-6 overflow-x-auto">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => switchTab(tab.key)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all whitespace-nowrap ${
                activeTab === tab.key
                  ? "bg-white/20 text-white"
                  : "text-white/50 hover:text-white/80 hover:bg-white/5"
              }`}
            >
              <Icon icon={tab.icon} className="text-lg" />
              {tab.label}
              {tab.key === "unread" && unreadCount > 0 && (
                <span className="bg-red-500 text-white text-xs rounded-full px-1.5 py-0.5 min-w-5 text-center">
                  {unreadCount > 99 ? "99+" : unreadCount}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Loading state */}
        {loading && (
          <div className="flex justify-center py-20">
            <Icon
              icon="solar:spinner-bold-duotone"
              className="text-4xl text-white/40 animate-spin"
            />
          </div>
        )}

        {/* Error state */}
        {error && !loading && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-center py-20"
          >
            <Icon
              icon="solar:danger-circle-bold-duotone"
              className="text-6xl text-red-400/60 mx-auto mb-4"
            />
            <p className="text-white/60 text-lg">{error}</p>
          </motion.div>
        )}

        {/* Empty state */}
        {!loading && !error && notifications.length === 0 && (
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
        )}

        {/* Notification list */}
        {!loading && !error && notifications.length > 0 && (
          <div className="space-y-3">
            {notifications.map((notification, index) => (
              <motion.div
                key={notification.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.03 }}
                onClick={() => handleClick(notification)}
                className={`group relative p-5 rounded-2xl border transition-all cursor-pointer ${
                  notification.is_read
                    ? "border-white/5 bg-white/[0.02]"
                    : "border-white/10 bg-white/5 hover:bg-white/10"
                }`}
              >
                <div className="flex gap-4">
                  {/* Icon */}
                  <div
                    className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
                    style={{
                      backgroundColor: `${getNotificationColor(notification.type as NotificationType)}20`,
                    }}
                  >
                    <Icon
                      icon={getNotificationIcon(notification.type as NotificationType)}
                      className="text-2xl"
                      style={{ color: getNotificationColor(notification.type as NotificationType) }}
                    />
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3
                        className={`text-white font-semibold truncate ${
                          notification.is_read ? "text-white/60" : ""
                        }`}
                      >
                        {notification.title}
                      </h3>
                      {!notification.is_read && (
                        <span className="w-2 h-2 rounded-full bg-blue-500 flex-shrink-0" />
                      )}
                    </div>
                    <p
                      className={`text-sm mb-2 ${
                        notification.is_read ? "text-white/40" : "text-white/70"
                      }`}
                    >
                      {notification.message}
                    </p>
                    <span className="text-white/40 text-xs">
                      {formatTime(notification.created_at)}
                    </span>
                  </div>

                  {/* Arrow */}
                  <div className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity self-center">
                    <Icon
                      icon="solar:alt-arrow-right-bold"
                      className="text-white/40 text-xl"
                    />
                  </div>
                </div>
              </motion.div>
            ))}

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-2 pt-4 pb-8">
                <button
                  onClick={() => goToPage(currentPage - 1)}
                  disabled={currentPage <= 1}
                  className="p-2 rounded-xl text-white/50 hover:text-white hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                >
                  <Icon icon="solar:alt-arrow-left-bold" className="text-xl" />
                </button>

                {Array.from({ length: totalPages }, (_, i) => i + 1)
                  .filter((p) => {
                    const delta = Math.abs(p - currentPage);
                    return delta === 0 || delta === 1 || p === 1 || p === totalPages;
                  })
                  .map((p, idx, arr) => (
                    <span key={p} className="flex items-center gap-2">
                      {idx > 0 && arr[idx - 1] !== p - 1 && (
                        <span className="text-white/30 px-1">...</span>
                      )}
                      <button
                        onClick={() => goToPage(p)}
                        className={`w-9 h-9 rounded-xl text-sm font-semibold transition-all ${
                          p === currentPage
                            ? "bg-white/20 text-white"
                            : "text-white/50 hover:text-white hover:bg-white/10"
                        }`}
                      >
                        {p}
                      </button>
                    </span>
                  ))}

                <button
                  onClick={() => goToPage(currentPage + 1)}
                  disabled={currentPage >= totalPages}
                  className="p-2 rounded-xl text-white/50 hover:text-white hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                >
                  <Icon icon="solar:alt-arrow-right-bold" className="text-xl" />
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default NotificationsPage;
