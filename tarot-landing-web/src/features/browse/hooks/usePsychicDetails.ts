import { useQuery } from "@tanstack/react-query";
import { psychicsApi } from "../api/psychicsApi";
import { reviewsApi } from "../api/reviewsApi";
import { getChats } from "@/features/chat/api/chatApi";

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
      reviewsApi.getPsychicReviews(psychicId!, page * perPage, perPage),
    enabled: !!psychicId,
  });
};

export const useMyReviews = (enabled: boolean = true) => {
  return useQuery({
    queryKey: ["my-reviews"],
    queryFn: () => reviewsApi.getMyReviews(),
    enabled,
  });
};

export const useChats = (enabled: boolean = true) => {
  return useQuery({
    queryKey: ["chats"],
    queryFn: getChats,
    enabled,
  });
};
