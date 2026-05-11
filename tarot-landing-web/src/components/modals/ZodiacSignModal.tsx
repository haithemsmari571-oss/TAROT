import React, { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Icon } from "@iconify/react";
import type { ZodiacSign } from "../../features/zodiac/types/zodiac.types";
import PrimaryInput from "../CustomInputs/PrimaryInput";
import PrimarySelect from "../CustomInputs/PrimarySelect";
import { COLORS, TYPOGRAPHY } from "../../theme";

interface ZodiacSignFormData {
  name: string;
  element: string;
  modality: string;
  ruling_planet: string;
  date_range_start: string;
  date_range_end: string;
  core_trait: string;
  signature_trait: string;
  description: string;
}

interface ZodiacSignModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: ZodiacSignFormData) => void;
  initialData: ZodiacSign | null;
}

const ZodiacSignModal = ({ isOpen, onClose, onSave, initialData }: ZodiacSignModalProps) => {
  const [formData, setFormData] = useState<ZodiacSignFormData>({
    name: "",
    element: "Fire",
    modality: "Cardinal",
    ruling_planet: "",
    date_range_start: "",
    date_range_end: "",
    core_trait: "",
    signature_trait: "",
    description: "",
  });

  useEffect(() => {
    if (initialData) {
      setFormData({
        name: initialData.name,
        element: initialData.element,
        modality: initialData.modality,
        ruling_planet: initialData.ruling_planet,
        date_range_start: initialData.date_range_start,
        date_range_end: initialData.date_range_end,
        core_trait: initialData.core_trait,
        signature_trait: initialData.signature_trait,
        description: initialData.description,
      });
    } else {
      setFormData({
        name: "",
        element: "Fire",
        modality: "Cardinal",
        ruling_planet: "",
        date_range_start: "",
        date_range_end: "",
        core_trait: "",
        signature_trait: "",
        description: "",
      });
    }
  }, [initialData, isOpen]);

  const isFormValid = () => {
    return (
      formData.name &&
      formData.element &&
      formData.modality &&
      formData.ruling_planet &&
      formData.date_range_start &&
      formData.date_range_end &&
      formData.core_trait &&
      formData.signature_trait &&
      formData.description
    );
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="absolute inset-0 bg-black/60 backdrop-blur-md"
        />

        <motion.div
          initial={{ scale: 0.92, opacity: 0, y: 30 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.92, opacity: 0, y: 30 }}
          transition={{ type: "spring", damping: 25, stiffness: 300 }}
          className="relative w-full max-w-3xl overflow-hidden rounded-[44px] border border-white/10 shadow-[0_40px_100px_rgba(0,0,0,0.8)] backdrop-blur-2xl max-h-[90vh] overflow-y-auto"
          style={{
            backgroundColor: `rgba(13, 13, 13, 0.85)`,
            fontFamily: TYPOGRAPHY.fontFamily.body,
          }}
        >
          <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-primary/40 to-transparent" />

          {/* Header */}
          <div className="px-12 pt-12 pb-8 flex justify-between items-start sticky top-0 bg-[rgba(13,13,13,0.95)] backdrop-blur-xl z-10">
            <div className="flex flex-col gap-1">
              <h3
                className="text-3xl font-black uppercase italic tracking-tighter text-white"
                style={{ fontFamily: TYPOGRAPHY.fontFamily.heading }}
              >
                Zodiac <span style={{ color: COLORS.primary }}>Sign</span>
              </h3>
              <p className="text-[9px] uppercase tracking-widest text-white/20 font-black">
                {initialData ? "Update Zodiac Configuration" : "Create New Zodiac Sign"}
              </p>
            </div>

            <button
              onClick={onClose}
              className="w-12 h-12 rounded-2xl flex items-center justify-center bg-white/[0.03] border border-white/5 text-white/20 hover:text-white hover:border-white/20 transition-all duration-300 active:scale-90"
            >
              <Icon icon="solar:close-square-bold-duotone" className="text-2xl" />
            </button>
          </div>

          {/* Body */}
          <div className="px-12 pb-6 space-y-8">
            {/* Row 1: Name & Element */}
            <div className="grid grid-cols-2 gap-8">
              <div className="flex flex-col gap-3">
                <label className="text-[10px] font-black uppercase tracking-widest text-white/20 ml-1">
                  Sign Name
                </label>
                <PrimaryInput
                  fullWidth
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Aries"
                />
              </div>
              <div className="flex flex-col gap-3">
                <label className="text-[10px] font-black uppercase tracking-widest text-white/20 ml-1">
                  Element
                </label>
                <PrimarySelect
                  value={formData.element}
                  options={[
                    { label: "Fire", value: "Fire" },
                    { label: "Earth", value: "Earth" },
                    { label: "Air", value: "Air" },
                    { label: "Water", value: "Water" },
                  ]}
                  onChange={(val) => setFormData({ ...formData, element: val })}
                />
              </div>
            </div>

            {/* Row 2: Modality & Ruling Planet */}
            <div className="grid grid-cols-2 gap-8">
              <div className="flex flex-col gap-3">
                <label className="text-[10px] font-black uppercase tracking-widest text-white/20 ml-1">
                  Modality
                </label>
                <PrimarySelect
                  value={formData.modality}
                  options={[
                    { label: "Cardinal", value: "Cardinal" },
                    { label: "Fixed", value: "Fixed" },
                    { label: "Mutable", value: "Mutable" },
                  ]}
                  onChange={(val) => setFormData({ ...formData, modality: val })}
                />
              </div>
              <div className="flex flex-col gap-3">
                <label className="text-[10px] font-black uppercase tracking-widest text-white/20 ml-1">
                  Ruling Planet
                </label>
                <PrimaryInput
                  fullWidth
                  value={formData.ruling_planet}
                  onChange={(e) => setFormData({ ...formData, ruling_planet: e.target.value })}
                  placeholder="Mars"
                />
              </div>
            </div>

            {/* Row 3: Date Ranges */}
            <div className="p-8 rounded-[32px] bg-white/[0.02] border border-white/5 grid grid-cols-2 gap-8">
              <div className="flex flex-col gap-3">
                <label className="text-[10px] font-black uppercase tracking-widest text-white/20 ml-1">
                  Date Range Start (MM-DD)
                </label>
                <PrimaryInput
                  fullWidth
                  value={formData.date_range_start}
                  onChange={(e) => setFormData({ ...formData, date_range_start: e.target.value })}
                  placeholder="03-21"
                />
              </div>
              <div className="flex flex-col gap-3">
                <label className="text-[10px] font-black uppercase tracking-widest text-white/20 ml-1">
                  Date Range End (MM-DD)
                </label>
                <PrimaryInput
                  fullWidth
                  value={formData.date_range_end}
                  onChange={(e) => setFormData({ ...formData, date_range_end: e.target.value })}
                  placeholder="04-19"
                />
              </div>
            </div>

            {/* Row 4: Traits */}
            <div className="grid grid-cols-2 gap-8">
              <div className="flex flex-col gap-3">
                <label className="text-[10px] font-black uppercase tracking-widest text-white/20 ml-1">
                  Core Trait
                </label>
                <PrimaryInput
                  fullWidth
                  value={formData.core_trait}
                  onChange={(e) => setFormData({ ...formData, core_trait: e.target.value })}
                  placeholder="Courageous"
                />
              </div>
              <div className="flex flex-col gap-3">
                <label className="text-[10px] font-black uppercase tracking-widest text-white/20 ml-1">
                  Signature Trait
                </label>
                <PrimaryInput
                  fullWidth
                  value={formData.signature_trait}
                  onChange={(e) => setFormData({ ...formData, signature_trait: e.target.value })}
                  placeholder="Bold and ambitious"
                />
              </div>
            </div>

            {/* Row 5: Description */}
            <div className="flex flex-col gap-3">
              <label className="text-[10px] font-black uppercase tracking-widest text-white/20 ml-1">
                Description
              </label>
              <textarea
                className="w-full h-32 px-6 py-4 rounded-2xl border text-sm resize-none"
                style={{
                  backgroundColor: "rgba(255,255,255,0.02)",
                  borderColor: "rgba(255,255,255,0.05)",
                  color: COLORS.neutralGray,
                  fontFamily: TYPOGRAPHY.fontFamily.body,
                }}
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Full description of the zodiac sign..."
              />
            </div>
          </div>

          {/* Footer */}
          <div className="px-12 pt-6 pb-12 sticky bottom-0 bg-[rgba(13,13,13,0.95)] backdrop-blur-xl">
            <button
              onClick={() => onSave(formData)}
              disabled={!isFormValid()}
              className="relative w-full h-[64px] flex items-center justify-center gap-3 overflow-hidden rounded-[24px] transition-all duration-500 hover:scale-[1.01] active:scale-[0.98] group disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
              style={{
                backgroundColor: COLORS.primary,
                boxShadow: `0 20px 40px ${COLORS.primary}20`,
              }}
            >
              <div className="absolute inset-0 w-full h-full bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000" />

              <span className="relative text-dark font-black uppercase text-[11px] tracking-[0.5em] flex items-center gap-2">
                {initialData ? "Save Changes" : "Create Sign"}
                <Icon icon="solar:double-alt-arrow-right-bold" className="text-lg animate-pulse" />
              </span>
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

export default ZodiacSignModal;
