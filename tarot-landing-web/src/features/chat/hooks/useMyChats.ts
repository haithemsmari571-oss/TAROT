import { useQuery } from "@tanstack/react-query";
import { getMyChatsWithDetails } from "../api/chatApi";

interface UseMyChatsReturn {
  chats: any[];
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

/**
 * Hook to fetch chats with full user details for psychics/admins
 */
export const useMyChats = (): UseMyChatsReturn => {
  const { data, isLoading, error, refetch } = useQuery<any[], Error>({
    queryKey: ["my-chats"],
    queryFn: getMyChatsWithDetails,
    enabled: true,
    retry: 1,
    staleTime: 0,
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
