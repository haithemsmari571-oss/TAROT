import { useState, useEffect, useCallback } from "react";
import {
  getNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  type GetNotificationsParams,
  type PaginatedNotifications,
} from "../api/notificationApi";

export type NotificationTab = "all" | "unread" | "chats" | "payments";

const TAB_PARAMS: Record<NotificationTab, GetNotificationsParams> = {
  all: {},
  unread: { tab: "unread" },
  chats: { tab: "chats" },
  payments: { tab: "payments" },
};

export function usePaginatedNotifications() {
  const [data, setData] = useState<PaginatedNotifications | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<NotificationTab>("all");
  const [page, setPage] = useState(1);
  const limit = 20;

  const fetch = useCallback(
    async (tab: NotificationTab, pageNum: number) => {
      setLoading(true);
      setError(null);
      try {
        const result = await getNotifications({
          ...TAB_PARAMS[tab],
          page: pageNum,
          limit,
        });
        setData(result);
      } catch {
        setError("Failed to load notifications");
      } finally {
        setLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    fetch(activeTab, page);
  }, [activeTab, page, fetch]);

  // Poll for new notifications every 10s when on page 1
  useEffect(() => {
    if (page !== 1) return;
    const interval = setInterval(() => fetch(activeTab, 1), 10_000);
    return () => clearInterval(interval);
  }, [activeTab, page, fetch]);

  const switchTab = useCallback((tab: NotificationTab) => {
    setActiveTab(tab);
    setPage(1);
  }, []);

  const goToPage = useCallback(
    (p: number) => {
      if (data && p >= 1 && p <= data.total_pages) setPage(p);
    },
    [data]
  );

  const markAsRead = useCallback(async (notificationId: number) => {
    await markNotificationRead(notificationId);
    setData((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        notifications: prev.notifications.map((n) =>
          n.id === notificationId ? { ...n, is_read: true } : n
        ),
        unread_count: Math.max(0, prev.unread_count - 1),
      };
    });
  }, []);

  const markAllAsRead = useCallback(async () => {
    await markAllNotificationsRead();
    setData((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        notifications: prev.notifications.map((n) => ({ ...n, is_read: true })),
        unread_count: 0,
      };
    });
  }, []);

  return {
    notifications: data?.notifications ?? [],
    total: data?.total ?? 0,
    totalPages: data?.total_pages ?? 1,
    currentPage: page,
    unreadCount: data?.unread_count ?? 0,
    loading,
    error,
    activeTab,
    switchTab,
    goToPage,
    markAsRead,
    markAllAsRead,
  };
}
