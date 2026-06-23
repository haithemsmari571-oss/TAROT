import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Icon } from "@iconify/react";
import { COLORS, TYPOGRAPHY } from "../../theme";
import type { Psychic } from "../../features/psychics/data/PractitionersUsers";

interface PsychicDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  psychic: Psychic | null;
}

const PsychicDetailsModal = ({ isOpen, onClose, psychic }: PsychicDetailsModalProps) => {
  if (!psychic) return null;

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 sm:p-6 md:p-10">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/80 backdrop-blur-md"
          />

          {/* Modal Card */}
          <motion.div
            initial={{ scale: 0.96, opacity: 0, y: 15 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.96, opacity: 0, y: 15 }}
            transition={{ type: "spring", duration: 0.5, bounce: 0.15 }}
            className="relative w-full max-w-4xl max-h-[90vh] flex flex-col rounded-[32px] border border-white/10 overflow-hidden shadow-[0_50px_100px_-20px_rgba(0,0,0,0.7)]"
            style={{ 
              backgroundColor: `${COLORS.surface}95`, 
              fontFamily: TYPOGRAPHY.fontFamily.body,
              backdropFilter: "blur(30px)"
            }}
          >
            {/* Ambient Radial Glow Effect inside container */}
            <div className="absolute top-0 left-1/4 -translate-x-1/2 w-[300px] h-[300px] bg-primary/5 rounded-full blur-[120px] pointer-events-none" style={{ backgroundColor: COLORS.primary }} />

            {/* Header (Sticky / Fixed at top) */}
            <div className="relative px-8 py-6 border-b border-white/5 flex items-center justify-between bg-white/[0.01] backdrop-blur-md z-10">
              <div className="flex items-center gap-4">
                <div className="p-3 rounded-2xl border border-white/5 bg-white/[0.02]" style={{ color: COLORS.primary }}>
                  <Icon icon="solar:user-id-bold-duotone" className="text-2xl" />
                </div>
                <div>
                  <h3 className="text-xl font-black uppercase italic tracking-tighter text-white">
                    Practitioner <span style={{ color: COLORS.primary }}>Profile</span>
                  </h3>
                  <p className="text-[9px] font-black uppercase tracking-[0.4em] text-white/30 mt-0.5">
                    Identity Overview
                  </p>
                </div>
              </div>
              <button 
                onClick={onClose} 
                className="p-2.5 rounded-xl border border-white/5 bg-white/[0.02] text-white/40 hover:text-white hover:border-white/20 transition-all active:scale-95"
              >
                <Icon icon="solar:close-circle-bold" className="text-xl" />
              </button>
            </div>

            {/* Scrollable Content Body */}
            <div className="flex-1 overflow-y-auto p-8 md:p-10 grid grid-cols-12 gap-8 custom-scrollbar">
              
              {/* Left Column - Profile Picture & Quick Badges (Sticky-ish within container limits) */}
              <div className="col-span-12 md:col-span-4 space-y-5">
                <div className="relative group">
                  <div
                    className="w-full aspect-square rounded-2xl overflow-hidden border-2 bg-black/20 relative shadow-xl"
                    style={{ borderColor: `${COLORS.primary}20` }}
                  >
                    <img
                      src={psychic.profile_picture_url || "https://images.unsplash.com/photo-1544005313-94ddf0286df2?q=80&w=400&auto=format&fit=crop"}
                      alt={psychic.username}
                      className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                    />
                  </div>
                  
                  {/* Status Badge Over Image */}
                  <div
                    className="absolute bottom-3 right-3 px-3 py-1.5 rounded-xl backdrop-blur-xl border flex items-center gap-1.5 shadow-lg"
                    style={{
                      backgroundColor: psychic.is_online ? "rgba(0, 0, 0, 0.6)" : "rgba(0, 0, 0, 0.6)",
                      borderColor: psychic.is_online ? `${COLORS.primary}40` : "rgba(255,255,255,0.1)",
                    }}
                  >
                    <div
                      className="w-1.5 h-1.5 rounded-full animate-pulse"
                      style={{
                        backgroundColor: psychic.is_online ? COLORS.primary : "#94a3b8",
                        boxShadow: psychic.is_online ? `0 0 8px ${COLORS.primary}` : "none",
                      }}
                    />
                    <span
                      className="text-[9px] font-black uppercase tracking-widest"
                      style={{ color: psychic.is_online ? COLORS.primary : "#94a3b8" }}
                    >
                      {psychic.is_online ? "Online" : "Offline"}
                    </span>
                  </div>
                </div>

                {/* Verification Badge */}
                {psychic.is_verified && (
                  <div
                    className="flex items-center gap-3 p-4 rounded-xl border bg-gradient-to-r from-white/[0.02] to-transparent"
                    style={{ borderColor: `${COLORS.primary}20` }}
                  >
                    <Icon icon="solar:verified-check-bold" className="text-xl" style={{ color: COLORS.primary }} />
                    <div>
                      <span className="text-[10px] font-black uppercase tracking-wider text-white block">Verified Profile</span>
                      <span className="text-[9px] text-white/40 block mt-0.5">Vetted platform practitioner</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Right Column - Comprehensive Details Fields */}
              <div className="col-span-12 md:col-span-8 space-y-6">
                
                {/* Username and Email Grid Row */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="p-4 rounded-xl border border-white/5 bg-white/[0.01]">
                    <label className="text-[9px] font-black uppercase tracking-widest text-white/30 mb-1.5 block">
                      Username
                    </label>
                    <div className="flex items-center gap-2">
                      <Icon icon="solar:user-bold-duotone" className="text-base text-white/40" />
                      <span className="text-sm font-bold text-white">@{psychic.username}</span>
                    </div>
                  </div>

                  <div className="p-4 rounded-xl border border-white/5 bg-white/[0.01]">
                    <label className="text-[9px] font-black uppercase tracking-widest text-white/30 mb-1.5 block">
                      Email Address
                    </label>
                    <div className="flex items-center gap-2">
                      <Icon icon="solar:letter-bold-duotone" className="text-base text-white/40" />
                      <span className="text-sm font-medium text-white/80 select-all">{psychic.email}</span>
                    </div>
                  </div>
                </div>

                {/* Specialties Container */}
                <div>
                  <label className="text-[9px] font-black uppercase tracking-widest text-white/30 mb-2.5 block">
                    Specialties & Categories
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {psychic.categories && psychic.categories.length > 0 ? (
                      psychic.categories.map((category) => (
                        <div
                          key={category.id}
                          className="px-3.5 py-1.5 rounded-lg border flex items-center gap-2 bg-white/[0.02]"
                          style={{ borderColor: "rgba(255,255,255,0.06)" }}
                        >
                          <Icon icon="solar:star-bold-duotone" className="text-xs" style={{ color: COLORS.primary }} />
                          <span className="text-xs font-semibold text-white/90">{category.title}</span>
                        </div>
                      ))
                    ) : (
                      <span className="text-xs text-white/30 italic">No specialities linked to this account</span>
                    )}
                  </div>
                </div>

                {/* Biography Section */}
                <div>
                  <label className="text-[9px] font-black uppercase tracking-widest text-white/30 mb-2 block">
                    Biography
                  </label>
                  <div className="p-4 rounded-xl border border-white/5 bg-white/[0.01]">
                    <p className="text-xs text-white/70 leading-relaxed whitespace-pre-line">
                      {psychic.bio || "No description layout summary provided by the practitioner yet."}
                    </p>
                  </div>
                </div>

                {/* Pricing Block Matrix */}
                <div>
                  <label className="text-[9px] font-black uppercase tracking-widest text-white/30 mb-2 block">
                    Rate Metrics
                  </label>
                  <div className="flex flex-wrap items-center gap-4">
                    <div
                      className="flex items-center gap-3.5 px-5 py-3 rounded-xl border bg-gradient-to-br from-white/[0.02] to-transparent shadow-md"
                      style={{ borderColor: `${COLORS.primary}20` }}
                    >
                      <Icon icon="solar:dollar-bold-duotone" className="text-xl" style={{ color: COLORS.primary }} />
                      <div>
                        <div className="text-[9px] font-black text-white/40 uppercase tracking-wider">Per Minute Rate</div>
                        <div className="text-base font-black text-white mt-0.5">
                          ${(psychic.price_per_second * 60).toFixed(2)}
                        </div>
                      </div>
                    </div>
                    
                    <div className="px-4 py-2 border-l border-white/10">
                      <div className="text-[9px] text-white/30 font-black uppercase tracking-wider">Exact Per Second Base</div>
                      <div className="text-xs text-white/60 font-semibold mt-0.5">${psychic.price_per_second.toFixed(4)}</div>
                    </div>
                  </div>
                </div>

                {/* Availability Schedule SubGrid */}
                <div>
                  <label className="text-[9px] font-black uppercase tracking-widest text-white/30 mb-2.5 block">
                    Operational Availability Windows
                  </label>
                  {psychic.availability && psychic.availability.length > 0 ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {psychic.availability.map((slot, index) => (
                        <div
                          key={index}
                          className="px-4 py-3 rounded-xl border flex items-center justify-between bg-white/[0.01]"
                          style={{ borderColor: "rgba(255,255,255,0.04)" }}
                        >
                          <div className="flex items-center gap-2">
                            <Icon icon="solar:calendar-bold-duotone" className="text-xs text-white/30" />
                            <span className="text-[11px] font-black uppercase tracking-wider text-white/80">
                              {slot.day_of_the_week}
                            </span>
                          </div>
                          <div className="text-[11px] font-mono text-white/50 bg-black/20 px-2 py-0.5 rounded-md border border-white/5">
                            {slot.start_at} — {slot.end_at}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="p-4 text-center rounded-xl border border-dashed border-white/5 text-xs text-white/30 italic">
                      No static operational schedules active
                    </div>
                  )}
                </div>

              </div>
            </div>

            {/* Footer Control Panel (Fixed bottom border block) */}
            <div className="px-8 py-5 border-t border-white/5 bg-white/[0.01] backdrop-blur-md flex justify-end z-10">
              <button
                onClick={onClose}
                className="px-6 py-2.5 rounded-xl border border-white/10 text-xs font-black uppercase tracking-widest text-white hover:bg-white/5 active:scale-98 transition-all"
              >
                Close Profile
              </button>
            </div>
          </motion.div>
        </div>
      )}
      
      {/* Dynamic Native Scrollbar Integration Stylesheet Injector */}
      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.05);
          border-radius: 20px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(255, 255, 255, 0.15);
        }
      `}</style>
    </AnimatePresence>
  );
};

export default PsychicDetailsModal;