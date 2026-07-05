import { useEffect, useMemo, useState } from "react";
import { Icon } from "@iconify/react";
import { PrimaryTable, type Column } from "../../../components/Table/PrimaryTable";
import PrimarySelect from "../../../components/CustomInputs/PrimarySelect";
import PrimaryInput from "../../../components/CustomInputs/PrimaryInput";
import { COLORS, TYPOGRAPHY } from "../../../theme";
import { formatGbp } from "../../../lib/currency";
import { earningsApi } from "../api/earningsApi";
import type {
  ActivityPeriod,
  ReaderActivity,
  ReaderActivityResponse,
} from "../types/earnings.types";

const PERIOD_OPTIONS: { value: ActivityPeriod; label: string }[] = [
  { value: "all", label: "All Time" },
  { value: "today", label: "Today" },
  { value: "7d", label: "Last 7 Days" },
  { value: "30d", label: "Last 30 Days" },
  { value: "month", label: "This Month" },
];

// Superadmin Reader Activity — per-psychic workload monitor. For every salaried
// reader: minutes read, sessions, unique clients, and the client spend their
// readings generated (GBP), over a selectable period. Client spend only — there
// is no reader cut or "earnings" anywhere.
const ReaderActivity = () => {
  const [period, setPeriod] = useState<ActivityPeriod>("all");
  const [data, setData] = useState<ReaderActivityResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    earningsApi
      .getReaderActivity(period)
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .catch((err) => {
        if (!cancelled)
          setError(err?.response?.data?.detail || "Failed to load reader activity.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [period]);

  const rows = useMemo(() => {
    const list = data?.psychics || [];
    const q = search.trim().toLowerCase();
    return q ? list.filter((p) => p.username.toLowerCase().includes(q)) : list;
  }, [data, search]);

  const totals = data?.totals;

  const columns: Column<ReaderActivity>[] = [
    {
      key: "username",
      label: "Reader",
      sortable: true,
      render: (p) => (
        <div className="flex items-center gap-3">
          <div
            className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 uppercase font-black text-sm"
            style={{ backgroundColor: `${COLORS.primary}18`, color: COLORS.primary, border: `1px solid ${COLORS.primary}33` }}
          >
            {(p.username || "?").charAt(0)}
          </div>
          <div className="flex flex-col">
            <span className="text-white font-bold text-sm leading-tight">{p.username}</span>
            <span className="text-[9px] text-white/25 uppercase font-black tracking-widest">
              {p.minutes_read > 0 ? "Active" : "No activity"}
            </span>
          </div>
        </div>
      ),
    },
    {
      key: "minutes_read",
      label: "Minutes",
      sortable: true,
      render: (p) => <span className="text-white font-black text-base tabular-nums">{p.minutes_read.toLocaleString()}</span>,
    },
    {
      key: "sessions",
      label: "Sessions",
      sortable: true,
      render: (p) => <span className="text-white/80 font-bold tabular-nums">{p.sessions.toLocaleString()}</span>,
    },
    {
      key: "unique_clients",
      label: "Clients",
      sortable: true,
      render: (p) => <span className="text-white/80 font-bold tabular-nums">{p.unique_clients.toLocaleString()}</span>,
    },
    {
      key: "client_spend",
      label: "Client Spend",
      sortable: true,
      render: (p) => (
        <div className="flex flex-col">
          <span className="font-black text-sm" style={{ color: COLORS.starGold }}>{formatGbp(p.client_spend)}</span>
          <span className="text-[9px] text-white/20 uppercase font-black">Client spend</span>
        </div>
      ),
    },
  ];

  const statCards = [
    { label: "Readers", val: totals ? `${totals.active_count}/${totals.psychic_count}` : "0/0", sub: "Active / Total", icon: "solar:magic-stick-3-bold-duotone", color: COLORS.primary },
    { label: "Minutes", val: totals ? totals.minutes_read.toLocaleString() : "0", sub: "Minutes Read", icon: "solar:clock-circle-bold-duotone", color: COLORS.secondary },
    { label: "Sessions", val: totals ? totals.sessions.toLocaleString() : "0", sub: "Readings Given", icon: "solar:chat-round-line-bold-duotone", color: COLORS.primaryLight },
    { label: "Client Spend", val: totals ? formatGbp(totals.client_spend) : "£0", sub: "GBP · Period", icon: "solar:wallet-money-bold-duotone", color: COLORS.starGold },
  ];

  return (
    <div className="p-12 min-h-screen" style={{ backgroundColor: COLORS.dark, fontFamily: TYPOGRAPHY.fontFamily.body }}>
      {/* Header */}
      <div className="mb-8 flex flex-wrap justify-between items-end gap-6">
        <div>
          <h1 style={TYPOGRAPHY.headings.h2} className="uppercase italic tracking-tighter">
            Reader <span style={{ color: COLORS.primary }}>Activity</span>
          </h1>
          <p style={{ color: COLORS.neutralGray }} className="text-[10px] font-bold uppercase tracking-[0.5em] mt-2 opacity-50">
            Per-Reader Workload · Client Spend
          </p>
        </div>
        <div className="w-[200px]">
          <PrimarySelect
            label="Period"
            value={period}
            onChange={(v) => setPeriod(v as ActivityPeriod)}
            options={PERIOD_OPTIONS}
          />
        </div>
      </div>

      {/* Totals */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        {statCards.map((s) => (
          <div key={s.label} className="p-6 rounded-[24px] border border-white/5" style={{ backgroundColor: COLORS.surface }}>
            <div className="flex items-center justify-between mb-4">
              <Icon icon={s.icon} className="text-3xl" style={{ color: s.color }} />
              <span className="text-[9px] font-black uppercase tracking-widest" style={{ color: COLORS.neutralGray }}>{s.label}</span>
            </div>
            <div className="text-3xl font-black" style={{ color: s.color === COLORS.starGold ? COLORS.starGold : COLORS.neutralWhite }}>{s.val}</div>
            <div className="text-[9px] font-black uppercase tracking-widest mt-1" style={{ color: COLORS.neutralGray }}>{s.sub}</div>
          </div>
        ))}
      </div>

      {/* Search */}
      <div className="p-6 rounded-[32px] border border-white/5 mb-8 shadow-2xl backdrop-blur-sm" style={{ backgroundColor: `${COLORS.surface}80` }}>
        <div className="max-w-md">
          <PrimaryInput
            label="Search Readers"
            placeholder="Search by reader name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            iconLeft={<Icon icon="solar:magnifer-linear" />}
            fullWidth
          />
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-2xl border border-red-500/20 mb-6" style={{ backgroundColor: "rgba(248, 113, 113, 0.1)" }}>
          <p className="text-red-400 text-sm">{error}</p>
        </div>
      )}

      <PrimaryTable
        columns={columns}
        data={rows}
        isDataLoading={loading}
        searchEnabled={false}
        title="Reader Activity"
        pageSize={100}
      />
    </div>
  );
};

export default ReaderActivity;
