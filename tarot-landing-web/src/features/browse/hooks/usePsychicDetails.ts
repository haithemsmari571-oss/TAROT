import { useQuery } from "@tanstack/react-query";
import { psychicsApi } from "../api/psychicsApi";
import { reviewsApi } from "../api/reviewsApi";
import { getChats } from "@/features/chat/api/chatApi";
import { useMutation, useQueryClient } from "@tanstack/react-query";

export const usePsychicDetails = (psychicId: number | undefined) => {
  return useQuery({
    queryKey: ["psychic", psychicId],
    queryFn: () => psychicsApi.getPsychicById(psychicId!),
    enabled: !!psychicId,
  });
};

export const usePsychicReviewSummary = (psychicId: number | undefined) => {
  return useQuery({
    queryKey: ["psychic-review-summary", psychicId],
    queryFn: () => reviewsApi.getPsychicReviewSummary(psychicId!),
    enabled: !!psychicId,
  });
};

export const usePsychicReviews = (
  psychicId: number | undefined,
  page: number,
  perPage: number
) => {
  return useQuery({
    queryKey: ["psychic-reviews", psychicId, page, perPage],
    queryFn: () =>
      reviewsApi.getPsychicReviews(psychicId!, page * perPage, perPage).then((d) => d ?? []),
    enabled: !!psychicId,
  });
};

export const useMyReviews = (enabled: boolean = true) => {
  return useQuery({
    queryKey: ["my-reviews"],
    queryFn: () => reviewsApi.getMyReviews().then((d) => d ?? []),
    enabled,
  });
};

export const useChats = (enabled: boolean = true) => {
  return useQuery({
    queryKey: ["chats"],
    queryFn: () => getChats().then((d) => d ?? []),
    enabled,
  });
};
export const useUpdatePsychicOrder = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ psychicId, newOrder }: { psychicId: number; newOrder: number }) =>
      psychicsApi.updatePsychic(psychicId, { order: newOrder }),
    
    onSuccess: (_, variables) => {
      // Instantly refresh lists and specific details so the new order reflects everywhere
      queryClient.invalidateQueries({ queryKey: ["psychics"] });
      queryClient.invalidateQueries({ queryKey: ["psychic", variables.psychicId] });
    },
  });
};