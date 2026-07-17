import { useState } from "react";
import { motion } from "framer-motion";
import { Icon } from "@iconify/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { COLORS } from "../../../theme";
import { discardDraft, getPendingDrafts, sendDraft } from "../api/chatApi";
import { useToast } from "../../../components/Toast/useToast";
import { apiErrorDetail } from "../api/apiError";

/**
 * AI draft review panel — a PENDING Valentina draft awaiting a human decision (hybrid
 * mode, or a sabri-mode draft that fell back for manual review). The SAME panel on the
 * admin chat detail page and the Glass cockpit — extracted so there is one source of
 * truth. Self-contained: polls GET /chat/{id}/drafts every 4s while the reading is live,
 * and owns the send/discard mutations. Renders nothing when no draft is pending — the
 * client never sees any of this; a draft only reaches the client via "Send as reader".
 */
export const DraftReviewPanel = ({
  chatId,
  active,
  className = "",
}: {
  chatId: number;
  /** Poll only while the reading is live (chat status ACTIVE). */
  active: boolean;
  className?: string;
}) => {
  const toast = useToast();
  const queryClient = useQueryClient();
  // Editable text of the AI draft currently shown in the review box.
  const [draftText, setDraftText] = useState("");
  const [activeDraftId, setActiveDraftId] = useState<number | null>(null);

  const { data: pendingDrafts } = useQuery({
    queryKey: ["chatDrafts", chatId],
    queryFn: () => getPendingDrafts(chatId),
    enabled: !!chatId && active,
    refetchInterval: 4000,
  });
  const currentDraft = pendingDrafts && pendingDrafts.length > 0 ? pendingDrafts[0] : null;

  // Send the (optionally edited) AI draft as the reader.
  const sendDraftMutation = useMutation({
    mutationFn: ({ draftId, content }: { draftId: number; content: string }) =>
      sendDraft(chatId, draftId, content),
    onSuccess: () => {
      setActiveDraftId(null);
      setDraftText("");
      queryClient.invalidateQueries({ queryKey: ["chatDrafts", chatId] });
      toast.success("Draft sent");
    },
    onError: (error: unknown) => {
      toast.error(apiErrorDetail(error) || "Failed to send draft");
    },
  });

  const discardDraftMutation = useMutation({
    mutationFn: (draftId: number) => discardDraft(chatId, draftId),
    onSuccess: () => {
      setActiveDraftId(null);
      setDraftText("");
      queryClient.invalidateQueries({ queryKey: ["chatDrafts", chatId] });
    },
  });

  // Load a newly-arrived draft into the editable review box. Render-time state
  // adjustment (React's documented derived-state pattern) — re-renders immediately
  // without the cascading-effect setState the hooks lint flags.
  if (currentDraft && currentDraft.id !== activeDraftId) {
    setActiveDraftId(currentDraft.id);
    setDraftText(currentDraft.draft_text);
  }

  if (!currentDraft) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={`relative z-10 p-4 rounded-2xl border backdrop-blur-xl ${className}`}
      style={{
        background: `linear-gradient(135deg, ${COLORS.secondary}20 0%, ${COLORS.primary}10 100%)`,
        borderColor: `${COLORS.secondary}50`,
      }}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Icon icon="mdi:robot-outline" width={18} height={18} color={COLORS.secondary} />
          <span
            className="text-xs font-bold uppercase tracking-wider"
            style={{ color: COLORS.secondary }}
          >
            Valentina draft
          </span>
          <span
            className="text-[10px] px-2 py-0.5 rounded-md font-bold uppercase tracking-wider"
            style={{
              background: currentDraft.sabri_passed
                ? `${COLORS.success}25`
                : `${COLORS.warning}25`,
              color: currentDraft.sabri_passed ? COLORS.success : COLORS.warning,
            }}
          >
            {currentDraft.sabri_passed ? "Sabri: passed" : "Sabri: needs review"}
          </span>
          <span className="text-[10px]" style={{ color: COLORS.neutralGray }}>
            {currentDraft.attempts} attempt{currentDraft.attempts === 1 ? "" : "s"}
          </span>
        </div>
      </div>

      {currentDraft.sabri_flags.length > 0 && (
        <ul className="mb-2 space-y-1">
          {currentDraft.sabri_flags.map((flag, i) => (
            <li
              key={i}
              className="text-xs flex items-start gap-1.5"
              style={{ color: COLORS.warning }}
            >
              <Icon icon="mdi:alert-circle-outline" width={14} height={14} className="mt-0.5" />
              <span>{flag}</span>
            </li>
          ))}
        </ul>
      )}

      <textarea
        value={draftText}
        onChange={(e) => setDraftText(e.target.value)}
        rows={3}
        className="w-full px-4 py-3 rounded-xl border resize-none outline-none text-sm"
        style={{
          background: `${COLORS.dark}80`,
          borderColor: `${COLORS.neutralDarkGray}50`,
          color: COLORS.neutralWhite,
        }}
      />

      <div className="flex items-center justify-end gap-3 mt-3">
        <button
          onClick={() => discardDraftMutation.mutate(currentDraft.id)}
          disabled={discardDraftMutation.isPending}
          className="px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all disabled:opacity-50"
          style={{ background: `${COLORS.neutralDarkGray}50`, color: COLORS.neutralGray }}
        >
          Discard
        </button>
        <button
          onClick={() =>
            draftText.trim() &&
            sendDraftMutation.mutate({ draftId: currentDraft.id, content: draftText.trim() })
          }
          disabled={!draftText.trim() || sendDraftMutation.isPending}
          className="px-5 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all disabled:opacity-50 flex items-center gap-2"
          style={{
            background: `linear-gradient(135deg, ${COLORS.primary} 0%, ${COLORS.secondary} 100%)`,
            color: COLORS.neutralWhite,
          }}
        >
          <Icon
            icon={sendDraftMutation.isPending ? "eos-icons:loading" : "mdi:send"}
            width={16}
            height={16}
          />
          {sendDraftMutation.isPending ? "Sending..." : "Send as reader"}
        </button>
      </div>
    </motion.div>
  );
};
