/* The API's unread notification count, for the You tab's Notifications row
   (ClientYouScreen.tsx). GET /notifications/ answers unread_count beside the
   page it lists (notificationApi.ts, PaginatedNotifications); one item is
   asked for and only the count is kept. It is asked again on the
   Notifications page's own cadence (NOTIFICATIONS_POLL_MS, lifted from
   usePaginatedNotifications.ts) and whenever the notification socket's
   session count moves, so a top-up or a gift arriving while the app is open
   shows at once. The old site header's bell keeps its session count
   (NotificationBell.tsx, NotificationContext.tsx:88); nothing here changes it. */
import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/features/auth/hooks";
import { getNotifications } from "@/features/notifications/api/notificationApi";
import { useNotifications } from "@/features/notifications/hooks";
import { NOTIFICATIONS_POLL_MS } from "@/features/notifications/hooks/usePaginatedNotifications";

export function useNotificationsUnreadCount() {
  const { user } = useAuth();
  const { unreadCount: arrivedCount } = useNotifications();

  const query = useQuery({
    queryKey: ["client-app-notifications-unread", user?.id],
    enabled: !!user,
    queryFn: async () => (await getNotifications({ page: 1, limit: 1 })).unread_count,
    refetchInterval: NOTIFICATIONS_POLL_MS,
  });

  // The context's count moves when a notification arrives over the socket or
  // the header marks its own read; the API is asked again on that move, not
  // on mount, which the query itself already covers.
  const { refetch } = query;
  const seen = useRef(arrivedCount);
  useEffect(() => {
    if (seen.current === arrivedCount) return;
    seen.current = arrivedCount;
    void refetch();
  }, [arrivedCount, refetch]);

  return query;
}
