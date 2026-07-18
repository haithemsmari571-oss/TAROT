import { useState } from "react";
import { motion } from "framer-motion";
import { Icon } from "@iconify/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { COLORS } from "../../../theme";
import {
  discardDraft,
  generateDraft,
  getChatDetails,
  getDraftGenerating,
  getPendingDrafts,
  sendDraft,
} from "../api/chatApi";
import { useToast } from "../../../components/Toast/useToast";
import { apiErrorDetail } from "../api/apiError";
import { useReaderTypingSignal } from "../hooks/useReaderTypingSignal";

/**
 * AI draft review panel — PENDING Valentina drafts awaiting a human decision (hybrid
 * mode, or an automatic-mode draft that fell back for manual review). The SAME panel on
 * the admin chat detail page and the Glass cockpit. Self-contained:
 *   * polls GET /drafts every 4s while the reading is live, and shows EVERY pending
 *     draft — "Draft N of M" with previous/next stepping when more than one is queued;
 *   * polls GET /drafts/generating every 2.5s and shows "Valentina is writing…" from the
 *     moment a client message lands until the draft is ready (or the attempt dies) — so
 *     there is never a silent gap where nothing on screen shows work happening;
 *   * offers a manual "New reply" button on Hybrid chats (POST /drafts/generate — the
 *     same underlying turn the automatic trigger runs).
 * Nothing here reaches the client; a draft only sends via "Send as reader".
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
  // The client sees "Valentina is typing…" while the operator edits a draft here.
  const readerTyping = useReaderTypingSignal(chatId);
  // Editable text of the AI draft currently shown in the review box.
  const [draftText, setDraftText] = useState("");
  const [activeDraftId, setActiveDraftId] = useState<number | null>(null);

  // Same query key as ResponseModeSwitcher -> react-query dedupes to one request.
  const { data: chatDetails } = useQuery({
    queryKey: ["responseMode", chatId],
    queryFn: () => getChatDetails(chatId),
    enabled: !!chatId,
  });
  const isHybrid = chatDetails?.response_mode === "HYBRID";

  const { data: pendingDrafts } = useQuery({
    queryKey: ["chatDrafts", chatId],
    queryFn: () => getPendingDrafts(chatId),
    enabled: !!chatId && active,
    refetchInterval: 4000,
  });
  // API returns newest-first; display oldest-first so "Draft 1" is the oldest.
  const drafts = pendingDrafts ? [...pendingDrafts].slice().reverse() : [];

  const { data: generatingData } = useQuery({
    queryKey: ["draftGenerating", chatId],
    queryFn: () => getDraftGenerating(chatId),
    enabled: !!chatId && active,
    refetchInterval: 2500,
  });
  const generating = !!generatingData?.generating;

  // The shown draft sticks by ID while the list changes underneath (a new arrival must
  // never yank the operator's edit); a vanished/unset selection falls back to the newest.
  const shownIndex = drafts.findIndex((d) => d.id === activeDraftId);
  const currentDraft = shownIndex >= 0 ? drafts[shownIndex] : drafts[drafts.length - 1] ?? null;

  // Load the shown draft into the editable box (render-time derived-state pattern).
  if (currentDraft && currentDraft.id !== activeDraftId) {
    setActiveDraftId(currentDraft.id);
    setDraftText(currentDraft.draft_text);
  }
  const currentIndex = currentDraft ? drafts.findIndex((d) => d.id === currentDraft.id) : -1;

  // Stepping loads the target draft's text (unsaved edits to the previous one are let go).
  const stepTo = (index: number) => {
    const target = drafts[index];
    if (target) {
      setActiveDraftId(target.id);
      setDraftText(target.draft_text);
    }
  };

  const sendDraftMutation = useMutation({
    mutationFn: ({ draftId, content }: { draftId: number; content: string }) =>
      sendDraft(chatId, draftId, content),
    onSuccess: () => {
      readerTyping.stop();
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
      readerTyping.stop();
      setActiveDraftId(null);
      setDraftText("");
      queryClient.invalidateQueries({ queryKey: ["chatDrafts", chatId] });
    },
  });

  const generateMutation = useMutation({
    mutationFn: () => generateDraft(chatId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["draftGenerating", chatId] });
    },
    onError: (error: unknown) => {
      toast.error(apiErrorDetail(error) || "Failed to start a new draft");
    },
  });

  // Nothing to show: no draft, nothing generating, and no manual entry point (non-Hybrid).
  if (!currentDraft && !generating && !(isHybrid && active)) return null;

  const writingIndicator = (
    <span className="flex items-center gap-1.5 text-xs" style={{ color: COLORS.secondary }}>
      <Icon icon="eos-icons:three-dots-loading" width={22} height={22} />
      Valentina is writing…
    </span>
  );

  const generateButton = isHybrid && active && (
    <button
      onClick={() => generateMutation.mutate()}
      disabled={generating || generateMutation.isPending}
      title="Generate a fresh draft for the client's latest message"
      className="px-3 py-1.5 rounded-xl text-[11px] font-bold uppercase tracking-wider transition-all disabled:opacity-40 flex items-center gap-1.5 border"
      style={{
        background: "transparent",
        borderColor: `${COLORS.secondary}50`,
        color: COLORS.secondary,
      }}
    >
      <Icon icon="mdi:autorenew" width={14} height={14} />
      New reply
    </button>
  );

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
      <div className="flex items-center justify-between mb-2 gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <Icon icon="mdi:robot-outline" width={18} height={18} color={COLORS.secondary} />
          <span
            className="text-xs font-bold uppercase tracking-wider"
            style={{ color: COLORS.secondary }}
          >
            Valentina draft
          </span>
          {currentDraft && (
            <span
              className="text-[10px] px-2 py-0.5 rounded-md font-bold uppercase tracking-wider"
              style={{
                background: currentDraft.sabri_passed
                  ? `${COLORS.success}25`
                  : `${COLORS.warning}25`,
                color: currentDraft.sabri_passed ? COLORS.success : COLORS.warning,
              }}
            >
              {currentDraft.sabri_passed ? "Checks passed" : "Needs your review"}
            </span>
          )}
          {generating && writingIndicator}
        </div>
        <div className="flex items-center gap-2">
          {drafts.length > 1 && currentIndex >= 0 && (
            <div className="flex items-center gap-1">
              <button
                onClick={() => stepTo(currentIndex - 1)}
                disabled={currentIndex <= 0}
                title="Previous draft"
                className="px-1.5 py-1 rounded-lg transition-all disabled:opacity-30"
                style={{ background: `${COLORS.neutralDarkGray}40`, color: COLORS.neutralWhite }}
              >
                <Icon icon="mdi:chevron-left" width={16} height={16} />
              </button>
              <span
                className="text-[11px] font-bold tabular-nums px-1"
                style={{ color: COLORS.neutralGray }}
              >
                Draft {currentIndex + 1} of {drafts.length}
              </span>
              <button
                onClick={() => stepTo(currentIndex + 1)}
                disabled={currentIndex >= drafts.length - 1}
                title="Next draft"
                className="px-1.5 py-1 rounded-lg transition-all disabled:opacity-30"
                style={{ background: `${COLORS.neutralDarkGray}40`, color: COLORS.neutralWhite }}
              >
                <Icon icon="mdi:chevron-right" width={16} height={16} />
              </button>
            </div>
          )}
          {generateButton}
        </div>
      </div>

      {currentDraft ? (
        <>
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
            onChange={(e) => {
              setDraftText(e.target.value);
              readerTyping.onActivity();
            }}
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
        </>
      ) : (
        <div className="text-xs py-1" style={{ color: COLORS.neutralGray }}>
          {generating
            ? "A fresh draft is being written — it will appear here the moment it's ready."
            : "No draft pending. Use “New reply” to have Valentina draft a response to the client's latest message."}
        </div>
      )}
    </motion.div>
  );
};
