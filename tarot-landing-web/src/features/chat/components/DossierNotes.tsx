import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Icon } from "@iconify/react";
import { COLORS, TYPOGRAPHY } from "../../../theme";
import { ClientDossierNote } from "../api/dossierApi";

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

/**
 * Reusable dossier-notes list: each note is a compact file-card (title + author
 * + date); clicking opens a scrollable detail modal (notes can be long). Shared
 * by the cockpit dossier card and the superadmin dossier section.
 */
export const DossierNotes = ({ notes }: { notes: ClientDossierNote[] }) => {
  const [open, setOpen] = useState<ClientDossierNote | null>(null);

  if (!notes || notes.length === 0) {
    return (
      <p className="text-[11px] text-white/35 italic py-2">
        No past notes yet — anything saved at the end of a reading appears here next time.
      </p>
    );
  }

  return (
    <>
      <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
        {notes.map((n) => (
          <button
            key={n.id}
            onClick={() => setOpen(n)}
            className="w-full text-left rounded-xl border p-2.5 flex items-center gap-2.5 transition-colors hover:bg-white/[0.06]"
            style={{ backgroundColor: `${COLORS.neutralWhite}05`, borderColor: `${COLORS.neutralWhite}12` }}
          >
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
              style={{ backgroundColor: `${COLORS.primary}18`, border: `1px solid ${COLORS.primary}33` }}
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

      {/* Full-note detail modal */}
      <AnimatePresence>
        {open && (
          <div className="fixed inset-0 z-[210] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setOpen(null)}
              className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.94, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.94, y: 16 }}
              transition={{ type: "spring", stiffness: 300, damping: 26 }}
              className="relative w-full max-w-lg rounded-3xl border p-6 shadow-2xl backdrop-blur-xl max-h-[85vh] flex flex-col"
              style={{ backgroundColor: COLORS.surface, borderColor: `${COLORS.primary}44` }}
            >
              <button
                onClick={() => setOpen(null)}
                className="absolute top-4 right-4 p-2 rounded-full hover:bg-white/10 transition-colors"
              >
                <Icon icon="solar:close-circle-bold" className="text-white/60 text-2xl" />
              </button>

              <div className="flex items-start gap-3 mb-4 pr-8">
                <div
                  className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ backgroundColor: `${COLORS.primary}18`, border: `1px solid ${COLORS.primary}33` }}
                >
                  <Icon icon="solar:document-text-bold-duotone" className="text-2xl" style={{ color: COLORS.primary }} />
                </div>
                <div className="min-w-0">
                  <h3
                    className="text-lg font-black text-white leading-tight"
                    style={{ fontFamily: TYPOGRAPHY.fontFamily.heading }}
                  >
                    {displayTitle(open)}
                  </h3>
                  <p className="text-[11px] text-white/40 mt-0.5">
                    {open.author_name}
                    {open.created_at && ` · ${fmtDate(open.created_at)}`}
                  </p>
                </div>
              </div>

              <div className="overflow-y-auto flex-1 rounded-2xl border p-4" style={{ backgroundColor: `${COLORS.neutralWhite}05`, borderColor: `${COLORS.neutralWhite}10` }}>
                <p className="text-[13px] text-white/85 leading-relaxed whitespace-pre-wrap">{open.note}</p>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
};
