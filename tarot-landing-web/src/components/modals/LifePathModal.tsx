import React, { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Icon } from "@iconify/react";
import type { LifePathNumber } from "../../features/lifepath/types/lifepath.types";
import PrimaryInput from "../CustomInputs/PrimaryInput";
import PrimarySelect from "../CustomInputs/PrimarySelect";
import { COLORS, TYPOGRAPHY } from "../../theme";

interface LifePathFormData {
  number: number;
  title: string;
  description: string;
  core_strengths: {
    strengths: string[];
  };
  growth_areas: {
    areas: string[];
  };
}

interface LifePathModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: LifePathFormData) => void;
  initialData: LifePathNumber | null;
}

const LifePathModal = ({ isOpen, onClose, onSave, initialData }: LifePathModalProps) => {
  const [formData, setFormData] = useState<LifePathFormData>({
    number: 1,
    title: "",
    description: "",
    core_strengths: { strengths: [""] },
    growth_areas: { areas: [""] },
  });

  useEffect(() => {
    if (initialData) {
      setFormData({
        number: initialData.number,
        title: initialData.title,
        description: initialData.description,
        core_strengths: initialData.core_strengths,
        growth_areas: initialData.growth_areas,
      });
    } else {
      setFormData({
        number: 1,
        title: "",
        description: "",
        core_strengths: { strengths: [""] },
        growth_areas: { areas: [""] },
      });
    }
  }, [initialData, isOpen]);

  const isFormValid = () => {
    return (
      formData.number &&
      formData.title &&
      formData.description &&
      formData.core_strengths.strengths.filter((s) => s.trim()).length > 0 &&
      formData.growth_areas.areas.filter((a) => a.trim()).length > 0
    );
  };

  const addStrength = () => {
    setFormData({
      ...formData,
      core_strengths: {
        strengths: [...formData.core_strengths.strengths, ""],
      },
    });
  };

  const removeStrength = (index: number) => {
    setFormData({
      ...formData,
      core_strengths: {
        strengths: formData.core_strengths.strengths.filter((_, i) => i !== index),
      },
    });
  };

  const updateStrength = (index: number, value: string) => {
    const newStrengths = [...formData.core_strengths.strengths];
    newStrengths[index] = value;
    setFormData({
      ...formData,
      core_strengths: { strengths: newStrengths },
    });
  };

  const addGrowthArea = () => {
    setFormData({
      ...formData,
      growth_areas: {
        areas: [...formData.growth_areas.areas, ""],
      },
    });
  };

  const removeGrowthArea = (index: number) => {
    setFormData({
      ...formData,
      growth_areas: {
        areas: formData.growth_areas.areas.filter((_, i) => i !== index),
      },
    });
  };

  const updateGrowthArea = (index: number, value: string) => {
    const newAreas = [...formData.growth_areas.areas];
    newAreas[index] = value;
    setFormData({
      ...formData,
      growth_areas: { areas: newAreas },
    });
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
                Life Path <span style={{ color: COLORS.primary }}>Number</span>
              </h3>
              <p className="text-[9px] uppercase tracking-widest text-white/20 font-black">
                {initialData ? "Update Life Path Configuration" : "Create New Life Path Number"}
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
            {/* Row 1: Number & Title */}
            <div className="grid grid-cols-3 gap-8">
              <div className="flex flex-col gap-3">
                <label className="text-[10px] font-black uppercase tracking-widest text-white/20 ml-1">
                  Number
                </label>
                <PrimarySelect
                  value={formData.number.toString()}
                  options={[
                    { label: "1", value: "1" },
                    { label: "2", value: "2" },
                    { label: "3", value: "3" },
                    { label: "4", value: "4" },
                    { label: "5", value: "5" },
                    { label: "6", value: "6" },
                    { label: "7", value: "7" },
                    { label: "8", value: "8" },
                    { label: "9", value: "9" },
                    { label: "11 (Master)", value: "11" },
                    { label: "22 (Master)", value: "22" },
                    { label: "33 (Master)", value: "33" },
                  ]}
                  onChange={(val) => setFormData({ ...formData, number: parseInt(val) })}
                />
              </div>
              <div className="flex flex-col gap-3 col-span-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-white/20 ml-1">
                  Title
                </label>
                <PrimaryInput
                  fullWidth
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  placeholder="The Leader"
                />
              </div>
            </div>

            {/* Row 2: Description */}
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
                placeholder="Full description of the life path number..."
              />
            </div>

            {/* Row 3: Core Strengths */}
            <div className="p-8 rounded-[32px] bg-white/[0.02] border border-white/5 space-y-4">
              <div className="flex justify-between items-center">
                <label className="text-[10px] font-black uppercase tracking-widest text-white/20">
                  Core Strengths
                </label>
                <button
                  onClick={addStrength}
                  className="px-4 py-2 rounded-xl bg-primary/10 border border-primary/20 text-primary text-[9px] font-black uppercase tracking-widest hover:bg-primary/20 transition-all"
                >
                  <Icon icon="solar:add-circle-bold" className="inline mr-1" />
                  Add Strength
                </button>
              </div>
              <div className="space-y-3">
                {formData.core_strengths.strengths.map((strength, index) => (
                  <div key={index} className="flex gap-3">
                    <PrimaryInput
                      fullWidth
                      value={strength}
                      onChange={(e) => updateStrength(index, e.target.value)}
                      placeholder={`Strength ${index + 1}`}
                    />
                    {formData.core_strengths.strengths.length > 1 && (
                      <button
                        onClick={() => removeStrength(index)}
                        className="px-4 py-2 rounded-xl bg-red-500/10 border border-red-500/20 text-red-500 hover:bg-red-500/20 transition-all"
                      >
                        <Icon icon="solar:trash-bin-trash-bold" className="text-lg" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Row 4: Growth Areas */}
            <div className="p-8 rounded-[32px] bg-white/[0.02] border border-white/5 space-y-4">
              <div className="flex justify-between items-center">
                <label className="text-[10px] font-black uppercase tracking-widest text-white/20">
                  Growth Areas
                </label>
                <button
                  onClick={addGrowthArea}
                  className="px-4 py-2 rounded-xl bg-starGold/10 border border-starGold/20 text-starGold text-[9px] font-black uppercase tracking-widest hover:bg-starGold/20 transition-all"
                >
                  <Icon icon="solar:add-circle-bold" className="inline mr-1" />
                  Add Area
                </button>
              </div>
              <div className="space-y-3">
                {formData.growth_areas.areas.map((area, index) => (
                  <div key={index} className="flex gap-3">
                    <PrimaryInput
                      fullWidth
                      value={area}
                      onChange={(e) => updateGrowthArea(index, e.target.value)}
                      placeholder={`Growth Area ${index + 1}`}
                    />
                    {formData.growth_areas.areas.length > 1 && (
                      <button
                        onClick={() => removeGrowthArea(index)}
                        className="px-4 py-2 rounded-xl bg-red-500/10 border border-red-500/20 text-red-500 hover:bg-red-500/20 transition-all"
                      >
                        <Icon icon="solar:trash-bin-trash-bold" className="text-lg" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="px-12 pt-6 pb-12 sticky bottom-0 bg-[rgba(13,13,13,0.95)] backdrop-blur-xl">
            <button
              onClick={() => {
                // Filter out empty strings before saving
                const cleanedData = {
                  ...formData,
                  core_strengths: {
                    strengths: formData.core_strengths.strengths.filter((s) => s.trim()),
                  },
                  growth_areas: {
                    areas: formData.growth_areas.areas.filter((a) => a.trim()),
                  },
                };
                onSave(cleanedData);
              }}
              disabled={!isFormValid()}
              className="relative w-full h-[64px] flex items-center justify-center gap-3 overflow-hidden rounded-[24px] transition-all duration-500 hover:scale-[1.01] active:scale-[0.98] group disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
              style={{
                backgroundColor: COLORS.primary,
                boxShadow: `0 20px 40px ${COLORS.primary}20`,
              }}
            >
              <div className="absolute inset-0 w-full h-full bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000" />

              <span className="relative text-dark font-black uppercase text-[11px] tracking-[0.5em] flex items-center gap-2">
                {initialData ? "Save Changes" : "Create Life Path"}
                <Icon icon="solar:double-alt-arrow-right-bold" className="text-lg animate-pulse" />
              </span>
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

export default LifePathModal;
