import { useQuery } from "@tanstack/react-query";
import { getSanctuaryBrowseItems } from "../api/libraryItemsApi";
import type { SanctuaryBrowseItem } from "../api/libraryItemsApi";

interface UseLibraryItemsReturn {
  items: SanctuaryBrowseItem[];
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

export const useLibraryItems = (): UseLibraryItemsReturn => {
  const { data, isLoading, error, refetch } = useQuery<SanctuaryBrowseItem[], Error>({
    queryKey: ["library-items"],
    queryFn: getSanctuaryBrowseItems,
    staleTime: 60_000,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    refetchOnMount: true,
    retry: 2,
  });

  return {
    items: data || [],
    loading: isLoading,
    error: error?.message || null,
    refetch: () => {
      refetch();
    },
  };
};
