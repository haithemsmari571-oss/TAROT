import { useQuery } from "@tanstack/react-query";
import { getChatSessionTime, ChatSessionTime } from "../api/chatApi";

/**
 * Hook to fetch the current session duration and estimated cost for a chat
 * Only fetches when chat is active
 */
export const useChatSessionTime = (chatId: number | null, isActive: boolean) => {
  return useQuery<ChatSessionTime, Error>({
    queryKey: ["chatSessionTime", chatId],
    queryFn: () => {
      if (!chatId) throw new Error("Chat ID is required");
      return getChatSessionTime(chatId);
    },
    enabled: !!chatId && isActive, // Only fetch when chat ID exists and chat is active
    staleTime: 1000 * 5, // Data is fresh for 5 seconds
    refetchInterval: 1000 * 10, // Refetch every 10 seconds to update time
    retry: 1,
  });
};
