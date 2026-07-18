import { useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Icon } from "@iconify/react";
import { COLORS, TYPOGRAPHY } from "../../../theme";
import { ClientDossierNote, saveClientNote, updateClientNote } from "../api/dossierApi";

const fmtDate = (iso: string | null | undefined) =>
  iso
    ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
    : "";

/** Title fallback if the backend didn't supply one (first ~6 words of the body). */
const displayTitle = (n: ClientDossierNote): string => {
  if (n.title && n.title.trim()) return n.title.trim();
  const words = (n.note || "").trim().split(/\s+/);
  const t = words.slice(0, 6).join(" ");
  return (t || "Note") + (words.length > 6 ? "…" : "");
};

interface DossierNotesProps {
  notes: ClientDossierNote[];
  /** Client the notes belong to — required to add/edit. */
  clientId?: number | null;
  /** Reading these notes were taken in (stamped on new notes). */
  chatId?: number | null;
  /** Called after a note is added/edited so the caller can refresh the dossier. */
  onChanged?: () => void;
}

type ModalState =
  | { mode: "view"; note: ClientDossierNote }
  | { mode: "edit"; note: ClientDossierNote }
  | { mode: "new" }
  | null;

/**
 * Reusable dossier-notes list: each note is a compact file-card (title + author
 * + date); clicking opens a scrollable detail modal. Notes can be added and
 * edited here (not just at the session-end screen) — so it works from any ended
 * chat, the cockpit dossier card, and the superadmin dossier section.
 */
export const DossierNotes = ({ notes, clientId, chatId, onChanged }: DossierNotesProps) => {
  const [modal, setModal] = useState<ModalState>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const canEdit = clientId != null;

  const copyNote = async (n: ClientDossierNote) => {
    try {
      await navigator.clipboard.writeText(`${displayTitle(n)}\n\n${n.note}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked — no-op */
    }
  };

  const openView = (note: ClientDossierNote) => {
    setError(null);
    setModal({ mode: "view", note });
  };
  const openEdit = (note: ClientDossierNote) => {
    setError(null);
    setTitle(note.title || "");
    setBody(note.note || "");
    setModal({ mode: "edit", note });
  };
  const openNew = () => {
    setError(null);
    setTitle("");
    setBody("");
    setModal({ mode: "new" });
  };
  const close = () => setModal(null);

  const handleSave = async () => {
    if (!clientId || !body.trim() || saving || !modal) return;
    setSaving(true);
    setError(null);
    try {
      if (modal.mode === "new") {
        await saveClientNote(clientId, {
          note: body.trim(),
          title: title.trim() || undefined,
          chat_id: chatId ?? undefined,
        });
      } else if (modal.mode === "edit") {
        await updateClientNote(clientId, modal.note.id, {
          note: body.trim(),
          title: title.trim() || undefined,
        });
      }
      onChanged?.();
      close();
    } catch (e: any) {
      setError(e?.response?.data?.detail || "Couldn't save. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const isForm = modal?.mode === "edit" || modal?.mode === "new";

  return (
    <>
      {canEdit && (
        <button
          onClick={openNew}
          className="w-full mb-2 rounded-xl border border-dashed py-2 flex items-center justify-center gap-1.5 text-[11px] font-bold uppercase tracking-wider transition-colors hover:bg-white/[0.04]"
          style={{ borderColor: `${COLORS.starGold}55`, color: COLORS.starGold }}
        >
          <Icon icon="solar:add-circle-bold" className="text-sm" /> Add note
        </button>
      )}

      {(!notes || notes.length === 0) ? (
        <p className="text-[11px] text-white/35 italic py-1">
          No notes yet — add one here or at the end of a reading; it follows the client forever.
        </p>
      ) : (
        <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
          {notes.map((n) => (
            <button
              key={n.id}
              onClick={() => openView(n)}
              className="w-full text-left rounded-xl border p-2.5 flex items-center gap-2.5 transition-colors hover:bg-white/[0.06]"
              style={{ backgroundColor: `${COLORS.starGold}08`, borderColor: `${COLORS.starGold}26` }}
            >
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                style={{ backgroundColor: `${COLORS.starGold}14`, border: `1px solid ${COLORS.starGold}33` }}
              >
                <Icon icon="solar:document-text-bold-duotone" className="text-base" style={{ color: COLORS.primary }} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[12px] font-bold text-white/90 truncate">{displayTitle(n)}</p>
                <p className="text-[9px] text-white/35 truncate">
                  {n.author_name}
                  {n.created_at && ` · ${fmtDate(n.created_at)}`}
                </p>
              </div>
              <Icon icon="solar:alt-arrow-right-linear" className="text-white/25 text-sm flex-shrink-0" />
            </button>
          ))}
        </div>
      )}

      {/* Detail / edit / new modal — portalled to <body> so it escapes the
          transformed sidebar (framer-motion) and centers over the whole viewport
          as a large modal, not a narrow column. */}
      {createPortal(
        <AnimatePresence>
          {modal && (
            <div className="fixed inset-0 z-[300] flex items-center justify-center p-4">
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={close}
                className="absolute inset-0 bg-black/70 backdrop-blur-sm"
              />
              <motion.div
                initial={{ opacity: 0, scale: 0.96, y: 16 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.96, y: 16 }}
                transition={{ type: "spring", stiffness: 300, damping: 26 }}
                className="relative rounded-3xl border p-6 md:p-8 shadow-2xl backdrop-blur-xl flex flex-col
                           w-[92vw] md:w-[46vw] md:min-w-[560px] md:max-w-[900px]
                           h-[80vh] md:h-[56vh] md:min-h-[420px] md:max-h-[720px]"
                style={{ backgroundColor: COLORS.surface, borderColor: `${COLORS.primary}44` }}
              >
                <button
                  onClick={close}
                  className="absolute top-4 right-4 p-2 rounded-full hover:bg-white/10 transition-colors z-10"
                >
                  <Icon icon="solar:close-circle-bold" className="text-white/60 text-2xl" />
                </button>

                {isForm ? (
                  <>
                    <h3 className="text-xl font-black text-white mb-4 pr-10" style={{ fontFamily: TYPOGRAPHY.fontFamily.heading }}>
                      {modal.mode === "new" ? "Add note" : "Edit note"}
                    </h3>
                    <input
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      maxLength={200}
                      placeholder="Title (auto-filled from the first words if left blank)"
                      className="w-full rounded-2xl px-4 py-3 mb-3 text-base font-semibold text-white placeholder:text-white/30 focus:outline-none focus:ring-1 focus:ring-primary/40"
                      style={{ backgroundColor: `${COLORS.neutralWhite}08`, border: `1px solid ${COLORS.neutralWhite}18` }}
                    />
                    <textarea
                      value={body}
                      onChange={(e) => setBody(e.target.value)}
                      placeholder="Write the note… (any length — paste transcripts or long write-ups)"
                      className="w-full flex-1 rounded-2xl p-4 text-[15px] leading-relaxed text-white placeholder:text-white/30 resize-none focus:outline-none focus:ring-1 focus:ring-primary/40"
                      style={{ backgroundColor: `${COLORS.neutralWhite}08`, border: `1px solid ${COLORS.neutralWhite}18` }}
                    />
                    {error && <div className="text-xs text-red-400 mt-2">{error}</div>}
                    <div className="flex gap-3 mt-4">
                      <button
                        onClick={handleSave}
                        disabled={!body.trim() || saving}
                        className="flex-1 py-3 rounded-2xl font-bold text-sm transition-transform hover:scale-[1.01] disabled:opacity-50 flex items-center justify-center gap-2"
                        style={{ backgroundColor: COLORS.starGold, color: COLORS.dark }}
                      >
                        <Icon icon={saving ? "svg-spinners:3-dots-fade" : "solar:diskette-bold"} />
                        {saving ? "Saving…" : "Save"}
                      </button>
                      <button
                        onClick={() => (modal.mode === "edit" ? setModal({ mode: "view", note: modal.note }) : close())}
                        className="px-6 py-3 rounded-2xl bg-white/10 text-white font-semibold hover:bg-white/20 transition-colors border border-white/15"
                      >
                        Cancel
                      </button>
                    </div>
                  </>
                ) : modal.mode === "view" ? (
                  <>
                    <div className="flex items-start gap-3 mb-4 pr-10 flex-shrink-0">
                      <div
                        className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
                        style={{ backgroundColor: `${COLORS.starGold}14`, border: `1px solid ${COLORS.starGold}33` }}
                      >
                        <Icon icon="solar:document-text-bold-duotone" className="text-2xl" style={{ color: COLORS.primary }} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <h3 className="text-xl font-black text-white leading-tight" style={{ fontFamily: TYPOGRAPHY.fontFamily.heading }}>
                          {displayTitle(modal.note)}
                        </h3>
                        <p className="text-xs text-white/40 mt-1">
                          {modal.note.author_name}
                          {modal.note.created_at && ` · ${fmtDate(modal.note.created_at)}`}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <button
                          onClick={() => copyNote(modal.note)}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-bold uppercase tracking-wider transition-colors hover:bg-white/10 border"
                          style={{ color: copied ? "#4ADE80" : COLORS.neutralGray, borderColor: `${COLORS.neutralWhite}22` }}
                        >
                          <Icon icon={copied ? "solar:check-circle-bold" : "solar:copy-bold-duotone"} className="text-xs" />
                          {copied ? "Copied" : "Copy"}
                        </button>
                        {canEdit && (
                          <button
                            onClick={() => openEdit(modal.note)}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-bold uppercase tracking-wider transition-colors hover:bg-white/10 border"
                            style={{ color: COLORS.primary, borderColor: `${COLORS.primary}44` }}
                          >
                            <Icon icon="solar:pen-bold" className="text-xs" /> Edit
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="overflow-y-auto flex-1 rounded-2xl border p-5" style={{ backgroundColor: `${COLORS.neutralWhite}05`, borderColor: `${COLORS.neutralWhite}10` }}>
                      <p className="text-[15px] text-white/90 leading-relaxed whitespace-pre-wrap">{modal.note.note}</p>
                    </div>
                  </>
                ) : null}
              </motion.div>
            </div>
          )}
        </AnimatePresence>,
        document.body
      )}
    </>
  );
};
