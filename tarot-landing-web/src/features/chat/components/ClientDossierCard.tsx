import { useState } from "react";
import { motion } from "framer-motion";
import { Icon } from "@iconify/react";
import { COLORS } from "../../../theme";
import { ClientDossier } from "../api/dossierApi";
import { formatGbp } from "../../../lib/currency";
import { DossierNotes } from "./DossierNotes";

// Zodiac glyphs for a quick, warm visual cue.
const ZODIAC_ICON: Record<string, string> = {
  Aries: "♈", Taurus: "♉", Gemini: "♊", Cancer: "♋", Leo: "♌", Virgo: "♍",
  Libra: "♎", Scorpio: "♏", Sagittarius: "♐", Capricorn: "♑", Aquarius: "♒", Pisces: "♓",
};

const gbp = (n: number) => formatGbp(n || 0);

const fmtDate = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
    : null;

/**
 * Cockpit client-context card. Platform-wide dossier the reader sees DURING a
 * reading: astrology (zodiac + life path from DOB), new/returning badge,
 * lifetime client spend, past reading count, and every past note from any
 * reader — so the client never has to repeat themselves. Client spend only.
 */
export const ClientDossierCard = ({
  dossier,
  chatId,
  onChanged,
  collapsible = false,
  defaultCollapsed = false,
}: {
  dossier: ClientDossier | null;
  chatId?: number | null;
  onChanged?: () => void;
  /** Whole-card collapse toggle in the header — for tight rails (e.g. next to the
      draft pane) where the dossier shares a column. All content stays available. */
  collapsible?: boolean;
  /** Start collapsed (rail default while the draft panel is the focal point). */
  defaultCollapsed?: boolean;
}) => {
  const [notesOpen, setNotesOpen] = useState(true);
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  if (!dossier) return null;

  const { client, stats, notes } = dossier;
  const zodiacGlyph = client.zodiac ? ZODIAC_ICON[client.zodiac] : null;
  const bodyHidden = collapsible && collapsed;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass-panel w-full relative overflow-hidden mb-4"
    >
      <div className="relative z-10 p-5 space-y-4">
        {/* Header: name + new/returning (+ whole-card collapse when collapsible) */}
        <div className="flex items-center justify-between">
          <p className="oracle-label">
            Client Dossier
          </p>
          <div className="flex items-center gap-2">
            <span
              className="text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full"
              style={{
                backgroundColor: stats.is_returning ? `${COLORS.primary}22` : `${COLORS.starGold}22`,
                color: stats.is_returning ? COLORS.primary : COLORS.starGold,
                border: `1px solid ${stats.is_returning ? COLORS.primary : COLORS.starGold}44`,
              }}
            >
              {stats.is_returning ? "Returning" : "New"}
            </span>
            {collapsible && (
              <button
                onClick={() => setCollapsed((c) => !c)}
                title={collapsed ? "Expand dossier" : "Collapse dossier"}
                className="p-1 rounded-lg transition-all"
                style={{ background: `${COLORS.neutralDarkGray}40`, color: COLORS.neutralWhite }}
              >
                <Icon icon={collapsed ? "solar:alt-arrow-down-linear" : "solar:alt-arrow-up-linear"} width={14} height={14} />
              </button>
            )}
          </div>
        </div>

        {!bodyHidden && (
        <>
        {/* Astro row */}
        <div className="flex items-stretch gap-2">
          <div className="oracle-tile flex-1 p-2.5 text-center">
            <div className="text-[8px] font-bold uppercase tracking-wider text-white/40 mb-0.5">Zodiac</div>
            <div className="text-sm font-black text-white flex items-center justify-center gap-1">
              {zodiacGlyph && <span style={{ color: COLORS.starGold }}>{zodiacGlyph}</span>}
              {client.zodiac || "—"}
            </div>
          </div>
          <div className="oracle-tile flex-1 p-2.5 text-center">
            <div className="text-[8px] font-bold uppercase tracking-wider text-white/40 mb-0.5">Life Path</div>
            <div className="text-sm font-black text-white">{client.life_path ?? "—"}</div>
          </div>
          <div className="oracle-tile flex-1 p-2.5 text-center">
            <div className="text-[8px] font-bold uppercase tracking-wider text-white/40 mb-0.5">DOB</div>
            <div className="text-[11px] font-bold text-white leading-tight mt-1">{fmtDate(client.date_of_birth) || "—"}</div>
          </div>
        </div>

        {/* Spend + readings (client spend only — no earnings) */}
        <div className="flex items-stretch gap-2">
          <div className="oracle-tile flex-1 p-2.5">
            <div className="text-[8px] font-bold uppercase tracking-wider text-white/40 mb-0.5">Lifetime spend</div>
            <div className="oracle-figure text-base">{gbp(stats.lifetime_spend)}</div>
          </div>
          <div className="oracle-tile flex-1 p-2.5">
            <div className="text-[8px] font-bold uppercase tracking-wider text-white/40 mb-0.5">Past readings</div>
            <div className="oracle-figure text-base">{stats.session_count}</div>
          </div>
        </div>

        {/* Past notes from any reader */}
        <div>
          <button
            onClick={() => setNotesOpen((o) => !o)}
            className="oracle-label w-full flex items-center justify-between mb-2"
          >
            <span className="flex items-center gap-1.5">
              <Icon icon="solar:notes-bold-duotone" /> Reading notes ({notes.length})
            </span>
            <Icon icon={notesOpen ? "solar:alt-arrow-up-linear" : "solar:alt-arrow-down-linear"} />
          </button>
          {notesOpen && (
            <DossierNotes
              notes={notes}
              clientId={client.id}
              chatId={chatId}
              onChanged={onChanged}
            />
          )}
        </div>
        </>
        )}
      </div>
    </motion.div>
  );
};
