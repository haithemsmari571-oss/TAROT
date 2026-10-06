import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/features/auth/hooks";
import { useBillingMode } from "@/features/billing-mode/BillingModeContext";
import axiosClient from "@/lib/axiosClient";

export interface InboxConversation {
  chat_id: number;
  reader: {
    id: number;
    display_name: string;
    profile_picture_url: string | null;
    is_online: boolean;
    next_online_at: string | null;
  };
  last_message: {
    id: number;
    text: string;
    sent_by: "client" | "reader" | "system";
    created_at: string;
  } | null;
  last_activity_at: string;
  unread_count: number;
  client_last_message_state: "sent" | "delivered" | "seen" | null;
}
interface InboxPage {
  items: InboxConversation[];
  total: number;
  offset: number;
  limit: number;
  has_more: boolean;
}

/* One page of GET /chat/inbox, newest activity first: the Chats list's pages,
   and the sheets' look for the reader she last wrote to (AppSheets.tsx). */
export async function getInboxPage(offset: number, signal?: AbortSignal): Promise<InboxPage> {
  return (await axiosClient.get<InboxPage>("/chat/inbox", { params: { offset, limit: 20 }, signal })).data;
}

export function useClientInbox() {
  const { user } = useAuth();
  const { billingMode } = useBillingMode();
  const queryClient = useQueryClient();
  return useInfiniteQuery({
    queryKey: ["client-inbox", user?.id],
    // Per-message unless the server says per-minute (BillingModeContext.tsx).
    enabled: !!user && billingMode !== "per_minute",
    initialPageParam: 0,
    queryFn: async ({ pageParam, signal }) => {
      const data = await getInboxPage(pageParam, signal);
      // When this page is the entire inbox, its exact conversation count also
      // keeps the tab badge current without waiting for the badge's next poll.
      if (pageParam === 0 && !data.has_more) {
        queryClient.setQueryData(["client-app-inbox-unread", user?.id], data.items.filter(item => item.unread_count > 0).length);
      }
      return data;
    },
    getNextPageParam: page => page.has_more && page.items.length > 0 ? page.offset + page.items.length : undefined,
    // Refresh only the pages already visited. A newly arrived reply can move up
    // from any older thread because the server orders each page by activity.
    refetchInterval: 15_000,
    refetchOnWindowFocus: true,
    refetchOnMount: "always",
  });
}
