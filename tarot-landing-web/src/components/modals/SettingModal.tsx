import React, { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Icon } from "@iconify/react";
import type { Setting } from "../../features/settings/types/settings.types";
import PrimaryInput from "../CustomInputs/PrimaryInput";
import { COLORS, TYPOGRAPHY } from "../../theme";

interface SettingModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (key: string, value: string) => Promise<void>;
  setting: Setting | null;
}

const getSettingLabel = (key: string): string => {
  const labels: Record<string, string> = {
    unit_price_cents: "Price of Points (in cents)",
    stripe_api_key: "Stripe API Key",
    privacy_policy: "Privacy Policy",
    terms_of_service: "Terms of Service",
  };
  return labels[key] || key;
};

const getSettingDescription = (key: string): string => {
  const descriptions: Record<string, string> = {
    unit_price_cents: "The price of one point in cents (e.g., 100 = $1.00)",
    stripe_api_key: "Your Stripe secret API key for payment processing",
    privacy_policy: "Privacy policy content in Markdown format",
    terms_of_service: "Terms of service content in Markdown format",
  };
  return descriptions[key] || "";
};

const isLongText = (key: string): boolean => {
  return key === "privacy_policy" || key === "terms_of_service";
};

const SettingModal = ({ isOpen, onClose, onSave, setting }: SettingModalProps) => {
  const [editValue, setEditValue] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (setting) {
      setEditValue(setting.value);
    } else {
      setEditValue("");
    }
  }, [setting, isOpen]);

  if (!isOpen || !setting) return null;

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(setting.key, editValue);
      onClose();
    } finally {
      setSaving(false);
    }
  };

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
          className="relative w-full max-w-2xl overflow-hidden rounded-[44px] border border-white/10 shadow-[0_40px_100px_rgba(0,0,0,0.8)] backdrop-blur-2xl"
          style={{
            backgroundColor: `rgba(13, 13, 13, 0.85)`,
            fontFamily: TYPOGRAPHY.fontFamily.body,
          }}
        >
          <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-primary/40 to-transparent" />

          <div className="px-12 pt-12 pb-8 flex justify-between items-start">
            <div className="flex flex-col gap-1">
              <h3 className="text-3xl font-black uppercase italic tracking-tighter text-white" style={{ fontFamily: TYPOGRAPHY.fontFamily.heading }}>
                Setting <span style={{ color: COLORS.primary }}>Update</span>
              </h3>
              <p className="text-[10px] font-black uppercase tracking-widest mt-1" style={{ color: COLORS.neutralGray }}>
                {getSettingLabel(setting.key)}
              </p>
            </div>

            <button
              onClick={onClose}
              className="w-12 h-12 rounded-2xl flex items-center justify-center bg-white/[0.03] border border-white/5 text-white/20 hover:text-white hover:border-white/20 transition-all duration-300 active:scale-90"
            >
              <Icon icon="solar:close-square-bold-duotone" className="text-2xl" />
            </button>
          </div>

          <div className="px-12 pb-6 space-y-10">
            <div className="flex flex-col gap-3">
              <label className="text-[10px] font-black uppercase tracking-widest text-white/20 ml-1">Key</label>
              <div
                className="px-6 py-4 rounded-2xl border text-sm font-mono"
                style={{
                  backgroundColor: "rgba(255,255,255,0.02)",
                  borderColor: "rgba(255,255,255,0.05)",
                  color: COLORS.neutralGray,
                }}
              >
                {setting.key}
              </div>
            </div>

            <div className="flex flex-col gap-3">
              <label className="text-[10px] font-black uppercase tracking-widest text-white/20 ml-1">
                {isLongText(setting.key) ? "Content" : "Value"}
              </label>
              {isLongText(setting.key) ? (
                <textarea
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  rows={10}
                  className="w-full mb-3 font-mono text-sm p-4 rounded-lg outline-none transition-all"
                  style={{
                    minHeight: "300px",
                    backgroundColor: `${COLORS.neutralWhite}08`,
                    borderLeft: `2px solid ${COLORS.primary}`,
                    color: COLORS.neutralWhite,
                    fontSize: TYPOGRAPHY.fontSize.sm,
                  }}
                />
              ) : (
                <PrimaryInput
                  type={setting.key === "stripe_api_key" ? "password" : "text"}
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  fullWidth
                />
              )}
            </div>

            <p className="text-[10px] font-medium italic" style={{ color: COLORS.neutralGray }}>
              {getSettingDescription(setting.key)}
            </p>
          </div>

          <div className="px-12 pt-6 pb-12 space-y-4">
            <button
              onClick={handleSave}
              disabled={saving}
              className="relative w-full h-[64px] flex items-center justify-center gap-3 overflow-hidden rounded-[24px] transition-all duration-500 hover:scale-[1.01] active:scale-[0.98] group disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
              style={{
                backgroundColor: COLORS.primary,
                boxShadow: `0 20px 40px ${COLORS.primary}20`,
              }}
            >
              <div className="absolute inset-0 w-full h-full bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000" />
              <span className="relative text-dark font-black uppercase text-[11px] tracking-[0.5em] flex items-center gap-2">
                {saving ? (
                  <>
                    <Icon icon="line-md:loading-twotone-loop" className="text-lg" />
                    Saving...
                  </>
                ) : (
                  <>
                    Save Changes
                    <Icon icon="solar:double-alt-arrow-right-bold" className="text-lg animate-pulse" />
                  </>
                )}
              </span>
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

export default SettingModal;
