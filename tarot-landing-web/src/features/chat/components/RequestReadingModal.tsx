import { useState, useEffect, useCallback } from "react";
import { Icon } from "@iconify/react";
import { useNotifications } from "@/features/notifications/hooks/useNotifications";
import { NotificationType } from "@/features/notifications/types/notification.types";
import { requestChat } from "../api/chatApi";
import { COLORS, TYPOGRAPHY } from "@/theme";

interface RequestReadingModalProps {
  psychicId: number;
  psychicName: string;
  psychicPhoto?: string | null;
  onClose: () => void;
}

/**
 * Two-step "request a reading" panel, opened from a psychic's profile.
 *
 * Step 1 (form): the client's opening question (optional) + Request button.
 * Step 2 (waiting): a warm reassurance state while the psychic prepares.
 *
 * Visual language is deliberately matched to IncomingReadingModal (same avatar,
 * surface, gold label, gradient CTA) so the request → accept → join sequence
 * feels like one continuous moment. Clears itself the instant the psychic
 * accepts (CHAT_ACCEPTED) so the global "Join {psychic}" prompt takes over.
 */
export default function RequestReadingModal({
  psychicId,
  psychicName,
  psychicPhoto,
  onClose,
}: RequestReadingModalProps) {
  const { onNotification } = useNotifications();
  const [step, setStep] = useState<"form" | "waiting">("form");
  const [question, setQuestion] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Hand off to the global IncomingReadingModal the moment she's accepted (or if
  // the request is cancelled/declined). pid may be absent on some payloads — in
  // that case we still clear, since she only holds one pending request at a time.
  useEffect(() => {
    const matches = (n: { data?: any }) => {
      const pid = n.data?.psychic_id ? Number(n.data.psychic_id) : undefined;
      return pid === undefined || pid === psychicId;
    };
    const offAccepted = onNotification(NotificationType.CHAT_ACCEPTED, (n) => {
      if (matches(n)) onClose();
    });
    const offCancelled = onNotification(
      NotificationType.CHAT_REQUEST_CANCELLED,
      (n) => {
        if (matches(n)) onClose();
      }
    );
    return () => {
      offAccepted();
      offCancelled();
    };
  }, [onNotification, psychicId, onClose]);

  const handleSubmit = useCallback(async () => {
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await requestChat({
        psychic_id: psychicId,
        // The field is optional; if she submits blank, send a gentle default so
        // her first message isn't an empty bubble waiting for the psychic.
        message: question.trim() || "I'm ready to begin my reading.",
      });
      setStep("waiting");
    } catch (err: any) {
      setError(
        err?.response?.data?.detail ??
          err?.response?.data?.message ??
          "We couldn't send your request. Please try again."
      );
    } finally {
      setSubmitting(false);
    }
  }, [submitting, psychicId, question]);

  return (
    <div
      className="fixed inset-0 z-[190] flex items-center justify-center p-4"
      style={{
        backgroundColor: "rgba(5,5,8,0.92)",
        backdropFilter: "blur(10px)",
        fontFamily: TYPOGRAPHY.fontFamily.body,
      }}
    >
      <div
        className="w-full max-w-sm rounded-[28px] border p-8 text-center relative"
        style={{ backgroundColor: COLORS.surface, borderColor: `${COLORS.primary}44` }}
      >
        {/* Avatar (pulses while waiting) */}
        <div className="relative mx-auto mb-6 w-28 h-28">
          {step === "waiting" && (
            <div
              className="absolute inset-0 rounded-full animate-ping"
              style={{ backgroundColor: `${COLORS.primary}33` }}
            />
          )}
          <div
            className="relative w-28 h-28 rounded-full overflow-hidden border-2 flex items-center justify-center"
            style={{ borderColor: `${COLORS.primary}66`, backgroundColor: `${COLORS.primary}14` }}
          >
            {psychicPhoto ? (
              <img
                src={psychicPhoto}
                alt={psychicName}
                className="w-full h-full object-cover"
              />
            ) : (
              <Icon icon="ph:sparkle-fill" className="text-5xl" style={{ color: COLORS.primary }} />
            )}
          </div>
        </div>

        {step === "form" ? (
          <>
            <div
              className="text-[11px] font-black uppercase tracking-[0.28em] mb-2"
              style={{ color: COLORS.starGold }}
            >
              New Reading
            </div>
            <h2
              className="text-2xl font-black"
              style={{ fontFamily: TYPOGRAPHY.fontFamily.heading, color: COLORS.neutralWhite }}
            >
              {psychicName}
            </h2>
            <p className="text-sm text-white/55 mt-1 mb-6">
              Share what's on your heart — or simply begin.
            </p>

            <textarea
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              rows={4}
              placeholder="What would you like your reading to be about? (optional)"
              className="w-full rounded-2xl p-4 text-sm text-white placeholder:text-white/35 resize-none focus:outline-none focus:ring-1 focus:ring-primary/30 transition-all"
              style={{
                backgroundColor: `${COLORS.neutralWhite}08`,
                border: `1px solid ${COLORS.neutralWhite}18`,
              }}
            />

            {error && (
              <div className="mt-3 text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl p-3">
                {error}
              </div>
            )}

            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="mt-5 w-full flex items-center justify-center gap-2 py-4 rounded-2xl font-black uppercase text-sm tracking-widest text-white transition-transform hover:scale-[1.02] disabled:opacity-60"
              style={{
                background: `linear-gradient(135deg, ${COLORS.primary} 0%, ${COLORS.secondary} 100%)`,
                boxShadow: `0 12px 34px ${COLORS.primary}55`,
              }}
            >
              {submitting ? (
                <>
                  <Icon icon="svg-spinners:3-dots-fade" className="text-base" /> Sending…
                </>
              ) : (
                <>
                  <Icon icon="ph:paper-plane-tilt-bold" className="text-lg" /> Request Reading
                </>
              )}
            </button>
            <button
              onClick={onClose}
              className="mt-4 text-sm font-semibold text-white/50 hover:text-white/80 transition-colors"
            >
              Cancel
            </button>
          </>
        ) : (
          <>
            <div
              className="text-[11px] font-black uppercase tracking-[0.28em] mb-2"
              style={{ color: COLORS.starGold }}
            >
              Preparing your reading
            </div>
            <h2
              className="text-2xl font-black"
              style={{ fontFamily: TYPOGRAPHY.fontFamily.heading, color: COLORS.neutralWhite }}
            >
              {psychicName}
            </h2>
            <p className="text-sm text-white/70 mt-4 leading-relaxed">
              Your reading should begin within{" "}
              <span style={{ color: COLORS.starGold }}>3 minutes</span>. Please stay
              on the site — {psychicName} is preparing for your session, and you'll
              be notified the moment they're ready.
            </p>
            <div className="mt-7 flex items-center justify-center gap-2 text-xs font-semibold uppercase tracking-wider text-white/40">
              <Icon icon="svg-spinners:3-dots-fade" className="text-base" />
              Waiting for {psychicName}
            </div>
            {/* The request stays live after dismissing — the global "Join" prompt
                still appears the moment she's accepted, wherever she is. */}
            <button
              onClick={onClose}
              className="mt-6 text-xs font-semibold text-white/40 hover:text-white/70 transition-colors"
            >
              Continue browsing while you wait
            </button>
          </>
        )}
      </div>
    </div>
  );
}
