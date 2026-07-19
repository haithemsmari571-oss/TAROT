import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Icon } from "@iconify/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { COLORS, PERSONAS } from "../../../theme";
import {
  addSteeringNote,
  discardDraft,
  generateDraft,
  getChatDetails,
  getDraftGenerating,
  getPendingDrafts,
  getSteeringNotes,
  retireSteeringNote,
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
  fill = false,
  variant = "card",
}: {
  chatId: number;
  /** Poll only while the reading is live (chat status ACTIVE). */
  active: boolean;
  className?: string;
  /** Fill the parent column: the panel stretches to full height and the draft
      textarea takes the spare space, so a typical draft reads without scrolling.
      The draft is the focal point of the screen whenever one is pending. */
  fill?: boolean;
  /** Visual chrome: "card" = the original glass card (admin detail page);
      "oracle" = the Glass cockpit's tarot-card console — gold-ornamented frame,
      editorial Valentina title, ink-on-card draft text, gold-to-crimson send
      bar. Identical logic/behaviour in both. */
  variant?: "card" | "oracle";
}) => {
  const toast = useToast();
  const queryClient = useQueryClient();
  // The client sees "Valentina is typing…" while the operator edits a draft here.
  const readerTyping = useReaderTypingSignal(chatId);
  // Editable text of the AI draft currently shown in the review box.
  const [draftText, setDraftText] = useState("");
  const [activeDraftId, setActiveDraftId] = useState<number | null>(null);
  // Task-C moments (motion tokens from cockpit.css; reduced-motion statics both):
  // a NEW draft arriving plays fade-slide-in + a brief glow pulse; a successful
  // send flashes a check before the panel advances.
  const [arrivalAnim, setArrivalAnim] = useState(false);
  const [justSent, setJustSent] = useState(false);
  const lastNewestDraftId = useRef<number | null>(null);

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

  // A draft the panel has not seen before landing at the top of the queue is the
  // "new draft arrived" moment. Only the very first effect run is exempt (opening a
  // panel onto already-queued drafts must not animate) — after that ANY change,
  // including empty-queue -> first draft, plays the arrival.
  const newestDraftId = drafts.length > 0 ? drafts[drafts.length - 1].id : null;
  const arrivalInitialized = useRef(false);
  useEffect(() => {
    if (!arrivalInitialized.current) {
      arrivalInitialized.current = true;
      lastNewestDraftId.current = newestDraftId;
      return;
    }
    if (newestDraftId == null || newestDraftId === lastNewestDraftId.current) {
      lastNewestDraftId.current = newestDraftId;
      return;
    }
    lastNewestDraftId.current = newestDraftId;
    setArrivalAnim(true);
    const t = setTimeout(() => setArrivalAnim(false), 1400);
    return () => clearTimeout(t);
  }, [newestDraftId]);

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
      // Success flash before the panel clears/advances (no-op if unmounted).
      setJustSent(true);
      setTimeout(() => setJustSent(false), 900);
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

  // ── Operator steering notes (Hybrid-only, session-scoped) ──
  // Guidance Valentina weighs on every following draft this session; chips show
  // what's active, one tap retires. The backend refuses notes outside Hybrid
  // and expires them with the session — the panel just reflects that.
  const [noteText, setNoteText] = useState("");
  const { data: steeringNotes } = useQuery({
    queryKey: ["steeringNotes", chatId],
    queryFn: () => getSteeringNotes(chatId),
    enabled: !!chatId && active && isHybrid,
    refetchInterval: 8000,
  });
  const addNoteMutation = useMutation({
    mutationFn: (note: string) => addSteeringNote(chatId, note),
    onSuccess: () => {
      setNoteText("");
      queryClient.invalidateQueries({ queryKey: ["steeringNotes", chatId] });
    },
    onError: (error: unknown) => {
      toast.error(apiErrorDetail(error) || "Failed to save guidance");
    },
  });
  const retireNoteMutation = useMutation({
    mutationFn: (noteId: number) => retireSteeringNote(chatId, noteId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["steeringNotes", chatId] });
    },
  });
  const submitNote = () => {
    const text = noteText.trim();
    if (text && !addNoteMutation.isPending) addNoteMutation.mutate(text);
  };

  // Nothing to show: no draft, nothing generating, and no manual entry point (non-Hybrid).
  if (!currentDraft && !generating && !(isHybrid && active)) return null;

  const oracle = variant === "oracle";

  const writingIndicator = (
    <span
      className="flex items-center gap-1.5 text-xs"
      style={{ color: oracle ? "rgb(var(--oracle-rgb))" : COLORS.secondary }}
    >
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
        borderColor: oracle ? "rgba(var(--oracle-rgb), 0.45)" : `${COLORS.secondary}50`,
        color: oracle ? "rgb(var(--oracle-rgb))" : COLORS.secondary,
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
      className={`${oracle ? "oracle-card p-6" : "glass-panel p-4"} relative z-10 ${
        fill ? "flex flex-col min-h-0" : ""
      } ${arrivalAnim ? "anim-fade-slide-in anim-pulse-glow" : ""} ${className}`}
    >
      {oracle && <div className="oracle-corners absolute inset-0 pointer-events-none" />}
      {justSent && (
        <div
          className="anim-success-flash absolute inset-0 z-20 flex items-center justify-center pointer-events-none"
          style={{
            borderRadius: "var(--glass-radius)",
            background: "rgba(var(--success-rgb), 0.14)",
          }}
        >
          <Icon icon="mdi:check-circle" width={56} height={56} color={COLORS.success} />
        </div>
      )}
      {oracle ? (
        /* Oracle header: Valentina gets editorial weight — gold display name over a
           small-caps status line, crystal ball as her sigil, gold hairline below. */
        <div className="mb-4 shrink-0">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <Icon icon="mdi:crystal-ball" width={30} height={30} color="rgb(var(--oracle-rgb))" className="shrink-0" />
              <div className="min-w-0">
                <div className="text-oracle-title text-[26px] leading-none">Valentina</div>
                <div
                  className="text-[10px] font-bold uppercase tracking-[0.18em] mt-2 whitespace-nowrap"
                  style={{
                    color: currentDraft && !currentDraft.sabri_passed
                      ? COLORS.warning
                      : `rgba(var(--oracle-rgb), 0.80)`,
                  }}
                >
                  {currentDraft
                    ? currentDraft.sabri_passed
                      ? "Draft · checks passed"
                      : "Draft · needs your review"
                    : "Oracle console"}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 pt-1">
              {generateButton}
            </div>
          </div>
          {generating && <div className="mt-3">{writingIndicator}</div>}
          <div
            className="mt-4 h-px"
            style={{
              background:
                "linear-gradient(90deg, transparent 0%, rgba(var(--oracle-rgb), 0.55) 50%, transparent 100%)",
            }}
          />
        </div>
      ) : (
      <div className="flex items-center justify-between mb-2 gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <Icon icon="mdi:crystal-ball" width={18} height={18} color={COLORS.secondary} />
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
      )}

      {/* Oracle stepper: Draft Nº over the queue, gold ghost arrows. */}
      {oracle && drafts.length > 1 && currentIndex >= 0 && (
        <div className="flex items-center justify-end gap-2 mb-2 shrink-0">
          <button
            onClick={() => stepTo(currentIndex - 1)}
            disabled={currentIndex <= 0}
            title="Previous draft"
            className="px-1.5 py-1 rounded-lg transition-all disabled:opacity-30 border"
            style={{ borderColor: "rgba(var(--oracle-rgb), 0.35)", color: "rgb(var(--oracle-rgb))" }}
          >
            <Icon icon="mdi:chevron-left" width={15} height={15} />
          </button>
          <span
            className="text-[11px] font-bold uppercase tracking-[0.25em] tabular-nums"
            style={{ color: `rgba(var(--oracle-rgb), 0.80)` }}
          >
            Draft {currentIndex + 1} of {drafts.length}
          </span>
          <button
            onClick={() => stepTo(currentIndex + 1)}
            disabled={currentIndex >= drafts.length - 1}
            title="Next draft"
            className="px-1.5 py-1 rounded-lg transition-all disabled:opacity-30 border"
            style={{ borderColor: "rgba(var(--oracle-rgb), 0.35)", color: "rgb(var(--oracle-rgb))" }}
          >
            <Icon icon="mdi:chevron-right" width={15} height={15} />
          </button>
        </div>
      )}

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
            rows={fill ? 10 : 3}
            className={
              oracle
                ? `oracle-text w-full custom-scrollbar ${fill ? "flex-1 min-h-[30vh]" : ""}`
                : `w-full px-4 py-3 rounded-xl border resize-none outline-none text-[15px] leading-relaxed ${
                    fill ? "flex-1 min-h-[30vh]" : ""
                  }`
            }
            style={
              oracle
                ? undefined
                : {
                    background: `${COLORS.dark}80`,
                    borderColor: `${COLORS.neutralDarkGray}50`,
                    color: COLORS.neutralWhite,
                  }
            }
          />

          {oracle ? (
            /* Send is the unmistakable primary act: a full-width gold-to-crimson
               bar with a glow; Discard is a quiet ghost beside it. */
            <div className="flex items-center gap-3 mt-4 shrink-0">
              <button
                onClick={() => discardDraftMutation.mutate(currentDraft.id)}
                disabled={discardDraftMutation.isPending}
                className="px-4 py-3 rounded-xl text-xs font-bold uppercase tracking-wider transition-all disabled:opacity-50"
                style={{ color: COLORS.neutralGray, background: "transparent", border: `1px solid ${COLORS.neutralDarkGray}60` }}
              >
                Discard
              </button>
              <button
                onClick={() =>
                  draftText.trim() &&
                  sendDraftMutation.mutate({ draftId: currentDraft.id, content: draftText.trim() })
                }
                disabled={!draftText.trim() || sendDraftMutation.isPending}
                className="flex-1 px-5 py-3 rounded-xl text-sm font-black uppercase tracking-[0.15em] transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                style={{
                  background: `linear-gradient(100deg, rgb(var(--oracle-rgb)) 0%, rgb(var(--mode-accent-rgb)) 85%)`,
                  color: "#1A0D05",
                  boxShadow: "0 0 26px rgba(var(--oracle-rgb), 0.35), 0 4px 18px rgba(0,0,0,0.4)",
                }}
              >
                <Icon
                  icon={sendDraftMutation.isPending ? "eos-icons:loading" : "mdi:send"}
                  width={17}
                  height={17}
                />
                {sendDraftMutation.isPending ? "Sending..." : "Send as reader"}
              </button>
            </div>
          ) : (
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
          )}
        </>
      ) : (
        <div
          className={oracle ? "text-sm py-2 leading-relaxed" : "text-xs py-1"}
          style={{ color: oracle ? `${COLORS.neutralWhite}99` : COLORS.neutralGray }}
        >
          {generating
            ? "A fresh draft is being written — it will appear here the moment it's ready."
            : "No draft pending. Use “New reply” to have Valentina draft a response to the client's latest message."}
        </div>
      )}

      {/* Guidance for Valentina — Hybrid-only. Notes are session-scoped advisory
          context ("shorter", "don't mention the ex") that she weighs on every
          following draft; they expire when the session ends and never influence
          Automatic mode. */}
      {isHybrid && active && (
        <div
          className="mt-4 pt-3 shrink-0"
          style={{
            borderTop: oracle
              ? "1px solid rgba(var(--oracle-rgb), 0.18)"
              : `1px solid ${COLORS.neutralDarkGray}50`,
          }}
        >
          <div
            className="text-[10px] font-bold uppercase tracking-[0.18em] mb-2"
            style={{ color: oracle ? "rgba(var(--oracle-rgb), 0.75)" : COLORS.neutralGray }}
          >
            Guidance for Valentina
          </div>
          {(steeringNotes?.length ?? 0) > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-2">
              {steeringNotes!.map((n) => (
                <span
                  key={n.id}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] leading-tight border"
                  style={{
                    borderColor: oracle
                      ? "rgba(var(--oracle-rgb), 0.35)"
                      : `${COLORS.secondary}50`,
                    color: oracle ? "rgb(var(--oracle-rgb))" : COLORS.secondary,
                    background: oracle ? "rgba(var(--oracle-rgb), 0.07)" : `${COLORS.secondary}12`,
                  }}
                >
                  {n.note}
                  <button
                    onClick={() => retireNoteMutation.mutate(n.id)}
                    title="Retire this guidance"
                    className="opacity-60 hover:opacity-100 transition-opacity"
                  >
                    <Icon icon="mdi:close" width={12} height={12} />
                  </button>
                </span>
              ))}
            </div>
          )}
          <div className="flex items-center gap-2">
            <input
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submitNote()}
              placeholder="e.g. keep it shorter · don't mention the ex"
              className="flex-1 px-3 py-2 rounded-xl border outline-none text-[13px] bg-transparent"
              style={{
                borderColor: oracle
                  ? "rgba(var(--oracle-rgb), 0.25)"
                  : `${COLORS.neutralDarkGray}60`,
                color: COLORS.neutralWhite,
              }}
            />
            <button
              onClick={submitNote}
              disabled={!noteText.trim() || addNoteMutation.isPending}
              title="Valentina weighs this on every following draft this session"
              className="px-3 py-2 rounded-xl text-[11px] font-bold uppercase tracking-wider transition-all disabled:opacity-40 border"
              style={{
                borderColor: oracle ? "rgba(var(--oracle-rgb), 0.45)" : `${COLORS.secondary}50`,
                color: oracle ? "rgb(var(--oracle-rgb))" : COLORS.secondary,
                background: "transparent",
              }}
            >
              {addNoteMutation.isPending ? "Saving…" : "Add"}
            </button>
          </div>
        </div>
      )}
    </motion.div>
  );
};
