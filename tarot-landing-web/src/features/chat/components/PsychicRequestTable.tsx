import React, { useState } from "react";
import { Icon } from "@iconify/react";
import { COLORS } from "../../../theme";

const PsychicRequestTable = ({ onEnterChat }: { onEnterChat: (id: number) => void }) => {
  const [searchTerm, setSearchTerm] = useState("");
  const [filter, setFilter] = useState("All");

  const REQUESTS = [
    { id: 1, user: "Sarah Miller", time: "17:30", date: "27 Apr", duration: "20m", price: "$40.00", status: "Accepted", mod: "Tarot", intent: "Career Shift" },
    { id: 2, user: "James Chen", time: "18:00", date: "27 Apr", duration: "15m", price: "$30.00", status: "Pending", mod: "Astrology", intent: "Love/Relat." },
    { id: 3, user: "Anna Belle", time: "19:15", date: "28 Apr", duration: "30m", price: "$60.00", status: "Denied", mod: "Medium", intent: "Grief" },
  ];

  return (
    <div className="w-full space-y-6">
      {/* --- TABLE HEADER & FILTERS --- */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 px-4">
        <div className="relative flex-1 max-w-md">
          <Icon icon="solar:magnifer-linear" className="absolute left-5 top-1/2 -translate-y-1/2 text-white/20 text-xl" />
          <input 
            type="text" 
            placeholder="Search seeker by name or intent..."
            className="w-full bg-white/[0.03] border border-white/10 rounded-2xl py-4 pl-14 pr-6 text-sm text-white outline-none focus:border-white/30 transition-all"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        <div className="flex items-center gap-2 p-1.5 bg-white/[0.03] border border-white/10 rounded-2xl">
          {["All", "Pending", "Accepted"].map((t) => (
            <button
              key={t}
              onClick={() => setFilter(t)}
              className={`px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
                filter === t ? "bg-white text-black" : "text-white/40 hover:text-white"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* --- DATA TABLE --- */}
      <div className="rounded-[40px] border border-white/10 bg-white/[0.02] backdrop-blur-3xl overflow-hidden shadow-2xl mx-2">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-white/10 bg-white/[0.04]">
              <th className="p-8 text-[10px] font-black uppercase text-white/40 tracking-[0.2em]">Seeker & Modality</th>
              <th className="p-8 text-[10px] font-black uppercase text-white/40 tracking-[0.2em]">Alignment Time</th>
              <th className="p-8 text-[10px] font-black uppercase text-white/40 tracking-[0.2em]">Intent Context</th>
              <th className="p-8 text-[10px] font-black uppercase text-white/40 tracking-[0.2em]">Revenue</th>
              <th className="p-8 text-[10px] font-black uppercase text-white/40 tracking-[0.2em] text-right">Protocol</th>
            </tr>
          </thead>
          <tbody>
            {REQUESTS.map((req) => (
              <tr key={req.id} className="border-b border-white/[0.05] hover:bg-white/[0.03] transition-all group">
                <td className="p-8">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-2xl border border-white/10 bg-white/5 flex items-center justify-center font-black text-xs text-primary">
                      {req.user.charAt(0)}
                    </div>
                    <div className="flex flex-col">
                      <span className="text-sm font-black text-white uppercase tracking-tight">{req.user}</span>
                      <span className="text-[9px] font-bold text-white/30 uppercase">{req.mod} Session</span>
                    </div>
                  </div>
                </td>
                <td className="p-8">
                  <div className="flex flex-col">
                    <span className="text-sm font-black text-white tabular-nums italic">{req.time}</span>
                    <span className="text-[9px] font-bold text-white/30 uppercase">{req.date} • {req.duration}</span>
                  </div>
                </td>
                <td className="p-8">
                  <div className="max-w-[200px] truncate text-[11px] text-white/60 font-medium italic">
                    "{req.intent}"
                  </div>
                </td>
                <td className="p-8">
                  <span className="text-sm font-black text-primary tabular-nums">{req.price}</span>
                </td>
                <td className="p-8 text-right">
                  {req.status === 'Accepted' ? (
                    <button 
                      onClick={() => onEnterChat(req.id)}
                      className="px-8 py-4 rounded-2xl bg-white text-black font-black uppercase text-[10px] tracking-widest hover:scale-105 active:scale-95 transition-all"
                    >
                      Enter Portal
                    </button>
                  ) : (
                    <div className="flex justify-end gap-3">
                       <button className="w-12 h-12 rounded-xl border border-white/10 flex items-center justify-center text-white/20 hover:text-white hover:bg-white/5 transition-all">
                        <Icon icon="solar:check-read-bold" className="text-xl" />
                      </button>
                      <button className="w-12 h-12 rounded-xl border border-white/10 flex items-center justify-center text-white/20 hover:text-white hover:bg-white/5 transition-all">
                        <Icon icon="solar:close-circle-bold" className="text-xl" />
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default PsychicRequestTable;