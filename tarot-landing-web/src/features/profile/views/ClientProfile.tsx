import { motion, useMotionValue, useSpring, useTransform } from "framer-motion";
import { Icon } from "@iconify/react";
import { useState, useEffect, useRef, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { COLORS, TYPOGRAPHY } from "../../../theme";
import { profileApi } from "../api/profileApi";
import type { UserProfile } from "../types/profile.types";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { paymentApi } from "@/features/payment/api/paymentApi";

// Constellation data for background patterns
const CONSTELLATION_DATA = [
  {
    name: "Ursa Major",
    path: "M10,40 L30,35 L45,45 L60,45 L75,30 L90,35 L75,60 L60,45",
    stars: [[10,40], [30,35], [45,45], [60,45], [75,30], [90,35], [75,60]]
  },
  {
    name: "Orion",
    path: "M20,10 L50,30 L80,10 M50,30 L45,50 L55,50 M45,50 L20,90 M55,50 L80,90",
    stars: [[20,10], [50,30], [80,10], [45,50], [55,50], [20,90], [80,90]]
  },
  {
    name: "Cassiopeia",
    path: "M10,20 L30,50 L50,30 L70,60 L90,40",
    stars: [[10,20], [30,50], [50,30], [70,60], [90,40]]
  }
];

const ClientProfile = () => {
  const navigate = useNavigate();
  const { setUser, logout } = useAuth();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [unitPriceCents, setUnitPriceCents] = useState(100);
  
  // Edit states
  const [isEditingBio, setIsEditingBio] = useState(false);
  const [bioValue, setBioValue] = useState("");
  const [isSavingBio, setIsSavingBio] = useState(false);
  
  // Change password states
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState(false);
  
  // Profile picture upload
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploadingPicture, setIsUploadingPicture] = useState(false);

  // Background animation refs
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [windowSize, setWindowSize] = useState({ width: 1920, height: 1080 });
  
  // Mouse tracking for parallax effects
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);
  const springX = useSpring(mouseX, { stiffness: 80, damping: 25 });
  const springY = useSpring(mouseY, { stiffness: 80, damping: 25 });

  // Create transform values outside of render
  const parallaxX = useTransform(springX, [-0.5, 0.5], [-20, 20]);
  const parallaxY = useTransform(springY, [-0.5, 0.5], [-20, 20]);

  // Constellation patterns for background
  const constellations = useMemo(() => {
    return Array.from({ length: 6 }).map((_, i) => {
      const data = CONSTELLATION_DATA[i % CONSTELLATION_DATA.length];
      return {
        ...data,
        x: Math.random() * 90,
        y: Math.random() * 90,
        scale: 0.6 + Math.random() * 0.8,
        rotate: Math.random() * 360,
        opacity: 0.05 + Math.random() * 0.15
      };
    });
  }, []);

  // Mouse move handler
  const handleMouseMove = (e: React.MouseEvent) => {
    const x = (e.clientX / window.innerWidth) - 0.5;
    const y = (e.clientY / window.innerHeight) - 0.5;
    mouseX.set(x);
    mouseY.set(y);
  };

  // Update canvas size
  useEffect(() => {
    const handleResize = () => {
      setWindowSize({ width: window.innerWidth, height: window.innerHeight });
      if (canvasRef.current) {
        canvasRef.current.width = window.innerWidth;
        canvasRef.current.height = window.innerHeight;
      }
    };
    
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Animated stars background
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    
    let animationFrameId: number;
    let stars = Array.from({ length: 150 }, () => ({
      x: Math.random() * window.innerWidth,
      y: Math.random() * window.innerHeight,
      size: Math.random() * 1.5,
      opacity: Math.random(),
      pulse: 0.008 + Math.random() * 0.015
    }));

    const render = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      stars.forEach(s => {
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 255, 255, ${s.opacity})`;
        ctx.fill();
        s.opacity += s.pulse;
        if (s.opacity > 0.8 || s.opacity < 0.2) s.pulse *= -1;
      });
      animationFrameId = requestAnimationFrame(render);
    };
    render();
    return () => cancelAnimationFrame(animationFrameId);
  }, [windowSize]);

  useEffect(() => {
    fetchProfile();
    paymentApi.getUnitPrice()
      .then((data) => setUnitPriceCents(data.unit_price_cents))
      .catch(() => {});
  }, []);

  const fetchProfile = async () => {
    try {
      setIsLoading(true);
      const data = await profileApi.getMyProfile();
      setProfile(data);
      setBioValue(data.bio || "");
    } catch (err: any) {
      setError(err.response?.data?.detail || "Failed to load profile");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveBio = async () => {
    if (!profile) return;
    
    try {
      setIsSavingBio(true);
      const updatedProfile = await profileApi.updateMyProfile({ bio: bioValue });
      setProfile(updatedProfile);
      setIsEditingBio(false);
      
      // Update auth context
      setUser({
        id: updatedProfile.id,
        username: updatedProfile.username,
        email: updatedProfile.email,
        is_verified: updatedProfile.is_verified,
        role: updatedProfile.role as any,
        bio: updatedProfile.bio,
        profile_picture: updatedProfile.profile_picture_path,
        balance: updatedProfile.balance,
        created_at: updatedProfile.created_at,
        updated_at: updatedProfile.created_at,
      });
    } catch (err: any) {
      setError(err.response?.data?.detail || "Failed to update bio");
    } finally {
      setIsSavingBio(false);
    }
  };

  const handleChangePassword = async () => {
    setPasswordError(null);
    setPasswordSuccess(false);

    if (newPassword !== confirmPassword) {
      setPasswordError("Passwords do not match");
      return;
    }

    if (newPassword.length < 8) {
      setPasswordError("Password must be at least 8 characters");
      return;
    }

    try {
      setIsChangingPassword(true);
      await profileApi.changePassword({
        current_password: currentPassword,
        new_password: newPassword,
      });
      
      setPasswordSuccess(true);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      
      setTimeout(() => {
        setShowChangePassword(false);
        setPasswordSuccess(false);
      }, 2000);
    } catch (err: any) {
      setPasswordError(err.response?.data?.detail || "Failed to change password");
    } finally {
      setIsChangingPassword(false);
    }
  };

  const handleProfilePictureClick = () => {
    fileInputRef.current?.click();
  };

  const handleProfilePictureChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    const allowedTypes = ["image/jpeg", "image/png", "image/gif", "image/webp"];
    if (!allowedTypes.includes(file.type)) {
      setError("Invalid file type. Please upload a JPEG, PNG, GIF, or WebP image.");
      return;
    }

    // Validate file size (5MB)
    if (file.size > 5 * 1024 * 1024) {
      setError("File too large. Maximum size is 5MB.");
      return;
    }

    try {
      setIsUploadingPicture(true);
      setError(null);
      const updatedProfile = await profileApi.uploadProfilePicture(file);
      setProfile(updatedProfile);
      
      // Update auth context
      setUser({
        id: updatedProfile.id,
        username: updatedProfile.username,
        email: updatedProfile.email,
        is_verified: updatedProfile.is_verified,
        role: updatedProfile.role as any,
        bio: updatedProfile.bio,
        profile_picture: updatedProfile.profile_picture_path,
        balance: updatedProfile.balance,
        created_at: updatedProfile.created_at,
        updated_at: updatedProfile.created_at,
      });
    } catch (err: any) {
      setError(err.response?.data?.detail || "Failed to upload profile picture");
    } finally {
      setIsUploadingPicture(false);
    }
  };

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  if (isLoading) {
    return (
      <div className="relative min-h-screen pt-32 pb-20 flex items-center justify-center overflow-hidden" style={{ backgroundColor: COLORS.dark }}>
        {/* Animated stars canvas background */}
        <canvas 
          ref={canvasRef} 
          className="fixed inset-0 pointer-events-none opacity-40 z-0" 
        />
        <div className="relative z-10">
          <Icon icon="ph:spinner" className="text-6xl animate-spin" style={{ color: COLORS.primary }} />
        </div>
      </div>
    );
  }

  if (error && !profile) {
    return (
      <div className="relative min-h-screen pt-32 pb-20 flex items-center justify-center overflow-hidden" style={{ backgroundColor: COLORS.dark }}>
        {/* Animated stars canvas background */}
        <canvas 
          ref={canvasRef} 
          className="fixed inset-0 pointer-events-none opacity-40 z-0" 
        />
        <div className="relative z-10 text-center">
          <Icon icon="ph:warning-circle" className="text-6xl mb-4" style={{ color: COLORS.error }} />
          <p style={{ color: COLORS.neutralWhite }}>{error}</p>
        </div>
      </div>
    );
  }

  if (!profile) return null;

  return (
    <div 
      className="relative min-h-screen pt-32 pb-20 overflow-hidden" 
      onMouseMove={handleMouseMove}
      style={{ backgroundColor: COLORS.dark }}
    >
      {/* Animated stars canvas background */}
      <canvas 
        ref={canvasRef} 
        className="fixed inset-0 pointer-events-none opacity-40 z-0" 
      />

      {/* Constellation patterns layer */}
      <div className="fixed inset-0 pointer-events-none z-[1] overflow-hidden">
        {constellations.map((con, i) => (
          <motion.svg
            key={`con-${i}`}
            viewBox="0 0 100 100"
            style={{
              position: 'absolute',
              left: `${con.x}%`,
              top: `${con.y}%`,
              width: '250px',
              height: '250px',
              rotate: con.rotate,
              scale: con.scale,
              x: parallaxX,
              y: parallaxY,
              opacity: con.opacity
            }}
          >
            <motion.path
              d={con.path}
              fill="none"
              stroke="rgba(255,255,255,0.3)"
              strokeWidth="0.5"
              strokeDasharray="2, 4"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 4, delay: i * 0.5, ease: "easeInOut" }}
            />
            {con.stars.map(([cx, cy], idx) => (
              <motion.circle
                key={idx}
                cx={cx}
                cy={cy}
                r="1"
                fill="white"
                initial={{ opacity: 0 }}
                animate={{ opacity: [0, 0.8, 0.3] }}
                transition={{ repeat: Infinity, duration: 2 + Math.random() * 2 }}
                style={{ filter: 'drop-shadow(0 0 2px white)' }}
              />
            ))}
          </motion.svg>
        ))}
      </div>

      {/* Radial gradient overlay for depth */}
      <div 
        className="fixed inset-0 z-[2] pointer-events-none"
        style={{
          background: `radial-gradient(circle at 50% 20%, transparent 0%, ${COLORS.dark}cc 70%, ${COLORS.dark} 100%)`,
        }}
      />

      {/* Main content */}
      <div className="relative z-10 max-w-4xl mx-auto px-6">
        {/* HEADER */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <h1
            style={{ ...TYPOGRAPHY.headings.h1, fontSize: "clamp(2rem, 5vw, 3rem)" }}
            className="tracking-tighter leading-[1] mb-2"
          >
            My <span style={{ color: COLORS.primary }}>Profile</span>
          </h1>
          <p className="text-sm opacity-60" style={{ color: COLORS.neutralWhite }}>
            Manage your account settings
          </p>
        </motion.div>

        {/* ERROR MESSAGE */}
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-6 p-4 rounded-2xl border backdrop-blur-xl relative overflow-hidden"
            style={{
              background: `linear-gradient(135deg, ${COLORS.error}25 0%, ${COLORS.error}15 100%)`,
              borderColor: `${COLORS.error}80`,
              boxShadow: `0 8px 20px ${COLORS.error}20`,
            }}
          >
            <div 
              className="absolute top-0 right-0 w-32 h-32 blur-[60px] rounded-full pointer-events-none"
              style={{
                background: `radial-gradient(circle, ${COLORS.error}30 0%, transparent 70%)`,
              }}
            />
            <p className="text-sm relative z-10" style={{ color: COLORS.error }}>{error}</p>
          </motion.div>
        )}

        {/* PROFILE CARD */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="rounded-3xl p-8 mb-6 border relative overflow-hidden backdrop-blur-xl"
          style={{
            background: `linear-gradient(135deg, ${COLORS.surface}dd 0%, ${COLORS.surfaceAccent}dd 100%)`,
            borderColor: `${COLORS.neutralWhite}15`,
            boxShadow: `0 20px 40px rgba(0,0,0,0.4), 0 0 0 1px ${COLORS.primary}10`,
          }}
        >
          {/* Background glow */}
          <div 
            className="absolute top-0 right-0 w-80 h-80 blur-[120px] rounded-full pointer-events-none"
            style={{
              background: `radial-gradient(circle, ${COLORS.primary}20 0%, transparent 70%)`,
            }}
          />
          <div 
            className="absolute bottom-0 left-0 w-64 h-64 blur-[100px] rounded-full pointer-events-none"
            style={{
              background: `radial-gradient(circle, ${COLORS.secondary}15 0%, transparent 70%)`,
            }}
          />
          
          <div className="relative flex flex-col md:flex-row items-center md:items-start gap-6">
            {/* AVATAR */}
            <div className="relative">
              <div
                className="w-32 h-32 rounded-full overflow-hidden border-4 flex items-center justify-center"
                style={{ 
                  borderColor: COLORS.primary,
                  backgroundColor: COLORS.dark,
                }}
              >
                {profile.profile_picture_path ? (
                  <img src={profile.profile_picture_path} alt={profile.username} className="w-full h-full object-cover" />
                ) : (
                  <Icon icon="ph:user-circle-fill" className="text-7xl" style={{ color: COLORS.primary }} />
                )}
              </div>
              <button
                onClick={handleProfilePictureClick}
                disabled={isUploadingPicture}
                className="absolute bottom-0 right-0 w-10 h-10 rounded-full flex items-center justify-center disabled:opacity-50"
                style={{ backgroundColor: COLORS.primary }}
              >
                {isUploadingPicture ? (
                  <Icon icon="ph:spinner" className="text-lg animate-spin" style={{ color: COLORS.dark }} />
                ) : (
                  <Icon icon="ph:camera-fill" className="text-lg" style={{ color: COLORS.dark }} />
                )}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/gif,image/webp"
                onChange={handleProfilePictureChange}
                className="hidden"
              />
            </div>

            {/* INFO */}
            <div className="flex-1 text-center md:text-left">
              <h2
                style={{ ...TYPOGRAPHY.headings.h2, fontSize: "2rem" }}
                className="mb-2"
              >
                {profile.username}
              </h2>
              <p className="text-sm opacity-60 mb-4" style={{ color: COLORS.neutralWhite }}>
                {profile.email}
              </p>
              <div className="flex items-center gap-2 justify-center md:justify-start mb-4">
                <div className="text-center">
                  <div className="text-2xl font-bold" style={{ color: COLORS.primary }}>
                    ${((profile.balance * unitPriceCents) / 100).toFixed(2)}
                  </div>
                  <div className="text-[10px] uppercase tracking-wider opacity-60" style={{ color: COLORS.neutralWhite }}>
                    Account Balance
                  </div>
                </div>
              </div>
            </div>

            {/* ACTION BUTTON */}
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => navigate("/billing")}
              className="px-6 py-3 rounded-xl text-xs font-bold uppercase tracking-widest"
              style={{
                backgroundColor: COLORS.primary,
                color: COLORS.dark,
              }}
            >
              Add Funds
            </motion.button>
          </div>
        </motion.div>

        {/* BIO SECTION */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="rounded-3xl p-6 mb-6 border backdrop-blur-xl relative overflow-hidden"
          style={{
            background: `linear-gradient(135deg, ${COLORS.surface}dd 0%, ${COLORS.surfaceAccent}dd 100%)`,
            borderColor: `${COLORS.neutralWhite}15`,
            boxShadow: `0 10px 30px rgba(0,0,0,0.3), 0 0 0 1px ${COLORS.primary}08`,
          }}
        >
          {/* Subtle glow effect */}
          <div 
            className="absolute top-0 right-0 w-40 h-40 blur-[80px] rounded-full pointer-events-none"
            style={{
              background: `radial-gradient(circle, ${COLORS.primary}15 0%, transparent 70%)`,
            }}
          />
          <div className="relative flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold" style={{ color: COLORS.neutralWhite }}>
              Bio
            </h3>
            {!isEditingBio && (
              <button
                onClick={() => setIsEditingBio(true)}
                className="px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider"
                style={{
                  backgroundColor: `${COLORS.primary}20`,
                  color: COLORS.primary,
                }}
              >
                Edit
              </button>
            )}
          </div>
          
          {isEditingBio ? (
            <div>
              <textarea
                value={bioValue}
                onChange={(e) => setBioValue(e.target.value)}
                maxLength={500}
                rows={4}
                className="w-full p-3 rounded-lg text-sm mb-4 outline-none"
                style={{
                  backgroundColor: COLORS.dark,
                  color: COLORS.neutralWhite,
                  border: `1px solid ${COLORS.neutralWhite}20`,
                }}
                placeholder="Tell us about yourself..."
              />
              <div className="flex items-center justify-between">
                <span className="text-xs opacity-60" style={{ color: COLORS.neutralWhite }}>
                  {bioValue.length}/500 characters
                </span>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      setIsEditingBio(false);
                      setBioValue(profile.bio || "");
                    }}
                    className="px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider"
                    style={{
                      backgroundColor: `${COLORS.neutralWhite}10`,
                      color: COLORS.neutralWhite,
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSaveBio}
                    disabled={isSavingBio}
                    className="px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider disabled:opacity-50"
                    style={{
                      backgroundColor: COLORS.primary,
                      color: COLORS.dark,
                    }}
                  >
                    {isSavingBio ? "Saving..." : "Save"}
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <p className="text-sm opacity-80" style={{ color: COLORS.neutralWhite }}>
              {profile.bio || "No bio yet. Click edit to add one!"}
            </p>
          )}
        </motion.div>

        {/* CHANGE PASSWORD SECTION */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="rounded-3xl p-6 border backdrop-blur-xl relative overflow-hidden"
          style={{
            background: `linear-gradient(135deg, ${COLORS.surface}dd 0%, ${COLORS.surfaceAccent}dd 100%)`,
            borderColor: `${COLORS.neutralWhite}15`,
            boxShadow: `0 10px 30px rgba(0,0,0,0.3), 0 0 0 1px ${COLORS.primary}08`,
          }}
        >
          {/* Subtle glow effect */}
          <div 
            className="absolute bottom-0 left-0 w-40 h-40 blur-[80px] rounded-full pointer-events-none"
            style={{
              background: `radial-gradient(circle, ${COLORS.secondary}15 0%, transparent 70%)`,
            }}
          />
          <div className="relative flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold" style={{ color: COLORS.neutralWhite }}>
              Password
            </h3>
            {!showChangePassword && (
              <button
                onClick={() => setShowChangePassword(true)}
                className="px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider"
                style={{
                  backgroundColor: `${COLORS.primary}20`,
                  color: COLORS.primary,
                }}
              >
                Change Password
              </button>
            )}
          </div>

          {showChangePassword ? (
            <div className="space-y-4">
              {passwordError && (
                <div
                  className="p-3 rounded-lg text-sm"
                  style={{
                    backgroundColor: `${COLORS.error}20`,
                    color: COLORS.error,
                  }}
                >
                  {passwordError}
                </div>
              )}

              {passwordSuccess && (
                <div
                  className="p-3 rounded-lg text-sm"
                  style={{
                    backgroundColor: `${COLORS.success}20`,
                    color: COLORS.success,
                  }}
                >
                  Password changed successfully!
                </div>
              )}

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider mb-2" style={{ color: COLORS.neutralWhite }}>
                  Current Password
                </label>
                <input
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className="w-full p-3 rounded-lg text-sm outline-none"
                  style={{
                    backgroundColor: COLORS.dark,
                    color: COLORS.neutralWhite,
                    border: `1px solid ${COLORS.neutralWhite}20`,
                  }}
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider mb-2" style={{ color: COLORS.neutralWhite }}>
                  New Password
                </label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full p-3 rounded-lg text-sm outline-none"
                  style={{
                    backgroundColor: COLORS.dark,
                    color: COLORS.neutralWhite,
                    border: `1px solid ${COLORS.neutralWhite}20`,
                  }}
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider mb-2" style={{ color: COLORS.neutralWhite }}>
                  Confirm New Password
                </label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full p-3 rounded-lg text-sm outline-none"
                  style={{
                    backgroundColor: COLORS.dark,
                    color: COLORS.neutralWhite,
                    border: `1px solid ${COLORS.neutralWhite}20`,
                  }}
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  onClick={() => {
                    setShowChangePassword(false);
                    setCurrentPassword("");
                    setNewPassword("");
                    setConfirmPassword("");
                    setPasswordError(null);
                  }}
                  className="px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider"
                  style={{
                    backgroundColor: `${COLORS.neutralWhite}10`,
                    color: COLORS.neutralWhite,
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleChangePassword}
                  disabled={isChangingPassword || !currentPassword || !newPassword || !confirmPassword}
                  className="px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider disabled:opacity-50"
                  style={{
                    backgroundColor: COLORS.primary,
                    color: COLORS.dark,
                  }}
                >
                  {isChangingPassword ? "Changing..." : "Change Password"}
                </button>
              </div>
            </div>
          ) : (
            <p className="text-sm opacity-80" style={{ color: COLORS.neutralWhite }}>
              ••••••••
            </p>
          )}
        </motion.div>

        {/* LOGOUT SECTION */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="rounded-3xl p-6 mt-6 border backdrop-blur-xl relative overflow-hidden"
          style={{
            background: `linear-gradient(135deg, ${COLORS.surface}dd 0%, ${COLORS.surfaceAccent}dd 100%)`,
            borderColor: `${COLORS.neutralWhite}15`,
            boxShadow: `0 10px 30px rgba(0,0,0,0.3), 0 0 0 1px ${COLORS.primary}08`,
          }}
        >
          {/* Subtle glow effect */}
          <div 
            className="absolute bottom-0 right-0 w-40 h-40 blur-[80px] rounded-full pointer-events-none"
            style={{
              background: `radial-gradient(circle, ${COLORS.error}15 0%, transparent 70%)`,
            }}
          />
          <div className="relative flex items-center justify-between">
            <div>
              <h3 className="text-lg font-bold mb-1" style={{ color: COLORS.neutralWhite }}>
                Logout
              </h3>
              <p className="text-sm opacity-60" style={{ color: COLORS.neutralWhite }}>
                Sign out of your account
              </p>
            </div>
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={handleLogout}
              className="px-6 py-3 rounded-xl text-xs font-bold uppercase tracking-widest flex items-center gap-2"
              style={{
                backgroundColor: `${COLORS.error}20`,
                color: COLORS.error,
                border: `1px solid ${COLORS.error}40`,
              }}
            >
              <Icon icon="ph:sign-out-bold" className="text-base" />
              Logout
            </motion.button>
          </div>
        </motion.div>
      </div>
    </div>
  );
};

export default ClientProfile;
