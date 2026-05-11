import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Icon } from "@iconify/react";
import { COLORS, TYPOGRAPHY } from "../../theme";

interface DeleteModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title?: string;
  description?: string;
  itemName?: string;
}

const DeleteModal = ({ 
  isOpen, 
  onClose, 
  onConfirm, 
  title = "Purge Protocol", 
  description = "Are you sure you want to permanently delete this node from the registry?",
  itemName
}: DeleteModalProps) => {
  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[110] flex items-center justify-center p-6">
        {/* Deep Ambient Blur Layer */}
        <motion.div 
          initial={{ opacity: 0 }} 
          animate={{ opacity: 1 }} 
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="absolute inset-0 bg-black/60 backdrop-blur-md"
        />

        {/* The Warning Card */}
        <motion.div 
          initial={{ scale: 0.95, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.95, opacity: 0, y: 20 }}
          className="relative w-full max-w-[380px] overflow-hidden rounded-[44px] border border-white/10 shadow-[0_40px_100px_rgba(0,0,0,0.8)] backdrop-blur-2xl"
          style={{ 
            backgroundColor: `rgba(13, 13, 13, 0.85)`,
            fontFamily: TYPOGRAPHY.fontFamily.body 
          }}
        >
          {/* Warning Accent Line */}
          <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-white/20 to-transparent" />

          <div className="p-10 flex flex-col items-center text-center">
            {/* Warning Icon Cluster */}
            <div className="mb-8 relative">
              <div className="w-20 h-20 rounded-3xl bg-white/[0.03] border border-white/5 flex items-center justify-center rotate-45 group transition-transform duration-500">
                <Icon 
                  icon="solar:shield-warning-bold-duotone" 
                  className="-rotate-45 text-4xl" 
                  style={{ color: COLORS.primary }}
                />
              </div>
              <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-black border border-white/10 flex items-center justify-center">
                <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: COLORS.primary }} />
              </div>
            </div>

            {/* Typography Header */}
            <div className="space-y-2 mb-10">
              <h3 className="text-2xl font-black uppercase italic tracking-tighter text-white" style={{ fontFamily: TYPOGRAPHY.fontFamily.heading }}>
                {title}
              </h3>
              <div className="flex flex-col gap-1">
                 <p className="text-[11px] text-white/40 leading-relaxed font-medium uppercase tracking-widest px-2">
                    {description}
                 </p>
                 {itemName && (
                    <span className="text-[10px] text-primary font-black uppercase tracking-[0.3em] mt-2 border border-primary/10 py-2 px-4 rounded-full inline-block mx-auto">
                        {itemName}
                    </span>
                 )}
              </div>
            </div>

            {/* Action Stack */}
            <div className="w-full flex flex-col gap-4">
              <button 
                onClick={onConfirm}
                className="group relative w-full h-[56px] flex items-center justify-center rounded-[20px] transition-all duration-300 hover:scale-[1.02] active:scale-[0.98]"
                style={{ 
                  backgroundColor: COLORS.primary,
                  boxShadow: `0 15px 30px ${COLORS.primary}15` 
                }}
              >
                <span className="text-dark font-black uppercase text-[10px] tracking-[0.4em]">
                  Authorize Purge
                </span>
              </button>
              
              <button 
                onClick={onClose}
                className="w-full h-[56px] rounded-[20px] text-white/20 font-black uppercase text-[10px] tracking-[0.4em] hover:text-white hover:bg-white/5 transition-all duration-300"
              >
                Abort Protocol
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

export default DeleteModal;