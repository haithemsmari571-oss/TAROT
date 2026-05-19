import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Icon } from "@iconify/react";
import type { AdminUserListItem } from "../../features/users/types/user.types";
import PrimaryInput from "../CustomInputs/PrimaryInput";
import { COLORS, TYPOGRAPHY } from "../../theme";

interface GiftBalanceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onGift: (userId: number, amount: number, message: string) => Promise<void>;
  user: AdminUserListItem | null;
}

const GiftBalanceModal = ({ isOpen, onClose, onGift, user }: GiftBalanceModalProps) => {
  const [amount, setAmount] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  if (!isOpen || !user) return null;

  const handleGift = async () => {
    const parsedAmount = parseInt(amount, 10);
    if (isNaN(parsedAmount) || parsedAmount <= 0) return;

    setSaving(true);
    try {
      await onGift(user.id, parsedAmount, message);
      setAmount("");
      setMessage("");
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const canSubmit = parseInt(amount, 10) > 0;

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
          className="relative w-full max-w-lg overflow-hidden rounded-[44px] border border-white/10 shadow-[0_40px_100px_rgba(0,0,0,0.8)] backdrop-blur-2xl"
          style={{
            backgroundColor: `rgba(13, 13, 13, 0.85)`,
            fontFamily: TYPOGRAPHY.fontFamily.body,
          }}
        >
          <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-primary/40 to-transparent" />

          <div className="px-12 pt-12 pb-8 flex justify-between items-start">
            <div className="flex flex-col gap-1">
              <h3 className="text-3xl font-black uppercase italic tracking-tighter text-white" style={{ fontFamily: TYPOGRAPHY.fontFamily.heading }}>
                Gift <span style={{ color: COLORS.primary }}>Balance</span>
              </h3>
              <p className="text-[10px] font-black uppercase tracking-widest mt-1" style={{ color: COLORS.neutralGray }}>
                Gift points to {user.username}
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
            <div className="p-6 rounded-[24px] bg-white/[0.02] border border-white/5 flex items-center justify-between">
              <span className="text-[10px] font-black uppercase tracking-widest text-white/20">Current Balance</span>
              <span className="text-xl font-black text-white">
                {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(user.balance / 100)}
              </span>
            </div>

            <div className="flex flex-col gap-3">
              <label className="text-[10px] font-black uppercase tracking-widest text-white/20 ml-1">
                Amount (points)
              </label>
              <PrimaryInput
                type="text"
                inputMode="numeric"
                value={amount}
                onChange={(e) => setAmount(e.target.value.replace(/\D/g, ''))}
                placeholder="e.g. 500"
                fullWidth
              />
            </div>

            <div className="flex flex-col gap-3">
              <label className="text-[10px] font-black uppercase tracking-widest text-white/20 ml-1">
                Message (optional)
              </label>
              <PrimaryInput
                type="text"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="A personal message..."
                fullWidth
              />
            </div>
          </div>

          <div className="px-12 pt-6 pb-12 space-y-4">
            <button
              onClick={handleGift}
              disabled={!canSubmit || saving}
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
                    Sending...
                  </>
                ) : (
                  <>
                    Send Gift
                    <Icon icon="solar:gift-bold-duotone" className="text-lg animate-pulse" />
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

export default GiftBalanceModal;
