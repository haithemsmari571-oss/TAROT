import React, { useState, useMemo } from "react";
import { 
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  BarChart, Bar, PieChart, Pie, Cell, LineChart, Line 
} from "recharts";
import { Icon } from "@iconify/react";
import { motion, AnimatePresence } from "framer-motion";
import { COLORS, TYPOGRAPHY } from "../../../theme";


// --- FUNCTIONAL MOCK DATA GENERATOR ---
const GENERATE_DATA = (range: string) => {
  const points = range === "7D" ? 7 : range === "30D" ? 30 : 12;
  return Array.from({ length: points }, (_, i) => ({
    name: range === "1Y" ? ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][i] : `Day ${i + 1}`,
    revenue: Math.floor(Math.random() * 5000) + 2000,
    users: Math.floor(Math.random() * 100) + 20,
    sessions: Math.floor(Math.random() * 50) + 10,
  }));
};

const PSYCHIC_LEADERBOARD = [
  { id: 1, name: "Seraphina", rating: 4.9, earnings: 12400, sessions: 420, mod: "Tarot", trend: "up" },
  { id: 2, name: "Elder Thorne", rating: 4.8, earnings: 9800, sessions: 310, mod: "Astrology", trend: "up" },
  { id: 3, name: "Luna Ray", rating: 5.0, earnings: 8500, sessions: 280, mod: "Medium", trend: "down" },
  { id: 4, name: "Master Ken", rating: 4.7, earnings: 7200, sessions: 195, mod: "Energy", trend: "up" },
];

const MODALITY_SPLIT = [
  { name: "Tarot", value: 45, color: COLORS.primary },
  { name: "Astrology", value: 25, color: COLORS.secondary },
  { name: "Mediumship", value: 20, color: COLORS.primaryDark },
  { name: "Energy", value: 10, color: COLORS.starGold },
];

const AnalyticsDashboard = () => {
  const [timeRange, setTimeRange] = useState("30D");
  const [searchQuery, setSearchQuery] = useState("");
  const [activeMetric, setActiveMetric] = useState("revenue");

  const chartData = useMemo(() => GENERATE_DATA(timeRange), [timeRange]);

  const filteredPsychics = PSYCHIC_LEADERBOARD.filter(p => 
    p.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="min-h-screen p-6 lg:p-12 space-y-10" style={{ backgroundColor: COLORS.dark, fontFamily: TYPOGRAPHY.fontFamily.body }}>
      
      {/* --- TOP NAV / HEADER --- */}
      <header className="flex flex-col lg:flex-row lg:items-center justify-between gap-8">
        <div>
          <h1 style={{ fontFamily: TYPOGRAPHY.fontFamily.heading, color: COLORS.primary }} className="text-5xl font-extrabold italic uppercase tracking-tighter leading-none">
            Intelligence <span className="text-neutralGray/20">Matrix</span>
          </h1>
          <p className="text-[10px] font-black uppercase tracking-[0.6em] mt-3" style={{ color: COLORS.neutralGray }}>System Operational • 2026.04.27</p>
        </div>

        <div className="flex flex-wrap items-center gap-4">
          <div className="relative group">
            <Icon icon="solar:magnifer-linear" className="absolute left-4 top-1/2 -translate-y-1/2 text-neutralGray/40 text-xl" />
            <input 
              type="text"
              placeholder="Search Seeker / Psychic..."
              className="bg-surface border border-neutralDarkGray rounded-2xl py-3 pl-12 pr-6 text-sm text-neutralWhite outline-none focus:border-primary/50 transition-all w-64"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <div className="flex bg-surface p-1.5 rounded-2xl border border-neutralDarkGray">
            {["7D", "30D", "90D", "1Y"].map((r) => (
              <button
                key={r}
                onClick={() => setTimeRange(r)}
                className={`px-5 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
                  timeRange === r ? "bg-white text-whiteDark shadow-lg" : "text-neutralGray hover:text-white"
                }`}
              >
                {r}
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* --- PRIMARY STATS GRID --- */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {[
          { id: "revenue", label: "Gross Credits", val: "$24.5k", icon: "solar:crown-minimalistic-bold", color: COLORS.primary },
          { id: "users", label: "Global Seekers", val: "12,892", icon: "solar:planet-3-bold", color: COLORS.starGold },
          { id: "sessions", label: "Transmissions", val: "4,102", icon: "solar:transmission-bold", color: COLORS.secondary },
          { id: "growth", label: "Pulse Rate", val: "+22.4%", icon: "solar:graph-up-bold", color: COLORS.primaryLight },
        ].map((stat) => (
          <motion.div 
            key={stat.id}
            whileHover={{ y: -5 }}
            onClick={() => setActiveMetric(stat.id)}
            className={`p-8 rounded-[40px] border cursor-pointer transition-all duration-500 ${
              activeMetric === stat.id ? "border-primary/40 shadow-[0_0_40px_rgba(210,185,255,0.1)]" : "border-surfaceAccent"
            }`}
            style={{ backgroundColor: COLORS.surface }}
          >
            <div className="flex justify-between items-start mb-6">
              <div className="w-14 h-14 rounded-3xl flex items-center justify-center border" style={{ backgroundColor: COLORS.surfaceAccent, borderColor: COLORS.neutralDarkGray }}>
                <Icon icon={stat.icon} style={{ color: stat.color }} className="text-2xl" />
              </div>
              <div className="flex flex-col items-end">
                <span className="text-[10px] font-black text-white uppercase">Active</span>
                <div className="w-2 h-2 rounded-full bg-white mt-1 animate-pulse" />
              </div>
            </div>
            <span className="text-[10px] font-black uppercase tracking-[0.3em]" style={{ color: COLORS.neutralGray }}>{stat.label}</span>
            <h3 className="text-4xl font-black italic tracking-tighter mt-1" style={{ color: COLORS.neutralWhite, fontFamily: TYPOGRAPHY.fontFamily.heading }}>{stat.val}</h3>
          </motion.div>
        ))}
      </div>

      {/* --- DATA VISUALIZATION ENGINE --- */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* MAIN GROWTH CHART */}
        <div className="lg:col-span-2 p-10 rounded-[56px] border border-surfaceAccent relative overflow-hidden" style={{ backgroundColor: COLORS.surface }}>
           <div className="absolute top-0 right-0 p-12 opacity-5 pointer-events-none">
              <Icon icon="solar:graph-bold" className="text-[200px] text-white" />
           </div>
           
           <div className="flex items-center justify-between mb-12 relative z-10">
              <div>
                <h2 style={{ fontFamily: TYPOGRAPHY.fontFamily.heading, color: COLORS.neutralWhite }} className="text-3xl font-black italic uppercase tracking-tighter leading-none">
                  Growth <span className="text-neutralGray/20">Trajectory</span>
                </h2>
                <p className="text-[10px] font-bold text-white uppercase tracking-widest mt-2">Visualizing {activeMetric} across {timeRange}</p>
              </div>
              <div className="flex gap-4">
                <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-white"/><span className="text-[9px] font-black text-neutralGray uppercase">Live</span></div>
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
                    itemStyle={{color: COLORS.primary, fontWeight: '900', fontSize: '16px'}}
                  />
                  <Area type="monotone" dataKey={activeMetric} stroke={COLORS.primary} strokeWidth={4} fill="url(#glowGradient)" />
               </AreaChart>
             </ResponsiveContainer>
           </div>
        </div>

        {/* MODALITY PIE */}
        <div className="p-10 rounded-[56px] border border-surfaceAccent flex flex-col shadow-2xl" style={{ backgroundColor: COLORS.surface }}>
           <h2 style={{ fontFamily: TYPOGRAPHY.fontFamily.heading, color: COLORS.neutralWhite }} className="text-3xl font-black italic uppercase tracking-tighter mb-10 leading-none">
             Modality <span className="text-neutralGray/20">Split</span>
           </h2>
           <div className="flex-1 min-h-[300px]">
             <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={MODALITY_SPLIT} innerRadius={90} outerRadius={135} paddingAngle={12} dataKey="value">
                    {MODALITY_SPLIT.map((entry, index) => (
                      <Cell key={index} fill={entry.color} stroke="none" />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
             </ResponsiveContainer>
           </div>
           <div className="grid grid-cols-2 gap-6 mt-10">
              {MODALITY_SPLIT.map((m) => (
                <div key={m.name} className="p-4 rounded-2xl bg-surfaceAccent border border-neutralDarkGray flex flex-col gap-1">
                   <div className="flex items-center gap-2">
                     <div className="w-2 h-2 rounded-full" style={{ backgroundColor: m.color }} />
                     <span className="text-[10px] font-black text-neutralWhite uppercase tracking-widest">{m.name}</span>
                   </div>
                   <span className="text-xl font-black text-white italic tracking-tighter">{m.value}%</span>
                </div>
              ))}
           </div>
        </div>
      </div>

      {/* --- PERFORMANCE & LOGS --- */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        
        {/* PSYCHIC LEADERBOARD */}
        <div className="p-10 rounded-[56px] border border-surfaceAccent" style={{ backgroundColor: COLORS.surface }}>
           <div className="flex items-center justify-between mb-10">
              <h2 style={{ fontFamily: TYPOGRAPHY.fontFamily.heading, color: COLORS.neutralWhite }} className="text-3xl font-black italic uppercase tracking-tighter">
                Elite <span className="text-neutralGray/20">Council</span>
              </h2>
              <button className="text-[10px] font-black text-white uppercase border-b border-primary/40 hover:text-white transition-all">Export Report</button>
           </div>
           
           <div className="space-y-4">
              <AnimatePresence mode="popLayout">
                {filteredPsychics.map((p) => (
                  <motion.div 
                    layout
                    key={p.id}
                    className="p-6 rounded-[32px] bg-surfaceAccent border border-neutralDarkGray flex items-center justify-between group transition-all hover:border-primary/30"
                  >
                    <div className="flex items-center gap-5">
                       <div className="w-14 h-14 rounded-2xl border flex items-center justify-center font-black" style={{ borderColor: COLORS.neutralDarkGray, color: COLORS.primary }}>
                          <Icon icon="solar:star-fall-minimalistic-bold-duotone" className="text-2xl" />
                       </div>
                       <div>
                          <h4 className="text-lg font-black text-white italic uppercase tracking-tighter">{p.name}</h4>
                          <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: COLORS.neutralGray }}>{p.mod} • {p.sessions} Sessions</span>
                       </div>
                    </div>
                    <div className="text-right">
                       <div className="text-xl font-black tabular-nums" style={{ color: COLORS.starGold }}>${(p.earnings/1000).toFixed(1)}k</div>
                       <div className={`flex items-center justify-end gap-1 ${p.trend === 'up' ? 'text-white' : 'text-neutralGray'}`}>
                          <Icon icon={p.trend === 'up' ? "solar:round-alt-arrow-up-bold" : "solar:round-alt-arrow-down-bold"} className="text-xs" />
                          <span className="text-[9px] font-black uppercase">{p.rating} Avg</span>
                       </div>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
           </div>
        </div>

        {/* RECENT EVENT STREAM */}
        <div className="p-10 rounded-[56px] border border-surfaceAccent flex flex-col" style={{ backgroundColor: COLORS.surface }}>
           <h2 style={{ fontFamily: TYPOGRAPHY.fontFamily.heading, color: COLORS.neutralWhite }} className="text-3xl font-black italic uppercase tracking-tighter mb-10 leading-none">
             Quantum <span className="text-neutralGray/20">Feed</span>
           </h2>
           <div className="flex-1 space-y-6">
              {[
                { event: "High-Value Session Start", time: "2m ago", user: "User_881", color: COLORS.primary },
                { event: "New Psychic Verified", time: "14m ago", user: "Zhara", color: COLORS.starGold },
                { event: "Payout Protocol Initialized", time: "1h ago", user: "System", color: COLORS.secondary },
                { event: "Large Credit Purchase", time: "3h ago", user: "User_902", color: COLORS.primaryLight },
              ].map((ev, i) => (
                <div key={i} className="flex items-start gap-5 p-5 rounded-3xl border border-white/[0.03] bg-white/[0.01]">
                   <div className="w-1.5 h-10 rounded-full" style={{ backgroundColor: ev.color }} />
                   <div className="flex-1">
                      <p className="text-sm font-black text-neutralWhite uppercase tracking-tight italic">{ev.event}</p>
                      <div className="flex items-center gap-3 mt-1">
                        <span className="text-[9px] font-black text-neutralGray uppercase">Triggered by {ev.user}</span>
                        <div className="w-1 h-1 rounded-full bg-neutralDarkGray" />
                        <span className="text-[9px] font-bold text-neutralGray/40 uppercase tabular-nums">{ev.time}</span>
                      </div>
                   </div>
                </div>
              ))}
           </div>
           <button className="w-full mt-8 py-5 rounded-2xl bg-surfaceAccent border border-neutralDarkGray text-[10px] font-black uppercase tracking-widest text-white/40 hover:text-white transition-all">
              Initialize Full System Log
           </button>
        </div>

      </div>
    </div>
  );
};

export default AnalyticsDashboard;