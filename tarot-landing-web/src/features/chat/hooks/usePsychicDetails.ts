import { useQuery } from "@tanstack/react-query";
import { getPsychicDetails, PsychicDetails } from "../api/chatApi";

/**
 * Hook to fetch psychic details by ID
 * Caches psychic data to avoid unnecessary refetches
 */
export const usePsychicDetails = (psychicId: number | undefined) => {
  return useQuery<PsychicDetails, Error>({
    queryKey: ["psychic", psychicId],
    queryFn: () => {
      if (!psychicId) throw new Error("Psychic ID is required");
      return getPsychicDetails(psychicId);
    },
    enabled: !!psychicId, // Only fetch when psychic ID exists
    staleTime: 1000 * 60 * 5, // Data is fresh for 5 minutes
    retry: 2,
  });
};
