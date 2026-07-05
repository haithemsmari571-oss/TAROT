import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Icon } from "@iconify/react";
import { COLORS, TYPOGRAPHY } from "../../../theme";
import { getChatSpendSummary, saveClientNote, ChatSpendSummary } from "../api/dossierApi";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  chatId: number | null;
  clientId: number | null;
  clientName?: string;
  /** Reading duration in seconds (from the cockpit meter). */
  duration: number;
}

const fmtDuration = (seconds: number): string => {
  const s = Math.max(0, Math.floor(seconds || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h > 0
    ? `${h}:${m.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}`
    : `${m}:${sec.toString().padStart(2, "0")}`;
};

const gbp = (n: number) =>
  new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(n || 0);

/**
 * Psychic-side end screen. Shows CLIENT SPEND only (Stardust + £ + duration +
 * free/paid split) and today / this-week client-spend totals — never any
 * "earnings/share" (psychics are salaried). Also captures the dossier note that
 * saves to the CLIENT's profile and follows them into every future reading.
 */
export const PsychicSessionSummaryModal = ({
  isOpen,
  onClose,
  chatId,
  clientId,
  clientName,
  duration,
}: Props) => {
  const [summary, setSummary] = useState<ChatSpendSummary | null>(null);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || !chatId) return;
    setSummary(null);
    setNote("");
    setSaved(false);
    setError(null);
    let cancelled = false;
    getChatSpendSummary(chatId)
      .then((s) => {
        if (!cancelled) setSummary(s);
      })
      .catch(() => {
        /* non-fatal — the note field still works */
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, chatId]);

  // The client id may be passed in, or derived from the spend summary.
  const effectiveClientId = clientId ?? summary?.client_id ?? null;

  const handleSaveNote = async () => {
    if (!note.trim() || saving) return;
    if (!effectiveClientId) {
      // Never fail silently — surface why the save can't proceed.
      setError("Couldn't identify the client yet — give it a second and try again.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await saveClientNote(effectiveClientId, { note: note.trim(), chat_id: chatId ?? undefined });
      setSaved(true);
    } catch (e: any) {
      setError(e?.response?.data?.detail || "Couldn't save the note. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const session = summary?.session;
  const spent = session?.total_spent ?? 0;
  const credit = session?.credit_spent ?? 0;
  const paid = session?.paid_spent ?? 0;

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            transition={{ type: "spring", stiffness: 300, damping: 25 }}
            className="relative w-full max-w-md rounded-3xl p-7 shadow-2xl backdrop-blur-xl border border-white/10 max-h-[92vh] overflow-y-auto"
            style={{ backgroundColor: COLORS.surface }}
          >
            <button
              onClick={onClose}
              className="absolute top-4 right-4 p-2 rounded-full hover:bg-white/10 transition-colors"
            >
              <Icon icon="solar:close-circle-bold" className="text-white/60 text-2xl" />
            </button>

            <div className="flex justify-center mb-5">
              <div
                className="w-16 h-16 rounded-3xl flex items-center justify-center"
                style={{ backgroundColor: `${COLORS.primary}1f`, border: `1px solid ${COLORS.primary}44` }}
              >
                <Icon icon="solar:notebook-bold-duotone" className="text-3xl" style={{ color: COLORS.primary }} />
              </div>
            </div>

            <h2
              className="text-xl font-bold text-center text-white mb-1"
              style={{ fontFamily: TYPOGRAPHY.fontFamily.heading }}
            >
              Session complete
            </h2>
            <p className="text-center text-white/60 text-sm mb-6">
              {clientName ? `${clientName} spent` : "Client spent"}{" "}
              <span className="font-bold text-white">{spent.toLocaleString()} Stardust</span>{" "}
              ({gbp(spent)}) over <span className="font-bold text-white">{fmtDuration(duration)}</span>
            </p>

            {/* Spend breakdown — client spend only */}
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div className="p-4 rounded-2xl bg-white/5 border border-white/10 text-center">
                <div className="text-[10px] font-black uppercase tracking-wider mb-1" style={{ color: "#FB923C" }}>
                  Free credit
                </div>
                <div className="text-lg font-black text-white tabular-nums">{gbp(credit)}</div>
              </div>
              <div className="p-4 rounded-2xl bg-white/5 border border-white/10 text-center">
                <div className="text-[10px] font-black uppercase tracking-wider mb-1" style={{ color: COLORS.primary }}>
                  Paid
                </div>
                <div className="text-lg font-black text-white tabular-nums">{gbp(paid)}</div>
              </div>
            </div>

            {/* Today / this-week client-spend totals */}
            <div className="grid grid-cols-2 gap-3 mb-6">
              <div className="p-3 rounded-2xl bg-white/[0.03] border border-white/10 text-center">
                <div className="text-[10px] font-bold uppercase tracking-wider text-white/40 mb-0.5">Client today</div>
                <div className="text-sm font-bold text-white tabular-nums">
                  {summary ? gbp(summary.today_spend) : "—"}
                </div>
              </div>
              <div className="p-3 rounded-2xl bg-white/[0.03] border border-white/10 text-center">
                <div className="text-[10px] font-bold uppercase tracking-wider text-white/40 mb-0.5">Client this week</div>
                <div className="text-sm font-bold text-white tabular-nums">
                  {summary ? gbp(summary.week_spend) : "—"}
                </div>
              </div>
            </div>

            {/* Dossier note — saves to the CLIENT's profile, seen by any reader next time */}
            <div className="mb-2">
              <label className="text-[11px] font-black uppercase tracking-wider mb-2 flex items-center gap-1.5" style={{ color: COLORS.starGold }}>
                <Icon icon="solar:notes-bold-duotone" /> Dossier note (saved to client profile)
              </label>
              <textarea
                value={note}
                onChange={(e) => { setNote(e.target.value); setSaved(false); }}
                rows={3}
                placeholder="What should the next reader know? (themes, situation, where you left off…)"
                className="w-full rounded-2xl p-3 text-sm text-white placeholder:text-white/30 resize-none focus:outline-none focus:ring-1 focus:ring-primary/40 transition-all"
                style={{ backgroundColor: `${COLORS.neutralWhite}08`, border: `1px solid ${COLORS.neutralWhite}18` }}
              />
              <p className="text-[10px] text-white/35 mt-1.5">
                Follows {clientName || "the client"} into every future reading — they never repeat themselves.
              </p>
            </div>

            {error && <div className="text-xs text-red-400 mb-2">{error}</div>}

            <div className="flex gap-3 mt-4">
              <button
                onClick={handleSaveNote}
                disabled={!note.trim() || saving || saved}
                className="flex-1 py-3 px-5 rounded-2xl font-bold text-sm transition-transform hover:scale-[1.01] disabled:opacity-50 flex items-center justify-center gap-2"
                style={{ backgroundColor: saved ? "rgba(74,222,128,0.15)" : COLORS.starGold, color: saved ? "#4ADE80" : COLORS.dark }}
              >
                <Icon icon={saved ? "solar:check-circle-bold" : saving ? "svg-spinners:3-dots-fade" : "solar:diskette-bold"} className="text-base" />
                {saved ? "Saved to dossier" : saving ? "Saving…" : "Save note"}
              </button>
              <button
                onClick={onClose}
                className="px-6 py-3 rounded-2xl bg-white/10 text-white font-semibold hover:bg-white/20 transition-colors border border-white/15"
              >
                Close
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
