import { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Icon } from "@iconify/react";
import { COLORS, TYPOGRAPHY } from "../../../theme";
import { formatGbp } from "../../../lib/currency";
import PrimaryInput from "../../../components/CustomInputs/PrimaryInput";
import { usersApi } from "../../users/api/usersApi";
import { Role } from "../../users/types/user.types";
import type { AdminUserListItem } from "../../users/types/user.types";
import { getClientDossier } from "../../chat/api/dossierApi";
import type { ClientDossier } from "../../chat/api/dossierApi";
import { DossierNotes } from "../../chat/components/DossierNotes";

// Zodiac glyphs for a quick, warm visual cue (mirrors the cockpit card).
const ZODIAC_ICON: Record<string, string> = {
  Aries: "♈", Taurus: "♉", Gemini: "♊", Cancer: "♋", Leo: "♌", Virgo: "♍",
  Libra: "♎", Scorpio: "♏", Sagittarius: "♐", Capricorn: "♑", Aquarius: "♒", Pisces: "♓",
};

const gbp = (n: number) => formatGbp(n || 0);

const fmtDate = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
    : "—";

// Debounce hook (same pattern as Users/Ledger).
function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState<T>(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

/**
 * Superadmin Client Dossier — search any client and open their full,
 * platform-wide dossier at any time, outside a reading: astrology (zodiac +
 * life path from DOB), lifetime / today / this-week client spend, past reading
 * history (reader + minutes + spend), and every note from any reader (add/edit
 * inline via the shared DossierNotes). Client spend only — psychics are salaried,
 * there is no cut, and no "earnings/share" framing anywhere.
 */
const ClientsDossier = () => {
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 400);

  const [results, setResults] = useState<AdminUserListItem[]>([]);
  const [searching, setSearching] = useState(false);

  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [dossier, setDossier] = useState<ClientDossier | null>(null);
  const [loadingDossier, setLoadingDossier] = useState(false);
  const [dossierError, setDossierError] = useState<string | null>(null);

  // Search clients (role USER) whenever the debounced query changes.
  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setSearching(true);
      try {
        const data = await usersApi.getUsers({
          search: debouncedSearch || undefined,
          role: Role.USER,
          limit: 25,
          sort_by: "created_at",
          sort_order: "desc",
        });
        if (!cancelled) setResults(data.users);
      } catch {
        if (!cancelled) setResults([]);
      } finally {
        if (!cancelled) setSearching(false);
      }
    };
    run();
    return () => { cancelled = true; };
  }, [debouncedSearch]);

  const loadDossier = useCallback(async (clientId: number) => {
    setLoadingDossier(true);
    setDossierError(null);
    try {
      const data = await getClientDossier(clientId);
      setDossier(data);
    } catch (e: any) {
      setDossier(null);
      setDossierError(e?.response?.data?.detail || "Couldn't load this dossier.");
    } finally {
      setLoadingDossier(false);
    }
  }, []);

  const selectClient = (clientId: number) => {
    setSelectedId(clientId);
    loadDossier(clientId);
  };

  const zodiacGlyph = dossier?.client.zodiac ? ZODIAC_ICON[dossier.client.zodiac] : null;
  const sessions = useMemo(() => dossier?.sessions ?? [], [dossier]);

  return (
    <div
      className="p-12 min-h-screen"
      style={{ backgroundColor: COLORS.dark, fontFamily: TYPOGRAPHY.fontFamily.body }}
    >
      {/* Header */}
      <div className="mb-10">
        <h1 style={TYPOGRAPHY.headings.h2} className="uppercase italic tracking-tighter">
          Client <span style={{ color: COLORS.primary }}>Dossier</span>
        </h1>
        <p
          style={{ color: COLORS.neutralGray }}
          className="text-[10px] font-bold uppercase tracking-[0.5em] mt-2 opacity-50"
        >
          Every Client · Full History · Any Time
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-8">
        {/* LEFT: search + results */}
        <div>
          <PrimaryInput
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search clients by name or email…"
            fullWidth
            iconLeft={<Icon icon="solar:magnifer-linear" />}
          />

          <div className="mt-4 space-y-1.5">
            {searching && results.length === 0 ? (
              <p className="text-[11px] text-white/35 italic px-1 py-2">Searching…</p>
            ) : results.length === 0 ? (
              <p className="text-[11px] text-white/35 italic px-1 py-2">No clients found.</p>
            ) : (
              results.map((c) => {
                const isActive = c.id === selectedId;
                return (
                  <button
                    key={c.id}
                    onClick={() => selectClient(c.id)}
                    className="w-full text-left rounded-xl border p-3 flex items-center gap-3 transition-colors hover:bg-white/[0.05]"
                    style={{
                      backgroundColor: isActive ? `${COLORS.primary}18` : `${COLORS.neutralWhite}05`,
                      borderColor: isActive ? `${COLORS.primary}55` : `${COLORS.neutralWhite}12`,
                    }}
                  >
                    <div
                      className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 uppercase font-black text-sm"
                      style={{ backgroundColor: `${COLORS.primary}18`, color: COLORS.primary, border: `1px solid ${COLORS.primary}33` }}
                    >
                      {(c.username || "?").charAt(0)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-bold text-white/90 truncate">{c.username}</p>
                      <p className="text-[10px] text-white/35 truncate">{c.email}</p>
                    </div>
                    <Icon icon="solar:alt-arrow-right-linear" className="text-white/25 text-sm flex-shrink-0" />
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* RIGHT: dossier detail */}
        <div>
          {!selectedId ? (
            <div
              className="rounded-[24px] border border-white/5 flex flex-col items-center justify-center text-center py-24 px-8"
              style={{ backgroundColor: COLORS.surface }}
            >
              <Icon icon="solar:folder-with-files-bold-duotone" className="text-5xl mb-4" style={{ color: `${COLORS.primary}66` }} />
              <p className="text-white/70 font-bold">Select a client to open their dossier</p>
              <p className="text-[12px] text-white/35 mt-1 max-w-sm">
                Search on the left, then pick a client to see their reading history, spend, astrology and notes.
              </p>
            </div>
          ) : loadingDossier ? (
            <div
              className="rounded-[24px] border border-white/5 flex items-center justify-center py-24"
              style={{ backgroundColor: COLORS.surface }}
            >
              <Icon icon="svg-spinners:3-dots-fade" className="text-3xl text-white/50" />
            </div>
          ) : dossierError ? (
            <div
              className="rounded-[24px] border py-16 px-8 text-center"
              style={{ backgroundColor: COLORS.surface, borderColor: `${COLORS.error}44` }}
            >
              <Icon icon="solar:danger-triangle-bold-duotone" className="text-4xl mb-3" style={{ color: COLORS.error }} />
              <p className="text-white/70 font-bold">{dossierError}</p>
              <button
                onClick={() => selectedId && loadDossier(selectedId)}
                className="mt-4 px-5 py-2 rounded-xl text-[11px] font-black uppercase tracking-wider"
                style={{ backgroundColor: `${COLORS.primary}22`, color: COLORS.primary, border: `1px solid ${COLORS.primary}44` }}
              >
                Retry
              </button>
            </div>
          ) : dossier ? (
            <motion.div
              key={dossier.client.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-6"
            >
              {/* Identity + new/returning */}
              <div
                className="rounded-[24px] border border-white/5 p-6 flex items-center justify-between gap-4"
                style={{ backgroundColor: COLORS.surface }}
              >
                <div className="flex items-center gap-4 min-w-0">
                  <div
                    className="w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0 uppercase font-black text-2xl"
                    style={{ backgroundColor: `${COLORS.primary}18`, color: COLORS.primary, border: `1px solid ${COLORS.primary}33` }}
                  >
                    {(dossier.client.username || "?").charAt(0)}
                  </div>
                  <div className="min-w-0">
                    <h2 className="text-2xl font-black text-white truncate" style={{ fontFamily: TYPOGRAPHY.fontFamily.heading }}>
                      {dossier.client.username}
                    </h2>
                    <p className="text-[12px] text-white/40 truncate">{dossier.client.email}</p>
                  </div>
                </div>
                <span
                  className="text-[9px] font-black uppercase tracking-wider px-3 py-1 rounded-full flex-shrink-0"
                  style={{
                    backgroundColor: dossier.stats.is_returning ? `${COLORS.primary}22` : `${COLORS.starGold}22`,
                    color: dossier.stats.is_returning ? COLORS.primary : COLORS.starGold,
                    border: `1px solid ${dossier.stats.is_returning ? COLORS.primary : COLORS.starGold}44`,
                  }}
                >
                  {dossier.stats.is_returning ? "Returning" : "New"}
                </span>
              </div>

              {/* Spend cards (client spend only — no earnings) */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <StatCard label="Lifetime spend" value={gbp(dossier.stats.lifetime_spend)} accent={COLORS.starGold} icon="solar:wallet-money-bold-duotone" />
                <StatCard label="Today" value={gbp(dossier.stats.today_spend)} icon="solar:calendar-mark-bold-duotone" />
                <StatCard label="This week" value={gbp(dossier.stats.week_spend)} icon="solar:calendar-bold-duotone" />
                <StatCard label="Readings" value={String(dossier.stats.session_count)} icon="solar:chat-round-line-bold-duotone" />
              </div>

              {/* Astrology */}
              <div className="grid grid-cols-3 gap-4">
                <StatCard
                  label="Zodiac"
                  value={dossier.client.zodiac || "—"}
                  prefix={zodiacGlyph ? <span style={{ color: COLORS.starGold }}>{zodiacGlyph}</span> : undefined}
                  icon="solar:stars-minimalistic-bold-duotone"
                />
                <StatCard label="Life Path" value={dossier.client.life_path != null ? String(dossier.client.life_path) : "—"} icon="solar:calculator-bold-duotone" />
                <StatCard label="Date of birth" value={fmtDate(dossier.client.date_of_birth)} icon="solar:cake-bold-duotone" />
              </div>

              {/* Two columns: session history + notes */}
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                {/* Session history */}
                <div className="rounded-[24px] border border-white/5 p-5" style={{ backgroundColor: COLORS.surface }}>
                  <p className="text-[9px] font-black uppercase tracking-[0.2em] mb-3" style={{ color: COLORS.neutralGray }}>
                    Reading history ({sessions.length})
                  </p>
                  {sessions.length === 0 ? (
                    <p className="text-[11px] text-white/35 italic py-2">No billed readings yet.</p>
                  ) : (
                    <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                      {sessions.map((s) => (
                        <div
                          key={s.chat_id}
                          className="rounded-xl border p-3 flex items-center gap-3"
                          style={{ backgroundColor: `${COLORS.neutralWhite}05`, borderColor: `${COLORS.neutralWhite}12` }}
                        >
                          <div
                            className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
                            style={{ backgroundColor: `${COLORS.primary}14`, border: `1px solid ${COLORS.primary}30` }}
                          >
                            <Icon icon="solar:magic-stick-3-bold-duotone" className="text-base" style={{ color: COLORS.primary }} />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-[12px] font-bold text-white/90 truncate">{s.reader_name}</p>
                            <p className="text-[9px] text-white/35">
                              {fmtDate(s.last_at)} · {s.minutes} min
                            </p>
                          </div>
                          <span className="text-[13px] font-black flex-shrink-0" style={{ color: COLORS.starGold }}>
                            {gbp(s.spend)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Notes (add/edit via shared component) */}
                <div className="rounded-[24px] border border-white/5 p-5" style={{ backgroundColor: COLORS.surface }}>
                  <p className="text-[9px] font-black uppercase tracking-[0.2em] mb-3" style={{ color: COLORS.neutralGray }}>
                    Reading notes ({dossier.notes.length})
                  </p>
                  <DossierNotes
                    notes={dossier.notes}
                    clientId={dossier.client.id}
                    onChanged={() => loadDossier(dossier.client.id)}
                  />
                </div>
              </div>
            </motion.div>
          ) : null}
        </div>
      </div>
    </div>
  );
};

/** Small labelled stat tile matching the admin card style. */
const StatCard = ({
  label,
  value,
  icon,
  accent,
  prefix,
}: {
  label: string;
  value: string;
  icon: string;
  accent?: string;
  prefix?: React.ReactNode;
}) => (
  <div className="p-4 rounded-[20px] border border-white/5" style={{ backgroundColor: COLORS.surface }}>
    <div className="flex items-center justify-between mb-2">
      <Icon icon={icon} className="text-xl" style={{ color: accent || COLORS.primary }} />
      <span className="text-[8px] font-black uppercase tracking-widest" style={{ color: COLORS.neutralGray }}>
        {label}
      </span>
    </div>
    <div className="text-xl font-black flex items-center gap-1.5" style={{ color: accent || COLORS.neutralWhite }}>
      {prefix}
      {value}
    </div>
  </div>
);

export default ClientsDossier;
