import { useQuery } from "@tanstack/react-query";
import { getChats, Chat } from "../api/chatApi";

interface UseChatsReturn {
  chats: Chat[];
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

/**
 * Hook to fetch chats based on user role:
 * - PSYCHIC: Only their chats (where they are the psychic)
 * - ADMIN/SUPERADMIN: All chats in the system
 * - USER: Their chats (where they are the client)
 * 
 * Uses React Query for automatic caching and background refetching
 */
export const useChats = (): UseChatsReturn => {
  const { data, isLoading, error, refetch } = useQuery<Chat[], Error>({
    queryKey: ["chats"],
    queryFn: getChats,
    staleTime: 0, // Always consider data stale - refetch on invalidation
    refetchOnWindowFocus: true, // Refetch when user focuses window
    refetchOnReconnect: true, // Refetch when internet reconnects
    refetchOnMount: true, // Refetch when component mounts
    retry: 2,
  });

  return {
    chats: data || [],
    loading: isLoading,
    error: error?.message || null,
    refetch: () => {
      refetch();
    },
  };
};
