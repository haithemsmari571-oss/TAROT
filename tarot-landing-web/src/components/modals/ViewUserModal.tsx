import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Icon } from "@iconify/react";
import type { AdminUserListItem } from "../../features/users/types/user.types";
import { COLORS, TYPOGRAPHY } from "../../theme";

interface ViewUserModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: AdminUserListItem;
}

const ViewUserModal = ({ isOpen, onClose, user }: ViewUserModalProps) => {
  if (!isOpen) return null;

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
        {/* Overlay */}
        <motion.div 
          initial={{ opacity: 0 }} 
          animate={{ opacity: 1 }} 
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="absolute inset-0 bg-black/60 backdrop-blur-md"
        />

        {/* Modal Card */}
        <motion.div 
          initial={{ scale: 0.92, opacity: 0, y: 30 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.92, opacity: 0, y: 30 }}
          transition={{ type: "spring", damping: 25, stiffness: 300 }}
          className="relative w-full max-w-2xl overflow-hidden rounded-[44px] border border-white/10 shadow-[0_40px_100px_rgba(0,0,0,0.8)] backdrop-blur-2xl"
          style={{ 
            backgroundColor: `rgba(13, 13, 13, 0.85)`,
            fontFamily: TYPOGRAPHY.fontFamily.body 
          }}
        >
          {/* Top-Edge Glow */}
          <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-primary/40 to-transparent" />
          
          {/* Header */}
          <div className="px-12 pt-12 pb-8 flex justify-between items-start">
            <div className="flex flex-col gap-1">
              <h3 className="text-3xl font-black uppercase italic tracking-tighter text-white" style={{ fontFamily: TYPOGRAPHY.fontFamily.heading }}>
                User <span style={{ color: COLORS.primary }}>Details</span>
              </h3>
            </div>
            
            <button 
              onClick={onClose} 
              className="w-12 h-12 rounded-2xl flex items-center justify-center bg-white/[0.03] border border-white/5 text-white/20 hover:text-white hover:border-white/20 transition-all duration-300 active:scale-90"
            >
              <Icon icon="solar:close-square-bold-duotone" className="text-2xl" />
            </button>
          </div>

          {/* Body */}
          <div className="px-12 pb-12 space-y-6">
            
            {/* User Profile Section */}
            <div className="p-8 rounded-[32px] bg-white/[0.02] border border-white/5">
              <div className="flex items-center gap-6 mb-6">
                <div 
                  className="w-20 h-20 rounded-2xl flex items-center justify-center font-black text-2xl border"
                  style={{ 
                    backgroundColor: `rgba(255,255,255,0.02)`, 
                    borderColor: `rgba(255,255,255,0.05)`,
                    color: COLORS.primary,
                    fontFamily: TYPOGRAPHY.fontFamily.heading
                  }}
                >
                  {user.profile_picture_path ? (
                    <img src={user.profile_picture_path} alt={user.username} className="w-full h-full object-cover rounded-2xl" />
                  ) : (
                    user.username.substring(0, 2).toUpperCase()
                  )}
                </div>
                <div className="flex-1">
                  <h4 className="text-2xl font-black text-white mb-1">{user.username}</h4>
                  <p className="text-sm text-white/40">{user.email}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-6">
                <div className="flex flex-col gap-2">
                  <span className="text-[10px] font-black uppercase tracking-widest text-white/20">User ID</span>
                  <span className="text-white font-bold">#{user.id}</span>
                </div>
                <div className="flex flex-col gap-2">
                  <span className="text-[10px] font-black uppercase tracking-widest text-white/20">Role</span>
                  <div className="flex items-center gap-2">
                    <Icon icon="solar:crown-minimalistic-bold-duotone" className="text-sm" style={{ color: COLORS.primary }} />
                    <span className="text-white font-bold uppercase text-sm">{user.role}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Account Status Section */}
            <div className="grid grid-cols-2 gap-6">
              <div className="p-6 rounded-[24px] bg-white/[0.02] border border-white/5">
                <div className="flex flex-col gap-2">
                  <span className="text-[10px] font-black uppercase tracking-widest text-white/20">Status</span>
                  <div className="flex items-center gap-2">
                    <div 
                      className="w-2 h-2 rounded-full animate-pulse" 
                      style={{ 
                        backgroundColor: user.status === "ACTIVE" ? COLORS.primary : COLORS.starGold,
                        boxShadow: `0 0 8px ${user.status === "ACTIVE" ? COLORS.primary : COLORS.starGold}`
                      }} 
                    />
                    <span className="text-white font-bold uppercase text-sm">{user.status}</span>
                  </div>
                </div>
              </div>

              <div className="p-6 rounded-[24px] bg-white/[0.02] border border-white/5">
                <div className="flex flex-col gap-2">
                  <span className="text-[10px] font-black uppercase tracking-widest text-white/20">Verification</span>
                  <div className="flex items-center gap-2">
                    <Icon 
                      icon={user.is_verified ? "solar:shield-check-bold" : "solar:shield-warning-bold"} 
                      className="text-lg"
                      style={{ color: user.is_verified ? COLORS.primary : COLORS.starGold }}
                    />
                    <span className="text-white font-bold uppercase text-sm">
                      {user.is_verified ? "Verified" : "Not Verified"}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Balance & Online Status */}
            <div className="grid grid-cols-2 gap-6">
              <div className="p-6 rounded-[24px] bg-white/[0.02] border border-white/5">
                <div className="flex flex-col gap-2">
                  <span className="text-[10px] font-black uppercase tracking-widest text-white/20">Balance</span>
                  <span className="text-2xl font-black text-white">
                    {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(user.balance / 100)}
                  </span>
                </div>
              </div>

              <div className="p-6 rounded-[24px] bg-white/[0.02] border border-white/5">
                <div className="flex flex-col gap-2">
                  <span className="text-[10px] font-black uppercase tracking-widest text-white/20">Online Status</span>
                  <div className="flex items-center gap-2">
                    <div 
                      className="w-2 h-2 rounded-full" 
                      style={{ 
                        backgroundColor: user.is_online ? COLORS.primary : COLORS.neutralGray,
                        boxShadow: user.is_online ? `0 0 8px ${COLORS.primary}` : 'none'
                      }} 
                    />
                    <span className="text-white font-bold uppercase text-sm">
                      {user.is_online ? "Online" : "Offline"}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Timestamps */}
            <div className="p-6 rounded-[24px] bg-white/[0.02] border border-white/5">
              <div className="grid grid-cols-1 gap-4">
                <div className="flex flex-col gap-1">
                  <span className="text-[10px] font-black uppercase tracking-widest text-white/20">Account Created</span>
                  <span className="text-white/60 text-sm">{formatDate(user.created_at)}</span>
                </div>
              </div>
            </div>

          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

export default ViewUserModal;
