import React, { useState, useEffect, useMemo, useRef } from "react";
import { useAuth } from "../../../features/auth/hooks";
import { UserRole } from "../../../features/auth/types/auth.types";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, Cell,
} from "recharts";
import { Icon } from "@iconify/react";
import { motion, AnimatePresence } from "framer-motion";
import { COLORS, TYPOGRAPHY } from "../../../theme";
import { dashboardApi } from "../api/dashboardApi";
import type { AdminDashboardStats, TopPsychic, EarningsSummary, MyChat } from "../api/dashboardApi";

function getVisiblePages(current: number, total: number, siblings: number = 1): (number | "...")[] {
  if (total <= siblings * 2 + 4) return Array.from({ length: total }, (_, i) => i + 1);

  const pages: Set<number> = new Set();
  pages.add(1);
  pages.add(total);
  for (let i = Math.max(2, current - siblings); i <= Math.min(total - 1, current + siblings); i++) {
    pages.add(i);
  }
  const sorted = [...pages].sort((a, b) => a - b);

  const result: (number | "...")[] = [];
  for (let i = 0; i < sorted.length; i++) {
    if (i > 0 && sorted[i] - sorted[i - 1] > 1) result.push("...");
    result.push(sorted[i]);
  }
  return result;
}

const formatAmount = (points: number, unitPriceCents: number) => {
  const dollars = (points * unitPriceCents) / 100;
  if (dollars >= 1000) return `$${dollars.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  return `$${dollars.toFixed(2)}`;
};

const formatNumber = (n: number) => n.toLocaleString();

const CHAT_STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  REQUESTED: { label: "Pending", color: COLORS.starGold },
  ACTIVE: { label: "Active", color: COLORS.success },
  ENDED: { label: "Ended", color: COLORS.primary },
  PAUSED: { label: "Paused", color: COLORS.secondary },
  ARCHIVED: { label: "Archived", color: COLORS.neutralGray },
  BLOCKED: { label: "Blocked", color: COLORS.error },
};

const AdminView = () => {
  const [stats, setStats] = useState<AdminDashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [timeRange, setTimeRange] = useState("30D");
  const [searchQuery, setSearchQuery] = useState("");
  const [psychicsPage, setPsychicsPage] = useState(1);
  const [transactionsPage, setTransactionsPage] = useState(1);
  const psychicsCardRef = useRef<HTMLDivElement>(null);
  const transactionsCardRef = useRef<HTMLDivElement>(null);
  const [matchedHeight, setMatchedHeight] = useState<number | null>(null);

  useEffect(() => {
    fetchStats();
  }, [psychicsPage, transactionsPage]);

  const fetchStats = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await dashboardApi.getAdminStats({
        psychics_page: psychicsPage,
        transactions_page: transactionsPage,
      });
      setStats(data);
    } catch (err: any) {
      setError(err.response?.data?.message || err.response?.data?.detail || err.message || "Failed to load dashboard.");
    } finally {
      setLoading(false);
    }
  };

  const chartData = useMemo(() => {
    if (!stats?.signupsByDay) return [];
    const days = timeRange === "7D" ? 7 : timeRange === "90D" ? 90 : 30;
    return stats.signupsByDay.slice(-days).map((d) => ({
      name: d.date.slice(5),
      users: d.count,
    }));
  }, [stats, timeRange]);

  const filteredPsychics = useMemo(() => {
    if (!stats?.topPsychics?.items) return [];
    return stats.topPsychics.items.filter((p) =>
      p.username.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [stats, searchQuery]);

  const statCards = useMemo(() => {
    if (!stats) return [];
    const activeChats = stats.chatStatusCounts?.ACTIVE || 0;
    return [
      { label: "Gross Revenue", val: formatAmount(stats.totalRevenue, stats.unitPriceCents), icon: "solar:crown-minimalistic-bold", color: COLORS.primary },
      { label: "Total Users", val: formatNumber(stats.totalUsers), icon: "solar:planet-3-bold", color: COLORS.starGold },
      { label: "Psychics", val: formatNumber(stats.totalPsychics), icon: "solar:magic-stick-3-bold-duotone", color: COLORS.secondary },
      { label: "Active Chats", val: formatNumber(activeChats), icon: "solar:chat-round-line-bold-duotone", color: COLORS.primaryLight },
    ];
  }, [stats]);

  useEffect(() => {
    const psychicsEl = psychicsCardRef.current;
    const transactionsEl = transactionsCardRef.current;
    if (!psychicsEl || !transactionsEl) return;
    requestAnimationFrame(() => {
      const ph = psychicsEl.offsetHeight;
      const th = transactionsEl.offsetHeight;
      if (ph > 0 && th > 0) {
        setMatchedHeight(Math.min(ph, th));
      }
    });
  }, [stats, psychicsPage, transactionsPage, searchQuery, filteredPsychics.length]);

  if (loading && !stats) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: COLORS.dark }}>
        <div className="flex flex-col items-center gap-4">
          <Icon icon="svg-spinners:3-dots-fade" className="text-5xl" style={{ color: COLORS.primary }} />
          <span className="font-bold uppercase tracking-widest text-sm" style={{ color: COLORS.neutralGray }}>Loading Dashboard...</span>
        </div>
      </div>
    );
  }

  if (error && !stats) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: COLORS.dark }}>
        <div className="flex flex-col items-center gap-4 max-w-md">
          <Icon icon="solar:danger-circle-bold-duotone" className="text-5xl" style={{ color: COLORS.starGold }} />
          <span className="font-bold text-lg" style={{ color: COLORS.neutralWhite }}>{error}</span>
          <button
            onClick={fetchStats}
            className="px-6 py-3 rounded-xl font-bold uppercase text-xs tracking-wider hover:scale-105 transition-transform"
            style={{ backgroundColor: COLORS.primary, color: COLORS.neutralWhite }}
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-6 lg:p-12 space-y-10" style={{ backgroundColor: COLORS.dark, fontFamily: TYPOGRAPHY.fontFamily.body }}>
      <header className="flex flex-col lg:flex-row lg:items-center justify-between gap-8">
        <div>
          <h1 style={{ fontFamily: TYPOGRAPHY.fontFamily.heading, color: COLORS.primary }} className="text-5xl font-extrabold italic uppercase tracking-tighter leading-none">
            Intelligence <span style={{ color: COLORS.neutralGray }}>Matrix</span>
          </h1>
          <p className="text-[10px] font-black uppercase tracking-[0.6em] mt-3" style={{ color: COLORS.neutralGray }}>System Overview</p>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <div className="relative group">
            <Icon icon="solar:magnifer-linear" className="absolute left-4 top-1/2 -translate-y-1/2 text-xl" style={{ color: COLORS.neutralGray }} />
            <input
              type="text"
              placeholder="Search Psychic..."
              className="rounded-2xl py-3 pl-12 pr-6 text-sm outline-none transition-all w-64"
              style={{ backgroundColor: COLORS.surface, border: `1px solid ${COLORS.neutralDarkGray}`, color: COLORS.neutralWhite }}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <div className="flex p-1.5 rounded-2xl" style={{ backgroundColor: COLORS.surface, border: `1px solid ${COLORS.neutralDarkGray}` }}>
            {["7D", "30D", "90D"].map((r) => (
              <button
                key={r}
                onClick={() => setTimeRange(r)}
                style={{
                  backgroundColor: timeRange === r ? COLORS.primary : 'transparent',
                  color: timeRange === r ? COLORS.neutralWhite : COLORS.neutralGray,
                }}
                className="px-5 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all hover:opacity-80"
              >
                {r}
              </button>
            ))}
          </div>
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {statCards.map((stat) => (
          <motion.div
            key={stat.label}
            whileHover={{ y: -5 }}
            className="p-8 rounded-[40px] transition-all duration-500"
            style={{ backgroundColor: COLORS.surface, border: `1px solid ${COLORS.neutralDarkGray}` }}
          >
            <div className="flex justify-between items-start mb-6">
              <div className="w-14 h-14 rounded-3xl flex items-center justify-center" style={{ backgroundColor: COLORS.surfaceAccent, border: `1px solid ${COLORS.neutralDarkGray}` }}>
                <Icon icon={stat.icon} style={{ color: stat.color }} className="text-2xl" />
              </div>
            </div>
            <span className="text-[10px] font-black uppercase tracking-[0.3em]" style={{ color: COLORS.neutralGray }}>{stat.label}</span>
            <h3 className="text-4xl font-black italic tracking-tighter mt-1" style={{ color: COLORS.neutralWhite, fontFamily: TYPOGRAPHY.fontFamily.heading }}>{stat.val}</h3>
          </motion.div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 p-10 rounded-[56px] relative overflow-hidden" style={{ backgroundColor: COLORS.surface, border: `1px solid ${COLORS.neutralDarkGray}` }}>
          <div className="absolute top-0 right-0 p-12 opacity-5 pointer-events-none">
            <Icon icon="solar:graph-bold" className="text-[200px]" style={{ color: COLORS.neutralWhite }} />
          </div>
          <div className="flex items-center justify-between mb-12 relative z-10">
            <div>
              <h2 style={{ fontFamily: TYPOGRAPHY.fontFamily.heading, color: COLORS.neutralWhite }} className="text-3xl font-black italic uppercase tracking-tighter leading-none">
                Growth <span style={{ color: COLORS.neutralGray }}>Trajectory</span>
              </h2>
              <p className="text-[10px] font-bold uppercase tracking-widest mt-2" style={{ color: COLORS.neutralGray }}>Daily user signups across {timeRange}</p>
            </div>
          </div>
          <div className="h-[450px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="glowGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={COLORS.primary} stopOpacity={0.4}/>
                    <stop offset="95%" stopColor={COLORS.primary} stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={COLORS.neutralDarkGray} strokeOpacity={0.5} />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: COLORS.neutralGray, fontSize: 10, fontWeight: 800}} dy={15} />
                <YAxis axisLine={false} tickLine={false} tick={{fill: COLORS.neutralGray, fontSize: 10, fontWeight: 800}} />
                <Tooltip
                  cursor={{ stroke: COLORS.primary, strokeWidth: 1 }}
                  contentStyle={{backgroundColor: COLORS.surfaceAccent, borderRadius: '24px', border: `1px solid ${COLORS.neutralDarkGray}`, padding: '20px'}}
                  labelStyle={{color: COLORS.neutralGray, fontWeight: '700', fontSize: '12px'}}
                  itemStyle={{color: COLORS.primary, fontWeight: '900', fontSize: '16px'}}
                />
                <Area type="monotone" dataKey="users" stroke={COLORS.primary} strokeWidth={4} fill="url(#glowGradient)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="p-10 rounded-[56px] flex flex-col shadow-2xl" style={{ backgroundColor: COLORS.surface, border: `1px solid ${COLORS.neutralDarkGray}` }}>
          <h2 style={{ fontFamily: TYPOGRAPHY.fontFamily.heading, color: COLORS.neutralWhite }} className="text-3xl font-black italic uppercase tracking-tighter mb-10 leading-none">
            Chat <span style={{ color: COLORS.neutralGray }}>Status</span>
          </h2>
          <div className="flex-1 min-h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={Object.entries(stats?.chatStatusCounts || {}).map(([status, count]) => ({
                  status: CHAT_STATUS_CONFIG[status]?.label || status,
                  count,
                  fill: CHAT_STATUS_CONFIG[status]?.color || COLORS.neutralGray,
                }))}
                layout="vertical"
                margin={{ left: 20, right: 40, top: 10, bottom: 10 }}
              >
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={COLORS.neutralDarkGray} strokeOpacity={0.5} />
                <XAxis type="number" axisLine={false} tickLine={false} tick={{fill: COLORS.neutralGray, fontSize: 10, fontWeight: 800}} />
                <YAxis type="category" dataKey="status" axisLine={false} tickLine={false} tick={{fill: COLORS.neutralGray, fontSize: 10, fontWeight: 800}} width={80} />
                <Tooltip
                  cursor={{ fill: COLORS.surfaceAccent }}
                  contentStyle={{backgroundColor: COLORS.surfaceAccent, borderRadius: '24px', border: `1px solid ${COLORS.neutralDarkGray}`, padding: '20px'}}
                  labelStyle={{color: COLORS.neutralGray, fontWeight: '700', fontSize: '12px'}}
                  itemStyle={{color: COLORS.primary, fontWeight: '900', fontSize: '16px'}}
                />
                <Bar dataKey="count" radius={[0, 8, 8, 0]} barSize={28}>
                  {(Object.entries(stats?.chatStatusCounts || {}).map(([status]) => ({
                    status,
                    fill: CHAT_STATUS_CONFIG[status]?.color || COLORS.neutralGray,
                  }))).map((entry, index) => (
                    <Cell key={index} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="grid grid-cols-2 gap-6 mt-10">
            {Object.entries(stats?.chatStatusCounts || {}).map(([status, count]) => {
              const cfg = CHAT_STATUS_CONFIG[status];
              if (!cfg || count === 0) return null;
              return (
                <div key={status} className="p-4 rounded-2xl flex flex-col gap-1" style={{ backgroundColor: COLORS.surfaceAccent, border: `1px solid ${COLORS.neutralDarkGray}` }}>
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: cfg.color }} />
                    <span className="text-[10px] font-black uppercase tracking-widest" style={{ color: COLORS.neutralGray }}>{cfg.label}</span>
                  </div>
                  <span className="text-xl font-black italic tracking-tighter" style={{ color: COLORS.neutralWhite }}>{count}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-8 items-start">
        <div
          ref={psychicsCardRef}
          className="flex-1 flex flex-col p-10 rounded-[56px]"
          style={{
            backgroundColor: COLORS.surface,
            border: `1px solid ${COLORS.neutralDarkGray}`,
            height: matchedHeight || 'auto',
            overflow: 'hidden',
          }}
        >
          <div className="flex items-center justify-between mb-10">
            <h2 style={{ fontFamily: TYPOGRAPHY.fontFamily.heading, color: COLORS.neutralWhite }} className="text-3xl font-black italic uppercase tracking-tighter">
              Top <span style={{ color: COLORS.neutralGray }}>Psychics</span>
            </h2>
            <span className="text-[10px] font-black uppercase" style={{ color: COLORS.neutralGray }}>{stats?.topPsychics.total || 0} total</span>
          </div>
          <div className="flex-1 overflow-y-auto min-h-0 space-y-4">
            <AnimatePresence mode="popLayout">
              {filteredPsychics.map((p) => (
                <motion.div
                  layout
                  key={p.id}
                  className="p-6 rounded-[32px] flex items-center justify-between group transition-all hover:border-primary/30"
                  style={{ backgroundColor: COLORS.surfaceAccent, border: `1px solid ${COLORS.neutralDarkGray}` }}
                >
                  <div className="flex items-center gap-5">
                    <div className="w-14 h-14 rounded-2xl flex items-center justify-center font-black" style={{ border: `1px solid ${COLORS.neutralDarkGray}`, color: COLORS.primary }}>
                      <Icon icon="solar:star-fall-minimalistic-bold-duotone" className="text-2xl" />
                    </div>
                    <div>
                      <h4 className="text-lg font-black italic uppercase tracking-tighter" style={{ color: COLORS.neutralWhite }}>{p.username}</h4>
                      <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: COLORS.neutralGray }}>{p.totalSessions} sessions</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-xl font-black tabular-nums" style={{ color: COLORS.starGold }}>{formatAmount(p.totalEarnings, stats!.unitPriceCents)}</div>
                    <div className="flex items-center justify-end gap-1" style={{ color: COLORS.neutralGray }}>
                      <Icon icon="solar:star-bold" className="text-xs" />
                      <span className="text-[9px] font-black uppercase">{p.averageRating.toFixed(1)} Avg</span>
                    </div>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
          {stats && (
            <div className="flex items-center justify-center gap-4 mt-8">
              <button
                onClick={() => setPsychicsPage((p) => Math.max(1, p - 1))}
                disabled={psychicsPage <= 1}
                className="p-3 rounded-2xl text-sm font-black uppercase tracking-wider transition-all disabled:opacity-20 hover:opacity-80"
                style={{ backgroundColor: COLORS.surfaceAccent, border: `1px solid ${COLORS.neutralDarkGray}`, color: COLORS.neutralGray }}
              >
                <Icon icon="solar:alt-arrow-left-bold" className="text-lg" />
              </button>
              {getVisiblePages(
                psychicsPage,
                Math.ceil(stats.topPsychics.total / stats.topPsychics.perPage)
              ).map((page, idx) =>
                page === "..." ? (
                  <span key={`e-${idx}`} className="px-2 text-sm font-black" style={{ color: COLORS.neutralGray }}>...</span>
                ) : (
                  <button
                    key={page}
                    onClick={() => setPsychicsPage(page)}
                    className="min-w-[40px] h-10 rounded-2xl text-sm font-black transition-all"
                    style={{
                      backgroundColor: psychicsPage === page ? COLORS.primary : 'transparent',
                      border: `1px solid ${psychicsPage === page ? COLORS.primary : COLORS.neutralDarkGray}`,
                      color: psychicsPage === page ? COLORS.neutralWhite : COLORS.neutralGray,
                    }}
                  >
                    {page}
                  </button>
                )
              )}
              <button
                onClick={() => setPsychicsPage((p) => p + 1)}
                disabled={psychicsPage >= Math.ceil(stats.topPsychics.total / stats.topPsychics.perPage)}
                className="p-3 rounded-2xl text-sm font-black uppercase tracking-wider transition-all disabled:opacity-20 hover:opacity-80"
                style={{ backgroundColor: COLORS.surfaceAccent, border: `1px solid ${COLORS.neutralDarkGray}`, color: COLORS.neutralGray }}
              >
                <Icon icon="solar:alt-arrow-right-bold" className="text-lg" />
              </button>
            </div>
          )}
        </div>

        <div
          ref={transactionsCardRef}
          className="flex-1 flex flex-col p-10 rounded-[56px]"
          style={{
            backgroundColor: COLORS.surface,
            border: `1px solid ${COLORS.neutralDarkGray}`,
            height: matchedHeight || 'auto',
            overflow: 'hidden',
          }}
        >
          <h2 style={{ fontFamily: TYPOGRAPHY.fontFamily.heading, color: COLORS.neutralWhite }} className="text-3xl font-black italic uppercase tracking-tighter mb-10 leading-none">
            Recent <span style={{ color: COLORS.neutralGray }}>Activity</span>
          </h2>
          <div className="flex-1 overflow-y-auto min-h-0 space-y-6">
            {stats?.recentTransactions.items.map((t) => (
              <div key={t.id} className="flex items-start gap-5 p-5 rounded-3xl" style={{ border: `1px solid ${COLORS.neutralDarkGray}30`, backgroundColor: `${COLORS.surfaceAccent}60` }}>
                <div
                  className="w-1.5 h-10 rounded-full shrink-0"
                  style={{ backgroundColor: t.transactionType === "CREDIT" ? COLORS.success : COLORS.primary }}
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-black uppercase tracking-tight italic truncate" style={{ color: COLORS.neutralWhite }}>
                    {t.description || `${t.transactionType} Transaction`}
                  </p>
                  <div className="flex items-center gap-3 mt-1">
                    <span className="text-[9px] font-black uppercase truncate" style={{ color: COLORS.neutralGray }}>
                      {t.username || `User #${t.userId}`}
                    </span>
                    <div className="w-1 h-1 rounded-full shrink-0" style={{ backgroundColor: COLORS.neutralDarkGray }} />
                    <span className="text-[9px] font-bold uppercase tabular-nums shrink-0" style={{ color: COLORS.neutralGray }}>{formatAmount(t.amount, stats!.unitPriceCents)}</span>
                    <div className="w-1 h-1 rounded-full shrink-0" style={{ backgroundColor: COLORS.neutralDarkGray }} />
                    <span className="text-[9px] font-bold uppercase tabular-nums shrink-0" style={{ color: COLORS.neutralGray }}>{t.status}</span>
                  </div>
                </div>
              </div>
            ))}
            {(!stats?.recentTransactions.items || stats.recentTransactions.items.length === 0) && (
              <p className="text-[10px] font-black uppercase tracking-widest text-center py-12" style={{ color: COLORS.neutralGray }}>No recent transactions</p>
            )}
          </div>
          {stats && (
            <div className="flex items-center justify-center gap-4 mt-8">
              <button
                onClick={() => setTransactionsPage((p) => Math.max(1, p - 1))}
                disabled={transactionsPage <= 1}
                className="p-3 rounded-2xl text-sm font-black uppercase tracking-wider transition-all disabled:opacity-20 hover:opacity-80"
                style={{ backgroundColor: COLORS.surfaceAccent, border: `1px solid ${COLORS.neutralDarkGray}`, color: COLORS.neutralGray }}
              >
                <Icon icon="solar:alt-arrow-left-bold" className="text-lg" />
              </button>
              {getVisiblePages(
                transactionsPage,
                Math.ceil(stats.recentTransactions.total / stats.recentTransactions.perPage)
              ).map((page, idx) =>
                page === "..." ? (
                  <span key={`e-${idx}`} className="px-2 text-sm font-black" style={{ color: COLORS.neutralGray }}>...</span>
                ) : (
                  <button
                    key={page}
                    onClick={() => setTransactionsPage(page)}
                    className="min-w-[40px] h-10 rounded-2xl text-sm font-black transition-all"
                    style={{
                      backgroundColor: transactionsPage === page ? COLORS.primary : 'transparent',
                      border: `1px solid ${transactionsPage === page ? COLORS.primary : COLORS.neutralDarkGray}`,
                      color: transactionsPage === page ? COLORS.neutralWhite : COLORS.neutralGray,
                    }}
                  >
                    {page}
                  </button>
                )
              )}
              <button
                onClick={() => setTransactionsPage((p) => p + 1)}
                disabled={transactionsPage >= Math.ceil(stats.recentTransactions.total / stats.recentTransactions.perPage)}
                className="p-3 rounded-2xl text-sm font-black uppercase tracking-wider transition-all disabled:opacity-20 hover:opacity-80"
                style={{ backgroundColor: COLORS.surfaceAccent, border: `1px solid ${COLORS.neutralDarkGray}`, color: COLORS.neutralGray }}
              >
                <Icon icon="solar:alt-arrow-right-bold" className="text-lg" />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const PsychicView = () => {
  const [earnings, setEarnings] = useState<EarningsSummary | null>(null);
  const [chats, setChats] = useState<MyChat[]>([]);
  const [unitPriceCents, setUnitPriceCents] = useState(100);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);
      const [earningsData, chatsData, unitPrice] = await Promise.all([
        dashboardApi.getEarningsSummary(),
        dashboardApi.getMyChats(),
        dashboardApi.getUnitPrice(),
      ]);
      setEarnings(earningsData);
      setChats(chatsData);
      setUnitPriceCents(unitPrice.unit_price_cents);
    } catch (err: any) {
      setError(err.response?.data?.message || err.response?.data?.detail || err.message || "Failed to load data.");
    } finally {
      setLoading(false);
    }
  };

  const chatStatusCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    chats.forEach((c) => {
      counts[c.status] = (counts[c.status] || 0) + 1;
    });
    return counts;
  }, [chats]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: COLORS.dark }}>
        <div className="flex flex-col items-center gap-4">
          <Icon icon="svg-spinners:3-dots-fade" className="text-5xl" style={{ color: COLORS.primary }} />
          <span className="font-bold uppercase tracking-widest text-sm" style={{ color: COLORS.neutralGray }}>Loading Dashboard...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: COLORS.dark }}>
        <div className="flex flex-col items-center gap-4 max-w-md">
          <Icon icon="solar:danger-circle-bold-duotone" className="text-5xl" style={{ color: COLORS.starGold }} />
          <span className="font-bold text-lg" style={{ color: COLORS.neutralWhite }}>{error}</span>
          <button
            onClick={fetchData}
            className="px-6 py-3 rounded-xl font-bold uppercase text-xs tracking-wider hover:scale-105 transition-transform"
            style={{ backgroundColor: COLORS.primary, color: COLORS.neutralWhite }}
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-6 lg:p-12 space-y-10" style={{ backgroundColor: COLORS.dark, fontFamily: TYPOGRAPHY.fontFamily.body }}>
      <header className="flex flex-col lg:flex-row lg:items-center justify-between gap-8">
        <div>
          <h1 style={{ fontFamily: TYPOGRAPHY.fontFamily.heading, color: COLORS.primary }} className="text-5xl font-extrabold italic uppercase tracking-tighter leading-none">
            My <span style={{ color: COLORS.neutralGray }}>Dashboard</span>
          </h1>
          <p className="text-[10px] font-black uppercase tracking-[0.6em] mt-3" style={{ color: COLORS.neutralGray }}>Performance Overview</p>
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {[
          { label: "Total Earnings", val: formatAmount(earnings?.totalEarnings || 0, unitPriceCents), icon: "solar:dollar-bold-duotone", color: COLORS.primary },
          { label: "Pending Earnings", val: formatAmount(earnings?.pendingEarnings || 0, unitPriceCents), icon: "solar:clock-circle-bold-duotone", color: COLORS.starGold },
          { label: "Total Sessions", val: formatNumber(earnings?.totalSessions || 0), icon: "solar:chat-round-line-bold-duotone", color: COLORS.secondary },
          { label: "Unique Clients", val: formatNumber(earnings?.uniqueClients || 0), icon: "solar:users-group-rounded-bold-duotone", color: COLORS.primaryLight },
        ].map((stat) => (
          <motion.div
            key={stat.label}
            whileHover={{ y: -5 }}
            className="p-8 rounded-[40px] transition-all duration-500"
            style={{ backgroundColor: COLORS.surface, border: `1px solid ${COLORS.neutralDarkGray}` }}
          >
            <div className="flex justify-between items-start mb-6">
              <div className="w-14 h-14 rounded-3xl flex items-center justify-center" style={{ backgroundColor: COLORS.surfaceAccent, border: `1px solid ${COLORS.neutralDarkGray}` }}>
                <Icon icon={stat.icon} style={{ color: stat.color }} className="text-2xl" />
              </div>
            </div>
            <span className="text-[10px] font-black uppercase tracking-[0.3em]" style={{ color: COLORS.neutralGray }}>{stat.label}</span>
            <h3 className="text-4xl font-black italic tracking-tighter mt-1" style={{ color: COLORS.neutralWhite, fontFamily: TYPOGRAPHY.fontFamily.heading }}>{stat.val}</h3>
          </motion.div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="p-10 rounded-[56px]" style={{ backgroundColor: COLORS.surface, border: `1px solid ${COLORS.neutralDarkGray}` }}>
          <h2 style={{ fontFamily: TYPOGRAPHY.fontFamily.heading, color: COLORS.neutralWhite }} className="text-3xl font-black italic uppercase tracking-tighter mb-10">
            Chat <span style={{ color: COLORS.neutralGray }}>Overview</span>
          </h2>
          <div className="space-y-4">
            {[
              { status: "REQUESTED", label: "Pending Requests", color: COLORS.starGold },
              { status: "ACTIVE", label: "Active Chats", color: COLORS.success },
              { status: "ENDED", label: "Completed", color: COLORS.primary },
              { status: "ARCHIVED", label: "Archived", color: COLORS.neutralGray },
            ].map((item) => (
              <div
                key={item.status}
                className="p-6 rounded-[32px] flex items-center justify-between"
                style={{ backgroundColor: COLORS.surfaceAccent, border: `1px solid ${COLORS.neutralDarkGray}` }}
              >
                <div className="flex items-center gap-4">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: item.color, boxShadow: `0 0 8px ${item.color}60` }} />
                  <span className="text-sm font-black uppercase tracking-tight" style={{ color: COLORS.neutralWhite }}>{item.label}</span>
                </div>
                <span className="text-2xl font-black tabular-nums" style={{ color: COLORS.neutralWhite }}>
                  {chatStatusCounts[item.status] || 0}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="p-10 rounded-[56px] flex flex-col" style={{ backgroundColor: COLORS.surface, border: `1px solid ${COLORS.neutralDarkGray}` }}>
          <h2 style={{ fontFamily: TYPOGRAPHY.fontFamily.heading, color: COLORS.neutralWhite }} className="text-3xl font-black italic uppercase tracking-tighter mb-10 leading-none">
            Recent <span style={{ color: COLORS.neutralGray }}>Activity</span>
          </h2>
          <div className="flex-1 space-y-6">
            {chats.slice(0, 10).map((chat) => (
              <div key={chat.id} className="flex items-start gap-5 p-5 rounded-3xl" style={{ border: `1px solid ${COLORS.neutralDarkGray}30`, backgroundColor: `${COLORS.surfaceAccent}60` }}>
                <div
                  className="w-1.5 h-10 rounded-full shrink-0"
                  style={{
                    backgroundColor:
                      chat.status === "ACTIVE" ? COLORS.success :
                      chat.status === "REQUESTED" ? COLORS.starGold :
                      chat.status === "ENDED" ? COLORS.primary :
                      COLORS.neutralGray,
                  }}
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-black uppercase tracking-tight italic truncate" style={{ color: COLORS.neutralWhite }}>
                    Chat with {chat.user?.username || `User #${chat.user_id}`}
                  </p>
                  <div className="flex items-center gap-3 mt-1">
                    <span className="text-[9px] font-black uppercase" style={{ color: COLORS.neutralGray }}>{chat.status}</span>
                    <div className="w-1 h-1 rounded-full shrink-0" style={{ backgroundColor: COLORS.neutralDarkGray }} />
                    <span className="text-[9px] font-bold uppercase tabular-nums shrink-0" style={{ color: COLORS.neutralGray }}>
                      {new Date(chat.created_at).toLocaleDateString()}
                    </span>
                  </div>
                </div>
              </div>
            ))}
            {chats.length === 0 && (
              <p className="text-[10px] font-black uppercase tracking-widest text-center py-12" style={{ color: COLORS.neutralGray }}>No chat activity yet</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

const AnalyticsDashboard = () => {
  const { user } = useAuth();
  const isPsychic = user?.role === UserRole.PSYCHIC;
  if (isPsychic) return <PsychicView />;
  return <AdminView />;
};

export default AnalyticsDashboard;
