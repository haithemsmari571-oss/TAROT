import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { COLORS } from "../../../theme";
import { getChatDetails, setResponseMode, ResponseMode } from "../api/chatApi";
import { useToast } from "../../../components/Toast/useToast";
import { apiErrorDetail } from "../api/apiError";

/**
 * Per-conversation response-mode switcher: Human / Hybrid / Sabri.
 *
 * The SAME control on the admin chat detail page and the Glass cockpit — extracted so
 * there is one source of truth. Self-contained: owns its chat-details query and the
 * PUT /chat/{id}/response-mode mutation (auth: admins or the assigned reader; the
 * backend also cancels in-flight AI turns on a switch away from Sabri).
 */
export const ResponseModeSwitcher = ({
  chatId,
  className = "",
}: {
  chatId: number;
  className?: string;
}) => {
  const toast = useToast();
  const queryClient = useQueryClient();

  const { data } = useQuery({
    queryKey: ["responseMode", chatId],
    queryFn: () => getChatDetails(chatId),
    enabled: !!chatId,
  });
  const responseMode: ResponseMode = (data?.response_mode as ResponseMode) || "SABRI";

  const setModeMutation = useMutation({
    mutationFn: (mode: ResponseMode) => setResponseMode(chatId, mode),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["responseMode", chatId] });
      // The admin detail page keeps its own chatDetails query — refresh those too.
      queryClient.invalidateQueries({ queryKey: ["chatDetails"] });
    },
    onError: (error: unknown) => {
      toast.error(apiErrorDetail(error) || "Failed to change mode");
    },
  });

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <span
        className="text-xs font-bold uppercase tracking-wider"
        style={{ color: COLORS.neutralGray }}
      >
        Replies:
      </span>
      <div
        className="flex rounded-xl overflow-hidden border"
        style={{ borderColor: `${COLORS.primary}40` }}
      >
        {(["HUMAN", "HYBRID", "SABRI"] as ResponseMode[]).map((mode) => {
          const active = responseMode === mode;
          const label = mode === "HUMAN" ? "Human" : mode === "HYBRID" ? "Hybrid" : "Sabri";
          return (
            <button
              key={mode}
              onClick={() => !active && setModeMutation.mutate(mode)}
              disabled={setModeMutation.isPending}
              title={
                mode === "HUMAN"
                  ? "You type every reply (no AI)"
                  : mode === "HYBRID"
                    ? "Valentina drafts — you review & send (Sabri is skipped)"
                    : "AI drafts, Sabri checks, auto-sends on a clean pass"
              }
              className="px-3 py-1.5 text-xs font-bold uppercase tracking-wider transition-all disabled:opacity-50"
              style={{
                background: active
                  ? `linear-gradient(135deg, ${COLORS.primary} 0%, ${COLORS.secondary} 100%)`
                  : "transparent",
                color: active ? COLORS.neutralWhite : COLORS.neutralGray,
              }}
            >
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
};
