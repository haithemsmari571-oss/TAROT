import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/features/auth/hooks";
import { useBillingMode } from "@/features/billing-mode/BillingModeContext";
import axiosClient from "@/lib/axiosClient";

interface InboxPage {
  items: { unread_count: number }[];
  has_more: boolean;
}

export function useInboxUnreadCount() {
  const { user } = useAuth();
  const { billingMode } = useBillingMode();

  return useQuery({
    queryKey: ["client-app-inbox-unread", user?.id],
    enabled: !!user && billingMode === "per_message",
    queryFn: async ({ signal }) => {
      let offset = 0;
      let unreadCount = 0;
      // A3 returns paginated threads, so include unread beyond the first page.
      while (true) {
        const { data } = await axiosClient.get<InboxPage>("/chat/inbox", {
          params: { offset, limit: 100 },
          signal,
        });
        unreadCount += data.items.reduce((sum, chat) => sum + chat.unread_count, 0);
        if (!data.has_more || data.items.length === 0) return unreadCount;
        offset += data.items.length;
      }
    },
    staleTime: 30_000,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });
}
