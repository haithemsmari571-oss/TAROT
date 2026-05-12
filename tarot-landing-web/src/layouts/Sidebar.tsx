import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate, useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Icon } from "@iconify/react";
import { COLORS, TYPOGRAPHY } from '../theme';
import { useAuth } from '../features/auth/hooks';
import { UserRole } from '../features/auth/types/auth.types';
import axiosClient from '../lib/axiosClient';
import { NotificationBell } from '../features/notifications/components/NotificationBell';

const Sidebar = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuth();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [pendingChatsCount, setPendingChatsCount] = useState(0);
  const [profilePicture, setProfilePicture] = useState<string | null>(null);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  // Fetch pending chats count for psychics
  useEffect(() => {
    const fetchPendingChats = async () => {
      if (user?.role === UserRole.PSYCHIC) {
        try {
          const response = await axiosClient.get('/chat/my-chats');
          const chats = response.data || [];
          // Count chats with status REQUESTED (pending)
          const pendingCount = chats.filter((chat: any) => chat.status === 'REQUESTED').length;
          setPendingChatsCount(pendingCount);
        } catch (error) {
          console.error('Failed to fetch chats:', error);
        }
      }
    };

    fetchPendingChats();
    // Refresh every 30 seconds
    const interval = setInterval(fetchPendingChats, 30000);
    return () => clearInterval(interval);
  }, [user]);

  // Fetch profile picture
  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const response = await axiosClient.get('/profile/me');
        setProfilePicture(response.data.profile_picture_url || null);
      } catch (error) {
        console.error('Failed to fetch profile:', error);
      }
    };

    if (user) {
      fetchProfile();
    }
  }, [user]);

  // --- Background Star Animation (Matches Header) ---
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    let animationFrameId: number;

    const stars = Array.from({ length: 40 }, () => ({
      x: Math.random() * 280,
      y: Math.random() * window.innerHeight,
      size: Math.random() * 1.2,
      opacity: Math.random(),
      speed: 0.005 + Math.random() * 0.01,
    }));

    const render = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      stars.forEach((star) => {
        ctx.beginPath();
        ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 255, 255, ${Math.abs(Math.sin(star.opacity)) * 0.3})`;
        ctx.fill();
        star.opacity += star.speed;
      });
      animationFrameId = requestAnimationFrame(render);
    };

    canvas.width = 280;
    canvas.height = window.innerHeight;
    render();
    return () => cancelAnimationFrame(animationFrameId);
  }, []);

  const allMenuItems = useMemo(() => [
    { label: "Users", path: "/admin/users", icon: "solar:users-group-rounded-bold-duotone", roles: [UserRole.ADMIN, UserRole.SUPERADMIN] },
    { label: "Psychics", path: "/admin/psychics", icon: "solar:magic-stick-3-bold-duotone", roles: [UserRole.ADMIN, UserRole.SUPERADMIN] },
    { label: "Chats", path: "/admin/chats", icon: "solar:chat-round-line-bold-duotone", badge: pendingChatsCount > 0 ? pendingChatsCount.toString() : undefined, roles: [UserRole.PSYCHIC, UserRole.ADMIN, UserRole.SUPERADMIN] },
    { label: "Notifications", path: "/admin/notifications", icon: "solar:bell-bold-duotone", roles: [UserRole.PSYCHIC, UserRole.ADMIN, UserRole.SUPERADMIN] },
    { label: "Earnings", path: "/admin/earnings", icon: "solar:dollar-bold-duotone", roles: [UserRole.PSYCHIC] },
    { label: "Reviews", path: "/admin/my-reviews", icon: "solar:star-bold-duotone", roles: [UserRole.PSYCHIC] },
    { label: "My Profile", path: "/admin/my-profile", icon: "solar:user-id-bold-duotone", roles: [UserRole.PSYCHIC] },
    { label: "Ledger", path: "/admin/ledger", icon: "solar:wallet-money-bold-duotone", roles: [UserRole.ADMIN, UserRole.SUPERADMIN] },
    { label: "Buy Options", path: "/admin/buy-options", icon: "solar:cart-large-2-bold-duotone", roles: [UserRole.ADMIN, UserRole.SUPERADMIN] },
    { label: "Categories", path: "/admin/categories", icon: "solar:folder-bold-duotone", roles: [UserRole.ADMIN, UserRole.SUPERADMIN] },
    { label: "Zodiac", path: "/admin/zodiac", icon: "solar:stars-minimalistic-bold-duotone", roles: [UserRole.ADMIN, UserRole.SUPERADMIN] },
    { label: "Life Path", path: "/admin/lifepath", icon: "solar:calculator-bold-duotone", roles: [UserRole.ADMIN, UserRole.SUPERADMIN] },
    { label: "Settings", path: "/admin/settings", icon: "solar:settings-bold-duotone", roles: [UserRole.SUPERADMIN] },
  ], [pendingChatsCount]);

  // Filter menu items based on user role
  const menuItems = useMemo(() => {
    if (!user) return [];
    return allMenuItems.filter(item => item.roles.includes(user.role));
  }, [user, allMenuItems]);

  return (
    <aside 
      className="relative flex flex-col h-full w-full py-10 px-4 overflow-hidden border-r"
      style={{ 
        backgroundColor: COLORS.surface, 
        borderColor: COLORS.neutralDarkGray,
        fontFamily: TYPOGRAPHY.fontFamily.body 
      }}
    >
      {/* Background Subtle Sparkle */}
      <canvas ref={canvasRef} className="absolute inset-0 pointer-events-none opacity-50" />

      {/* 1. BRANDING */}
      <div className="flex items-center gap-4 px-3 mb-12 relative z-10">
        <div className="relative flex items-center justify-center w-10 h-10">
           <Icon icon="ph:eye-duotone" className="text-3xl relative z-10" style={{ color: COLORS.primary }} />
           <motion.div animate={{ opacity: [0.2, 0.5, 0.2] }} transition={{ repeat: Infinity, duration: 3 }} className="absolute inset-0 blur-lg rounded-full" style={{ backgroundColor: COLORS.primary }} />
        </div>
        <h1 
          style={{ 
            fontFamily: TYPOGRAPHY.headings.h1.fontFamily,
            color: COLORS.neutralWhite,
            fontWeight: 800,
            letterSpacing: "-0.02em"
          }} 
          className="text-lg uppercase leading-none"
        >
          Tarot <span style={{ color: COLORS.primary }}>Admin</span>
        </h1>
      </div>

      {/* 2. NAVIGATION */}
      <nav className="flex-1 space-y-2 relative z-10">
        {menuItems.map((item) => {
          const isActive = location.pathname === item.path;
          return (
            <button
              key={item.label}
              onClick={() => navigate(item.path)}
              className="w-full flex items-center justify-between px-4 py-3.5 rounded-2xl transition-all duration-300 relative group"
              style={{ 
                backgroundColor: isActive ? COLORS.surfaceAccent : 'transparent',
              }}
            >
              {isActive && (
                <>
                  <motion.div 
                    layoutId="nav-glow" 
                    className="absolute inset-0 rounded-2xl"
                    style={{
                      border: `1px solid ${COLORS.primary}`,
                      boxShadow: `0 0 20px ${COLORS.primary}40, inset 0 0 20px ${COLORS.primary}10`,
                    }}
                  />
                  <div 
                    className="absolute inset-0 rounded-2xl blur-sm"
                    style={{
                      border: `1px solid ${COLORS.primary}60`,
                      opacity: 0.3,
                    }}
                  />
                </>
              )}
              
              <div className="flex items-center gap-4 relative z-10">
                <Icon 
                  icon={item.icon} 
                  className="text-2xl transition-transform duration-300 group-hover:scale-110" 
                  style={{ color: isActive ? COLORS.primary : COLORS.neutralGray }} 
                />
                <span 
                  className="text-[11px] font-black uppercase tracking-widest transition-colors"
                  style={{ color: isActive ? COLORS.neutralWhite : COLORS.neutralGray }}
                >
                  {item.label}
                </span>
              </div>

              {item.badge && (
                <span 
                  className="relative z-10 text-[9px] px-2 py-0.5 rounded-lg font-black"
                  style={{ backgroundColor: COLORS.starGold, color: COLORS.dark }}
                >
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* 3. FOOTER ACTIONS */}
      <div className="mt-auto space-y-4 pt-6 border-t relative z-10" style={{ borderColor: COLORS.neutralDarkGray }}>
        
        {/* UNIFIED PROFILE CARD */}
        <div 
          className="group flex items-center justify-between p-2 rounded-2xl border transition-all duration-300 hover:bg-white/[0.03]"
          style={{ borderColor: "rgba(255,255,255,0.05)" }}
        >
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="w-10 h-10 rounded-xl border-2 p-0.5 transition-all duration-500 group-hover:rotate-3" style={{ borderColor: COLORS.primary }}>
                {profilePicture ? (
                  <img 
                    src={profilePicture} 
                    alt={user?.username || 'User'} 
                    className="w-full h-full rounded-[8px] object-cover"
                  />
                ) : (
                  <div className="w-full h-full rounded-[8px] flex items-center justify-center" style={{ backgroundColor: COLORS.surfaceAccent }}>
                    <Icon icon="solar:user-bold" className="text-xl" style={{ color: COLORS.neutralWhite }} />
                  </div>
                )}
              </div>
              <span className="absolute -bottom-1 -right-1 w-3 h-3 rounded-full border-2" style={{ backgroundColor: '#4ADE80', borderColor: COLORS.surface }} />
            </div>

            <div className="flex flex-col">
              <span className="text-[11px] font-black uppercase tracking-wider text-white transition-colors group-hover:text-primary">
                {user?.username || 'Admin'}
              </span>
              <span className="text-[8px] font-bold uppercase tracking-tighter opacity-50" style={{ color: COLORS.secondary }}>
                {user?.role === UserRole.SUPERADMIN ? 'Super Admin' : user?.role === UserRole.ADMIN ? 'Admin' : user?.role === UserRole.PSYCHIC ? 'Psychic' : 'User'}
              </span>
            </div>
          </div>

          <button 
            onClick={handleLogout}
            className="p-2 rounded-lg opacity-0 group-hover:opacity-100 transition-all hover:bg-white/5" 
            style={{ color: COLORS.neutralGray }}
          >
            <Icon icon="solar:logout-3-bold-duotone" className="text-xl" />
          </button>
        </div>

      </div>
    </aside>
  );
};

export default Sidebar;