import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { getChatDetails } from "../api/chatApi";
import { useCockpitMode } from "../context/cockpitModeContext";
import type { CockpitMode } from "../../../styles/cockpitTheme";

/**
 * Publishes the open conversation's reply mode into CockpitModeContext so the
 * layout can theme itself (background effect + accent variables). Same query key
 * as ResponseModeSwitcher / DraftReviewPanel — react-query dedupes to one request,
 * and a mode switch reflects here the moment the switcher invalidates it.
 * Pass null (or unmount) to clear back to the no-conversation default.
 */
export const useCockpitModeSync = (chatId: number | null) => {
  const { setMode } = useCockpitMode();
  const { data } = useQuery({
    queryKey: ["responseMode", chatId],
    queryFn: () => getChatDetails(chatId!),
    enabled: !!chatId,
  });
  const mode = (data?.response_mode as CockpitMode | undefined) ?? null;

  useEffect(() => {
    setMode(chatId ? mode : null);
    return () => setMode(null);
  }, [chatId, mode, setMode]);
};
