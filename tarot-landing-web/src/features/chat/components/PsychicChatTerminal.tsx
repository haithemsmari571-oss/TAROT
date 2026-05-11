import React, { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Icon } from "@iconify/react";

const PsychicChatTerminal = ({ onExit }: { onExit: () => void }) => {
  const [messages, setMessages] = useState([
    { role: "user", text: "I feel a blockage in my creative energy lately." },
    { role: "psychic", text: "This often happens when the North Node is in transition. Let's look at your eighth house." },
  ]);
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  return (
    <div className="fixed inset-0 z-[200] flex bg-[#0a0a0a]/90 backdrop-blur-3xl pt-20">
      
      {/* --- LEFT: DOSSIER --- */}
      <aside className="w-[380px] border-r border-white/10 flex flex-col p-8 gap-8 overflow-y-auto">
        <header className="flex items-center justify-between">
          <span className="text-[10px] font-black uppercase tracking-[0.5em] text-white/30">Target Seeker</span>
          <button onClick={onExit} className="text-white/20 hover:text-white transition-colors">
            <Icon icon="solar:close-circle-bold" className="text-2xl" />
          </button>
        </header>

        <div className="p-8 rounded-[40px] border border-white/10 bg-white/[0.03]">
          <div className="w-20 h-20 rounded-3xl border border-white/20 bg-white/5 flex items-center justify-center mb-6">
            <Icon icon="solar:user-bold" className="text-3xl text-white/20" />
          </div>
          <h3 className="text-2xl font-black text-white italic uppercase tracking-tighter">Sarah Miller</h3>
          <p className="text-[9px] font-black text-white/20 uppercase tracking-[0.2em] mt-2">Verified Seeker #8821</p>
          <div className="mt-8 pt-8 border-t border-white/5 space-y-4">
            <div className="flex justify-between"><span className="text-[10px] text-white/40 uppercase font-black">Sun</span><span className="text-xs text-white font-black">Scorpio</span></div>
            <div className="flex justify-between"><span className="text-[10px] text-white/40 uppercase font-black">Sessions</span><span className="text-xs text-white font-black">14 Total</span></div>
          </div>
        </div>
      </aside>

      {/* --- CENTER: CHAT --- */}
      <main className="flex-1 flex flex-col bg-transparent relative">
        <div className="h-28 flex items-center justify-center absolute top-0 w-full z-20 pointer-events-none">
          <div className="px-10 py-5 rounded-full border border-white/10 bg-white/[0.02] backdrop-blur-3xl flex items-center gap-12 pointer-events-auto">
            <div className="text-center">
              <span className="block text-[8px] font-black text-white/30 uppercase tracking-widest">Active Pulse</span>
              <span className="text-xl font-black text-white tabular-nums italic">14:22</span>
            </div>
            <div className="w-px h-8 bg-white/10" />
            <div className="text-center">
              <span className="block text-[8px] font-black text-white/30 uppercase tracking-widest">Session Credit</span>
              <span className="text-xl font-black text-primary tabular-nums">$42.50</span>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-16 pt-32 pb-12 space-y-12">
          {messages.map((msg, i) => (
            <motion.div key={i} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className={`flex w-full ${msg.role === 'psychic' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[65%] p-10 rounded-[45px] border ${
                msg.role === 'psychic' 
                ? 'bg-white text-black font-black rounded-tr-none border-white shadow-[0_20px_50px_rgba(255,255,255,0.1)]' 
                : 'bg-white/[0.03] text-white font-medium rounded-tl-none border-white/10'
              }`}>
                <p className="text-[15px] leading-relaxed tracking-tight">{msg.text}</p>
              </div>
            </motion.div>
          ))}
          <div ref={scrollRef} />
        </div>

        <footer className="p-12">
          <form className="max-w-4xl mx-auto flex gap-4 p-3 border border-white/20 bg-white/[0.03] rounded-full pl-10 backdrop-blur-xl">
            <input 
              placeholder="Transmit your wisdom..." 
              className="flex-1 bg-transparent border-none outline-none text-white text-sm font-medium"
            />
            <button className="w-16 h-16 rounded-full bg-white text-black flex items-center justify-center hover:scale-105 active:scale-95 transition-all">
              <Icon icon="solar:paper-plane-bold" className="text-2xl" />
            </button>
          </form>
        </footer>
      </main>

      {/* --- RIGHT: NOTES --- */}
      <aside className="w-[380px] border-l border-white/10 flex flex-col bg-white/[0.01]">
        <div className="p-10 border-b border-white/10">
          <span className="text-[10px] font-black uppercase tracking-[0.5em] text-white/40">Intel Archive</span>
          <textarea 
            placeholder="Log session insight..." 
            className="w-full h-32 p-6 rounded-[32px] bg-white/[0.05] border border-white/10 text-xs text-white outline-none mt-8 focus:border-white/30 transition-all resize-none"
          />
          <button className="w-full py-4 mt-4 rounded-2xl bg-white/10 text-[10px] font-black uppercase text-white hover:bg-white/20 transition-all">
            Archive Note
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-10 space-y-6">
          <div className="p-6 rounded-[32px] border border-white/10 bg-white/[0.02]">
            <span className="text-[9px] font-black text-primary uppercase tracking-widest block mb-3">Previous Insight</span>
            <p className="text-xs text-white/60 leading-relaxed italic">"Noted a heavy influence from paternal lineage regarding career fears."</p>
          </div>
        </div>
      </aside>
    </div>
  );
};

export default PsychicChatTerminal;