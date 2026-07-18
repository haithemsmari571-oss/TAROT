import { useQuery } from "@tanstack/react-query";
import {
  getChatDetails,
  getDraftGenerating,
  getPendingDrafts,
} from "../api/chatApi";

/**
 * Whether DraftReviewPanel would render anything — the exact mirror of its own
 * "nothing to show" null-check (a pending draft, a generation in flight, or the
 * Hybrid manual entry point), for parents that reserve layout (a side pane) for it.
 * Uses the same query keys as the panel, so react-query dedupes to the same requests.
 */
export const useDraftPanelVisible = (chatId: number | null, active: boolean) => {
  const { data: chatDetails } = useQuery({
    queryKey: ["responseMode", chatId],
    queryFn: () => getChatDetails(chatId!),
    enabled: !!chatId,
  });
  const { data: pendingDrafts } = useQuery({
    queryKey: ["chatDrafts", chatId],
    queryFn: () => getPendingDrafts(chatId!),
    enabled: !!chatId && active,
    refetchInterval: 4000,
  });
  const { data: generatingData } = useQuery({
    queryKey: ["draftGenerating", chatId],
    queryFn: () => getDraftGenerating(chatId!),
    enabled: !!chatId && active,
    refetchInterval: 2500,
  });
  return (
    (pendingDrafts?.length ?? 0) > 0 ||
    !!generatingData?.generating ||
    (chatDetails?.response_mode === "HYBRID" && active)
  );
};
