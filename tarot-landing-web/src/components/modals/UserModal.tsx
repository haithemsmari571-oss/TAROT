import React, { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Icon } from "@iconify/react";
import type { AdminUserListItem } from "../../features/users/types/user.types";
import { Role } from "../../features/users/types/user.types";
import PrimaryInput from "../CustomInputs/PrimaryInput";
import PrimarySelect from "../CustomInputs/PrimarySelect";
import { COLORS, TYPOGRAPHY } from "../../theme";

interface UserFormData {
  username: string;
  email: string;
  password?: string;
  role: Role;
  bio?: string;
}

interface UserModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: UserFormData) => void;
  onVerifyUser?: (userId: number) => Promise<void>;
  initialData: AdminUserListItem | null;
}

const UserModal = ({ isOpen, onClose, onSave, onVerifyUser, initialData }: UserModalProps) => {
  const [formData, setFormData] = useState<UserFormData>({
    username: "",
    email: "",
    password: "",
    role: Role.USER,
    bio: "",
  });
  const [isVerifying, setIsVerifying] = useState(false);

  useEffect(() => {
    if (initialData) {
      setFormData({
        username: initialData.username,
        email: initialData.email,
        role: initialData.role,
        bio: "",
        password: undefined, // Don't show password for existing users
      });
    } else {
      setFormData({
        username: "",
        email: "",
        password: "",
        role: Role.USER,
        bio: "",
      });
    }
  }, [initialData, isOpen]);

  const isFormValid = () => {
    if (!formData.username || !formData.email) return false;
    if (!initialData && !formData.password) return false; // Password required for new users
    return true;
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
        {/* Layer 1: The Ambient Blur Overlay */}
        <motion.div 
          initial={{ opacity: 0 }} 
          animate={{ opacity: 1 }} 
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="absolute inset-0 bg-black/60 backdrop-blur-md"
        />

        {/* Layer 2: The Glass Modal Card */}
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
          {/* Top-Edge Intelligence Glow */}
          <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-primary/40 to-transparent" />
          
          {/* Header Section: High Spacing & Clean Typography */}
          <div className="px-12 pt-12 pb-8 flex justify-between items-start">
            <div className="flex flex-col gap-1">
           
              <h3 className="text-3xl font-black uppercase italic tracking-tighter text-white" style={{ fontFamily: TYPOGRAPHY.fontFamily.heading }}>
                User <span style={{ color: COLORS.primary }}>Update</span>
              </h3>
            </div>
            
            <button 
              onClick={onClose} 
              className="w-12 h-12 rounded-2xl flex items-center justify-center bg-white/[0.03] border border-white/5 text-white/20 hover:text-white hover:border-white/20 transition-all duration-300 active:scale-90"
            >
              <Icon icon="solar:close-square-bold-duotone" className="text-2xl" />
            </button>
          </div>

          {/* Body Section: Structured with Internal Cards */}
          <div className="px-12 pb-6 space-y-10">
            
            {/* Row 1: Core Credentials */}
            <div className="grid grid-cols-2 gap-10">
              <div className="flex flex-col gap-3">
                <label className="text-[10px] font-black uppercase tracking-widest text-white/20 ml-1">Username</label>
                <PrimaryInput 
                  fullWidth 
                  value={formData.username} 
                  onChange={(e) => setFormData({...formData, username: e.target.value})}
                  placeholder="USER_DESIGNATION"
                />
              </div>
              <div className="flex flex-col gap-3">
                <label className="text-[10px] font-black uppercase tracking-widest text-white/20 ml-1">Email Address</label>
                <PrimaryInput 
                  fullWidth 
                  type="email"
                  value={formData.email} 
                  onChange={(e) => setFormData({...formData, email: e.target.value})}
                  placeholder="EMAIL@DOMAIN.COM"
                />
              </div>
            </div>

            {/* Row 2: Password & Role */}
            <div className="p-8 rounded-[32px] bg-white/[0.02] border border-white/5 grid grid-cols-2 gap-8 items-end">
              {!initialData && (
                <div className="flex flex-col gap-3">
                  <label className="text-[10px] font-black uppercase tracking-widest text-white/20 ml-1">Password</label>
                  <PrimaryInput 
                    fullWidth
                    type="password"
                    value={formData.password || ""} 
                    onChange={(e) => setFormData({...formData, password: e.target.value})}
                    placeholder="SECURE_PASSWORD"
                  />
                </div>
              )}
              <div className="flex flex-col gap-3">
                <label className="text-[10px] font-black uppercase tracking-widest text-white/20 ml-1">User Role</label>
                <PrimarySelect 
                  value={formData.role}
                  options={[
                    {label: "User", value: Role.USER},
                    {label: "Psychic", value: Role.PSYCHIC},
                    {label: "Admin", value: Role.ADMIN},
                    {label: "Superadmin", value: Role.SUPERADMIN},
                  ]}
                  onChange={(val) => setFormData({...formData, role: val as Role})}
                />
              </div>
            </div>

            {/* Row 3: Bio */}
            <div className="flex flex-col gap-3">
              <label className="text-[10px] font-black uppercase tracking-widest text-white/20 ml-1">Biography (Optional)</label>
              <textarea
                className="w-full h-24 px-6 py-4 rounded-2xl border text-sm resize-none"
                style={{ 
                  backgroundColor: 'rgba(255,255,255,0.02)', 
                  borderColor: 'rgba(255,255,255,0.05)',
                  color: COLORS.neutralGray,
                  fontFamily: TYPOGRAPHY.fontFamily.body
                }}
                value={formData.bio || ""} 
                onChange={(e) => setFormData({...formData, bio: e.target.value})}
                placeholder="User biography or notes..."
              />
            </div>
          </div>

          {/* Footer Section: High Contrast Action */}
          <div className="px-12 pt-6 pb-12 space-y-4">
            {/* Verify User Button - Only shown when editing and user is not verified */}
            {initialData && !initialData.is_verified && onVerifyUser && (
              <button 
                onClick={async () => {
                  setIsVerifying(true);
                  try {
                    await onVerifyUser(initialData.id);
                  } finally {
                    setIsVerifying(false);
                  }
                }}
                disabled={isVerifying}
                className="relative w-full h-[52px] flex items-center justify-center gap-3 overflow-hidden rounded-[24px] transition-all duration-500 hover:scale-[1.01] active:scale-[0.98] group disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 border-2"
                style={{ 
                  backgroundColor: 'transparent',
                  borderColor: COLORS.starGold,
                  color: COLORS.starGold,
                }}
              >
                <span className="relative font-black uppercase text-[10px] tracking-[0.4em] flex items-center gap-2">
                  {isVerifying ? "Verifying..." : "Force Verify User"}
                  <Icon icon="solar:shield-check-bold" className="text-lg" />
                </span>
              </button>
            )}

            {/* Save Button */}
            <button 
              onClick={() => onSave(formData)}
              disabled={!isFormValid()}
              className="relative w-full h-[64px] flex items-center justify-center gap-3 overflow-hidden rounded-[24px] transition-all duration-500 hover:scale-[1.01] active:scale-[0.98] group disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
              style={{ 
                backgroundColor: COLORS.primary,
                boxShadow: `0 20px 40px ${COLORS.primary}20` 
              }}
            >
              {/* Button Shine Effect */}
              <div className="absolute inset-0 w-full h-full bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000" />
              
              <span className="relative text-dark font-black uppercase text-[11px] tracking-[0.5em] flex items-center gap-2">
                {initialData ? "Save Changes" : "Create User"}
                <Icon icon="solar:double-alt-arrow-right-bold" className="text-lg animate-pulse" />
              </span>
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

export default UserModal;