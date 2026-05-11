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
        <div className="fixed inset-0 z-[150] flex items-center justify-center p-4">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/60 backdrop-blur-md"
          />

          {/* Modal Card */}
          <motion.div
            initial={{ scale: 0.98, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.98, opacity: 0 }}
            className="relative w-full max-w-4xl rounded-[40px] border border-white/20 overflow-hidden shadow-2xl"
            style={{ backgroundColor: "transparent", fontFamily: TYPOGRAPHY.fontFamily.body }}
          >
            <div className="bg-white/[0.03] backdrop-blur-2xl">
              {/* Header */}
              <div className="px-10 py-8 border-b border-white/10 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <Icon icon="solar:user-id-bold-duotone" className="text-3xl text-white" />
                  <div>
                    <h3 className="text-xl font-black uppercase italic tracking-tighter text-white">
                      Practitioner <span style={{ color: COLORS.primary }}>Profile</span>
                    </h3>
                    <p className="text-[10px] font-black uppercase tracking-[0.4em] text-white/40">
                      Identity Overview
                    </p>
                  </div>
                </div>
                <button onClick={onClose} className="text-white/20 hover:text-white transition-colors">
                  <Icon icon="solar:close-circle-bold" className="text-2xl" />
                </button>
              </div>

              {/* Content */}
              <div className="p-10 grid grid-cols-12 gap-8">
                {/* Left Column - Profile Picture and Basic Info */}
                <div className="col-span-4 space-y-6">
                  <div className="relative">
                    <div
                      className="w-full aspect-square rounded-3xl overflow-hidden border-2"
                      style={{ borderColor: `${COLORS.primary}40` }}
                    >
                      <img
                        src={psychic.profile_picture_url || "https://images.unsplash.com/photo-1544005313-94ddf0286df2?q=80&w=400&auto=format&fit=crop"}
                        alt={psychic.username}
                        className="w-full h-full object-cover"
                      />
                    </div>
                    {/* Online Status Badge */}
                    <div
                      className="absolute top-4 right-4 px-4 py-2 rounded-xl backdrop-blur-xl border flex items-center gap-2"
                      style={{
                        backgroundColor: psychic.is_online ? `${COLORS.primary}20` : `${COLORS.starGold}20`,
                        borderColor: psychic.is_online ? `${COLORS.primary}60` : `${COLORS.starGold}60`,
                      }}
                    >
                      <div
                        className="w-2 h-2 rounded-full animate-pulse"
                        style={{
                          backgroundColor: psychic.is_online ? COLORS.primary : COLORS.starGold,
                          boxShadow: `0 0 8px ${psychic.is_online ? COLORS.primary : COLORS.starGold}`,
                        }}
                      />
                      <span
                        className="text-[10px] font-black uppercase tracking-widest"
                        style={{ color: psychic.is_online ? COLORS.primary : COLORS.starGold }}
                      >
                        {psychic.is_online ? "Online" : "Offline"}
                      </span>
                    </div>
                  </div>

                  {/* Verification Badge */}
                  {psychic.is_verified && (
                    <div
                      className="flex items-center gap-2 p-4 rounded-2xl border"
                      style={{
                        backgroundColor: `${COLORS.primary}10`,
                        borderColor: `${COLORS.primary}30`,
                      }}
                    >
                      <Icon icon="solar:verified-check-bold" className="text-xl" style={{ color: COLORS.primary }} />
                      <span className="text-xs font-bold uppercase text-white/80">Verified Account</span>
                    </div>
                  )}
                </div>

                {/* Right Column - Details */}
                <div className="col-span-8 space-y-6">
                  {/* Username and Email */}
                  <div className="space-y-4">
                    <div>
                      <label className="text-[10px] font-black uppercase tracking-widest text-white/40 mb-2 block">
                        Username
                      </label>
                      <div className="flex items-center gap-2">
                        <Icon icon="solar:user-bold-duotone" className="text-lg text-primary" />
                        <span className="text-lg font-bold text-white">@{psychic.username}</span>
                      </div>
                    </div>

                    <div>
                      <label className="text-[10px] font-black uppercase tracking-widest text-white/40 mb-2 block">
                        Email
                      </label>
                      <div className="flex items-center gap-2">
                        <Icon icon="solar:letter-bold-duotone" className="text-lg text-primary" />
                        <span className="text-sm text-white/80">{psychic.email}</span>
                      </div>
                    </div>
                  </div>

                  {/* Categories */}
                  <div>
                    <label className="text-[10px] font-black uppercase tracking-widest text-white/40 mb-3 block">
                      Specialties
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {psychic.categories.length > 0 ? (
                        psychic.categories.map((category) => (
                          <div
                            key={category.id}
                            className="px-4 py-2 rounded-xl border flex items-center gap-2"
                            style={{
                              backgroundColor: `${COLORS.primary}10`,
                              borderColor: `${COLORS.primary}30`,
                            }}
                          >
                            <Icon icon="solar:star-bold-duotone" className="text-sm" style={{ color: COLORS.primary }} />
                            <span className="text-xs font-bold text-white/90">{category.title}</span>
                          </div>
                        ))
                      ) : (
                        <span className="text-sm text-white/40 italic">No specialties defined</span>
                      )}
                    </div>
                  </div>

                  {/* Bio */}
                  <div>
                    <label className="text-[10px] font-black uppercase tracking-widest text-white/40 mb-3 block">
                      Biography
                    </label>
                    <p className="text-sm text-white/80 leading-relaxed">
                      {psychic.bio || "No biography provided."}
                    </p>
                  </div>

                  {/* Pricing */}
                  <div>
                    <label className="text-[10px] font-black uppercase tracking-widest text-white/40 mb-3 block">
                      Pricing
                    </label>
                    <div className="flex items-center gap-6">
                      <div
                        className="flex items-center gap-3 px-6 py-4 rounded-2xl border"
                        style={{
                          backgroundColor: `${COLORS.primary}10`,
                          borderColor: `${COLORS.primary}30`,
                        }}
                      >
                        <Icon icon="solar:dollar-bold-duotone" className="text-2xl" style={{ color: COLORS.primary }} />
                        <div>
                          <div className="text-xs font-bold text-white/60 uppercase">Per Minute</div>
                          <div className="text-lg font-black text-white">
                            ${(psychic.price_per_second * 60).toFixed(2)}
                          </div>
                        </div>
                      </div>
                      <div className="text-xs text-white/40">
                        <div className="font-bold">Per Second</div>
                        <div>${psychic.price_per_second.toFixed(3)}</div>
                      </div>
                    </div>
                  </div>

                  {/* Availability */}
                  <div>
                    <label className="text-[10px] font-black uppercase tracking-widest text-white/40 mb-3 block">
                      Availability Schedule
                    </label>
                    {psychic.availability.length > 0 ? (
                      <div className="grid grid-cols-2 gap-3">
                        {psychic.availability.map((slot, index) => (
                          <div
                            key={index}
                            className="p-4 rounded-2xl border"
                            style={{
                              backgroundColor: `${COLORS.surface}80`,
                              borderColor: `${COLORS.neutralWhite}10`,
                            }}
                          >
                            <div className="flex items-center gap-2 mb-2">
                              <Icon icon="solar:calendar-bold-duotone" className="text-sm text-primary" />
                              <span className="text-xs font-black uppercase text-white/80">
                                {slot.day_of_the_week}
                              </span>
                            </div>
                            <div className="text-xs text-white/60 font-medium">
                              {slot.start_at} — {slot.end_at}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <span className="text-sm text-white/40 italic">No availability defined</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div className="px-10 py-6 border-t border-white/10 flex justify-end">
                <button
                  onClick={onClose}
                  className="px-8 py-3 rounded-2xl border border-white/20 text-xs font-black uppercase tracking-wider text-white hover:bg-white/5 transition-all"
                >
                  Close
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

export default PsychicDetailsModal;
