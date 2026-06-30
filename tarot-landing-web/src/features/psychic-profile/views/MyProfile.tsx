import React, { useState, useEffect, useRef } from "react";
import { Icon } from "@iconify/react";
import { COLORS, TYPOGRAPHY } from "../../../theme";
import { profileApi } from "../../profile/api/profileApi";
import { psychicsApi } from "../../browse/api/psychicsApi";
import { categoriesApi } from "../../browse/api/categoriesApi";
import type { UserProfile } from "../../profile/types/profile.types";
import type { Psychic, PsychicCategory, PsychicAvailability, PsychicAvailabilityCreate } from "../../browse/types/psychic.types";
import type { Category } from "../../browse/types/category.types";
import { useAuth } from "../../auth/hooks";
import PrimaryInput from "../../../components/CustomInputs/PrimaryInput";
import { paymentApi } from "../../payment/api/paymentApi";

const DAYS_OF_WEEK = [
  "Monday",
  "Tuesday", 
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

const MyProfile = () => {
  const { user } = useAuth();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [psychicData, setPsychicData] = useState<Psychic | null>(null);
  const [allCategories, setAllCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  
  // Form states
  const [bio, setBio] = useState("");
  const [pricePerMinute, setPricePerMinute] = useState(0);
  const [unitPriceCents, setUnitPriceCents] = useState(100);
  const [isOnline, setIsOnline] = useState(false);
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<number[]>([]);
  const [availabilities, setAvailabilities] = useState<PsychicAvailability[]>([]);
  const [availabilitiesToRemove, setAvailabilitiesToRemove] = useState<number[]>([]);
  
  // Profile picture upload
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploadingPicture, setIsUploadingPicture] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  // Password change
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  useEffect(() => {
    fetchProfileData();
    fetchCategories();
    paymentApi.getUnitPrice()
      .then((data) => setUnitPriceCents(data.unit_price_cents))
      .catch(() => {});
  }, []);

  const fetchCategories = async () => {
    try {
      const categories = await categoriesApi.getCategories(0, 100);
      setAllCategories(categories);
    } catch (error) {
      console.error("Failed to fetch categories:", error);
    }
  };

  const fetchProfileData = async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      const [profileData, psychicProfile] = await Promise.all([
        profileApi.getMyProfile(),
        psychicsApi.getPsychicById(user.id),
      ]);
      
      setProfile(profileData);
      setPsychicData(psychicProfile);
      setBio(profileData.bio || "");
      setPricePerMinute(Math.round((psychicProfile.price_per_second || 0) * 60));
      setIsOnline(psychicProfile.is_online || false);
      setPreviewImage(psychicProfile.profile_picture_url || null);
      setSelectedCategoryIds(psychicProfile.categories?.map((c: PsychicCategory) => c.id) || []);
      setAvailabilities(psychicProfile.availability || []);
      setAvailabilitiesToRemove([]);
    } catch (error: any) {
      setErrorMessage("Failed to load profile data");
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleProfilePictureChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Preview
    const reader = new FileReader();
    reader.onloadend = () => {
      setPreviewImage(reader.result as string);
    };
    reader.readAsDataURL(file);

    // Upload
    setIsUploadingPicture(true);
    try {
      await profileApi.uploadProfilePicture(file);
      setSuccessMessage("Profile picture updated successfully!");
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (error: any) {
      setErrorMessage(error.response?.data?.detail || "Failed to upload profile picture");
      setTimeout(() => setErrorMessage(null), 3000);
    } finally {
      setIsUploadingPicture(false);
    }
  };

  const toggleCategory = (categoryId: number) => {
    setSelectedCategoryIds((prev) =>
      prev.includes(categoryId)
        ? prev.filter((id) => id !== categoryId)
        : [...prev, categoryId]
    );
  };

  const addAvailability = () => {
    const newAvailability: PsychicAvailability = {
      id: -Date.now(), // Temporary negative ID for new items
      day_of_the_week: "Monday",
      start_at: "09:00:00",
      end_at: "17:00:00",
    };
    setAvailabilities([...availabilities, newAvailability]);
  };

  const formatTimeForDisplay = (time: string) => {
    // Convert "HH:MM:SS" to "HH:MM"
    return time.split(':').slice(0, 2).join(':');
  };

  const formatTimeForStorage = (time: string) => {
    // Convert "HH:MM" to "HH:MM:00"
    return time.includes(':') && time.split(':').length === 2 ? `${time}:00` : time;
  };

  const updateAvailability = (index: number, field: keyof PsychicAvailability, value: string) => {
    const updated = [...availabilities];
    updated[index] = { ...updated[index], [field]: value };
    setAvailabilities(updated);
  };

  const removeAvailability = (index: number) => {
    const availability = availabilities[index];
    // If it has a real ID (positive), mark for deletion
    if (availability.id > 0) {
      setAvailabilitiesToRemove([...availabilitiesToRemove, availability.id]);
    }
    // Remove from current list
    setAvailabilities(availabilities.filter((_, i) => i !== index));
  };

  const handleSaveProfile = async () => {
    setIsSaving(true);
    setErrorMessage(null);
    try {
      // Update bio via profile API
      await profileApi.updateMyProfile({ bio });
      
      // Update psychic-specific data
      if (user?.id) {
        // Prepare availabilities for API
        const availabilitiesCreate: PsychicAvailabilityCreate[] = availabilities
          .filter(a => a.id < 0) // Only new ones
          .map(a => ({
            day_of_the_week: a.day_of_the_week,
            start_at: a.start_at,
            end_at: a.end_at,
          }));

        await psychicsApi.updatePsychic(user.id, {
          bio,
          price_per_second: pricePerMinute / 60,
          is_online: isOnline,
          categories_ids: selectedCategoryIds,
          availabilities_create: availabilitiesCreate,
          availabilities_ids_to_remove: availabilitiesToRemove,
        });
      }
      
      setSuccessMessage("Profile updated successfully!");
      setTimeout(() => setSuccessMessage(null), 3000);
      fetchProfileData();
    } catch (error: any) {
      setErrorMessage(error.response?.data?.detail || "Failed to update profile");
      setTimeout(() => setErrorMessage(null), 3000);
    } finally {
      setIsSaving(false);
    }
  };

  const handleChangePassword = async () => {
    if (newPassword !== confirmPassword) {
      setErrorMessage("Passwords do not match");
      setTimeout(() => setErrorMessage(null), 3000);
      return;
    }

    if (newPassword.length < 6) {
      setErrorMessage("Password must be at least 6 characters");
      setTimeout(() => setErrorMessage(null), 3000);
      return;
    }

    setIsSaving(true);
    setErrorMessage(null);
    try {
      await profileApi.changePassword({
        current_password: currentPassword,
        new_password: newPassword,
      });
      
      setSuccessMessage("Password changed successfully!");
      setShowPasswordForm(false);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (error: any) {
      setErrorMessage(error.response?.data?.detail || "Failed to change password");
      setTimeout(() => setErrorMessage(null), 3000);
    } finally {
      setIsSaving(false);
    }
  };

  if (loading) {
    return (
      <div
        className="p-12 min-h-screen flex items-center justify-center"
        style={{ backgroundColor: COLORS.dark }}
      >
        <Icon
          icon="solar:black-hole-line-duotone"
          className="text-5xl animate-spin"
          style={{ color: COLORS.primary }}
        />
      </div>
    );
  }

  return (
    <div
      className="p-12 min-h-screen"
      style={{
        backgroundColor: COLORS.dark,
        fontFamily: TYPOGRAPHY.fontFamily.body,
      }}
    >
      {/* Header */}
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1
            style={TYPOGRAPHY.headings.h2}
            className="uppercase italic tracking-tighter"
          >
            My <span style={{ color: COLORS.primary }}>Profile</span>
          </h1>
          <p
            style={{ color: COLORS.neutralGray }}
            className="text-[10px] font-bold uppercase tracking-[0.5em] mt-2 opacity-50"
          >
            Manage Your Psychic Profile
          </p>
        </div>
        
        {/* Online Status Toggle */}
        <div className="flex items-center gap-4 px-6 py-4 rounded-2xl border" style={{ borderColor: COLORS.neutralDarkGray, backgroundColor: COLORS.surface }}>
          <div>
            <p className="text-white font-bold text-sm">Availability</p>
            <p className="text-[9px] font-black uppercase tracking-widest" style={{ color: COLORS.neutralGray }}>
              {isOnline ? "Online & Available" : "Offline"}
            </p>
          </div>
          <button
            onClick={() => setIsOnline(!isOnline)}
            className="relative w-16 h-8 rounded-full transition-all duration-300 border"
            style={{
              backgroundColor: isOnline ? COLORS.primary : "transparent",
              borderColor: isOnline ? COLORS.primary : COLORS.neutralDarkGray,
            }}
          >
            <div
              className="absolute top-1 w-6 h-6 rounded-full bg-white transition-all duration-300"
              style={{
                left: isOnline ? "calc(100% - 28px)" : "4px",
              }}
            />
          </button>
        </div>
      </div>

      {/* Success/Error Messages */}
      {successMessage && (
        <div
          className="mb-6 p-4 rounded-2xl border border-green-500/20 flex items-center gap-3"
          style={{ backgroundColor: "rgba(74, 222, 128, 0.1)" }}
        >
          <Icon icon="solar:check-circle-bold" className="text-2xl text-green-400" />
          <p className="text-green-400 text-sm font-bold">{successMessage}</p>
        </div>
      )}

      {errorMessage && (
        <div
          className="mb-6 p-4 rounded-2xl border border-red-500/20 flex items-center gap-3"
          style={{ backgroundColor: "rgba(248, 113, 113, 0.1)" }}
        >
          <Icon icon="solar:danger-circle-bold" className="text-2xl text-red-400" />
          <p className="text-red-400 text-sm font-bold">{errorMessage}</p>
        </div>
      )}

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Sidebar - Profile Picture & Quick Info */}
        <div className="space-y-6">
          {/* Profile Picture Card */}
          <div
            className="p-8 rounded-[32px] border border-white/5"
            style={{ backgroundColor: COLORS.surface }}
          >
            <div className="flex flex-col items-center">
              <div className="relative mb-6">
                <div
                  className="w-40 h-40 rounded-full overflow-hidden border-4 transition-all duration-300"
                  style={{ borderColor: isOnline ? COLORS.primary : COLORS.neutralDarkGray }}
                >
                  {previewImage ? (
                    <img
                      src={previewImage}
                      alt="Profile"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div
                      className="w-full h-full flex items-center justify-center"
                      style={{ backgroundColor: COLORS.surfaceAccent }}
                    >
                      <Icon
                        icon="solar:user-bold"
                        className="text-6xl"
                        style={{ color: COLORS.primary }}
                      />
                    </div>
                  )}
                </div>
                {/* Online indicator */}
                {isOnline && (
                  <div className="absolute bottom-2 right-2">
                    <div className="relative">
                      <div className="w-6 h-6 rounded-full border-4" style={{ backgroundColor: "#4ADE80", borderColor: COLORS.surface }} />
                      <div className="absolute inset-0 w-6 h-6 rounded-full animate-ping" style={{ backgroundColor: "#4ADE80", opacity: 0.4 }} />
                    </div>
                  </div>
                )}
                {isUploadingPicture && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-full">
                    <Icon
                      icon="solar:black-hole-line-duotone"
                      className="text-4xl animate-spin"
                      style={{ color: COLORS.primary }}
                    />
                  </div>
                )}
              </div>
              
              <h3 className="text-xl font-black text-white mb-1">{profile?.username}</h3>
              <p className="text-sm mb-6" style={{ color: COLORS.neutralGray }}>{profile?.email}</p>
              
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleProfilePictureChange}
                className="hidden"
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploadingPicture}
                className="w-full px-6 py-3 rounded-xl border transition-all duration-300 hover:scale-105 font-black text-[10px] uppercase tracking-widest flex items-center justify-center gap-2"
                style={{
                  backgroundColor: COLORS.surfaceAccent,
                  borderColor: COLORS.neutralDarkGray,
                  color: COLORS.primary,
                }}
              >
                <Icon icon="solar:camera-bold-duotone" className="text-lg" />
                Change Photo
              </button>
            </div>
          </div>

          {/* Security Card */}
          <div
            className="p-6 rounded-[32px] border border-white/5"
            style={{ backgroundColor: COLORS.surface }}
          >
            <div className="flex items-center gap-3 mb-4">
              <Icon icon="solar:shield-check-bold-duotone" className="text-2xl" style={{ color: COLORS.primary }} />
              <h3 className="text-sm font-black uppercase tracking-wider text-white">
                Security
              </h3>
            </div>
            
            {!showPasswordForm ? (
              <button
                onClick={() => setShowPasswordForm(true)}
                className="w-full px-6 py-3 rounded-xl border transition-all duration-300 hover:scale-105 font-black text-[10px] uppercase tracking-widest flex items-center justify-center gap-2"
                style={{
                  backgroundColor: COLORS.surfaceAccent,
                  borderColor: COLORS.neutralDarkGray,
                  color: COLORS.neutralGray,
                }}
              >
                <Icon icon="solar:lock-password-bold-duotone" className="text-lg" />
                Change Password
              </button>
            ) : (
              <div className="space-y-4">
                <PrimaryInput
                  type="password"
                  label="Current Password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="••••••••"
                />
                <PrimaryInput
                  type="password"
                  label="New Password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="••••••••"
                />
                <PrimaryInput
                  type="password"
                  label="Confirm Password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                />
                <div className="flex gap-2">
                  <button
                    onClick={handleChangePassword}
                    disabled={isSaving || !currentPassword || !newPassword || !confirmPassword}
                    className="flex-1 px-4 py-3 rounded-xl border transition-all duration-300 font-black text-[10px] uppercase tracking-widest disabled:opacity-50"
                    style={{
                      backgroundColor: COLORS.primary,
                      borderColor: COLORS.primary,
                      color: COLORS.dark,
                    }}
                  >
                    Update
                  </button>
                  <button
                    onClick={() => {
                      setShowPasswordForm(false);
                      setCurrentPassword("");
                      setNewPassword("");
                      setConfirmPassword("");
                    }}
                    className="px-4 py-3 rounded-xl border transition-all duration-300 font-black text-[10px] uppercase tracking-widest"
                    style={{
                      borderColor: COLORS.neutralDarkGray,
                      color: COLORS.neutralGray,
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Content - Forms */}
        <div className="lg:col-span-2 space-y-6">
          {/* Bio Section */}
          <div
            className="p-8 rounded-[32px] border border-white/5"
            style={{ backgroundColor: COLORS.surface }}
          >
            <div className="flex items-center gap-3 mb-6">
              <Icon icon="solar:document-text-bold-duotone" className="text-2xl" style={{ color: COLORS.primary }} />
              <h3 className="text-sm font-black uppercase tracking-wider text-white">
                About Me
              </h3>
            </div>
            
            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder="Share your experience, specialties, and what makes you unique..."
              maxLength={500}
              rows={6}
              className="w-full px-4 py-4 rounded-xl border bg-transparent text-white resize-none focus:outline-none focus:ring-2 transition-all"
              style={{
                borderColor: COLORS.neutralDarkGray,
                backgroundColor: COLORS.surfaceAccent,
                fontFamily: TYPOGRAPHY.fontFamily.body,
              }}
            />
            <div className="flex items-center justify-between mt-2">
              <p
                className="text-[9px] font-black uppercase tracking-widest"
                style={{ color: COLORS.neutralGray }}
              >
                Tell clients about yourself
              </p>
              <p
                className="text-[9px] font-black uppercase tracking-widest"
                style={{ color: bio.length > 450 ? "#F87171" : COLORS.neutralGray }}
              >
                {bio.length}/500
              </p>
            </div>
          </div>

          {/* Pricing Section */}
          <div
            className="p-8 rounded-[32px] border border-white/5"
            style={{ backgroundColor: COLORS.surface }}
          >
            <div className="flex items-center gap-3 mb-6">
              <Icon icon="solar:dollar-bold-duotone" className="text-2xl" style={{ color: COLORS.starGold }} />
              <h3 className="text-sm font-black uppercase tracking-wider text-white">
                Pricing
              </h3>
            </div>
            
            <div>
              <label
                className="text-[10px] font-black uppercase tracking-widest mb-3 block"
                style={{ color: COLORS.neutralGray }}
              >
                Price Per Minute (Points)
              </label>
              <div className="flex items-center gap-4">
                <button
                  onClick={() => setPricePerMinute(Math.max(0, pricePerMinute - 10))}
                  className="w-12 h-12 rounded-xl border transition-all duration-300 hover:scale-110 flex items-center justify-center"
                  style={{
                    borderColor: COLORS.neutralDarkGray,
                    backgroundColor: COLORS.surfaceAccent,
                    color: COLORS.primary,
                  }}
                >
                  <Icon icon="solar:minus-circle-bold" className="text-2xl" />
                </button>
                
                <div className="flex-1 relative">
                  <input
                    type="text"
                    value={pricePerMinute}
                    onChange={(e) => {
                      const value = e.target.value.replace(/[^0-9]/g, '');
                      setPricePerMinute(value ? parseInt(value) : 0);
                    }}
                    className="w-full px-6 py-4 rounded-xl border bg-transparent text-white text-center text-2xl font-black focus:outline-none focus:ring-2 transition-all"
                    style={{
                      borderColor: COLORS.neutralDarkGray,
                      backgroundColor: COLORS.surfaceAccent,
                    }}
                  />
                  <span
                    className="absolute right-6 top-1/2 -translate-y-1/2 text-sm font-black uppercase"
                    style={{ color: COLORS.neutralGray }}
                  >
                    pts/min
                  </span>
                </div>
                
                <button
                  onClick={() => setPricePerMinute(pricePerMinute + 10)}
                  className="w-12 h-12 rounded-xl border transition-all duration-300 hover:scale-110 flex items-center justify-center"
                  style={{
                    borderColor: COLORS.neutralDarkGray,
                    backgroundColor: COLORS.surfaceAccent,
                    color: COLORS.primary,
                  }}
                >
                  <Icon icon="solar:add-circle-bold" className="text-2xl" />
                </button>
              </div>
              <p
                className="text-[9px] font-black uppercase tracking-widest mt-3 text-center"
                style={{ color: COLORS.neutralGray }}
              >
                Approx. {((pricePerMinute * unitPriceCents) / 100).toFixed(2)} USD per minute
              </p>
            </div>
          </div>

          {/* Categories Section */}
          <div
            className="p-8 rounded-[32px] border border-white/5"
            style={{ backgroundColor: COLORS.surface }}
          >
            <div className="flex items-center gap-3 mb-6">
              <Icon icon="solar:tag-bold-duotone" className="text-2xl" style={{ color: COLORS.secondary }} />
              <h3 className="text-sm font-black uppercase tracking-wider text-white">
                Specialties
              </h3>
            </div>
            
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {allCategories.map((category) => {
                const isSelected = selectedCategoryIds.includes(category.id);
                return (
                  <button
                    key={category.id}
                    onClick={() => toggleCategory(category.id)}
                    className="px-4 py-3 rounded-xl border transition-all duration-300 hover:scale-105 font-black text-[10px] uppercase tracking-widest"
                    style={{
                      backgroundColor: isSelected ? COLORS.primary : COLORS.surfaceAccent,
                      borderColor: isSelected ? COLORS.primary : COLORS.neutralDarkGray,
                      color: isSelected ? COLORS.dark : COLORS.neutralGray,
                    }}
                  >
                    {category.title}
                  </button>
                );
              })}
            </div>
            {selectedCategoryIds.length === 0 && (
              <p className="text-sm text-center mt-4" style={{ color: COLORS.neutralGray }}>
                Select at least one specialty
              </p>
            )}
          </div>

          {/* Availability Section */}
          <div
            className="p-8 rounded-[32px] border border-white/5"
            style={{ backgroundColor: COLORS.surface }}
          >
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <Icon icon="solar:calendar-bold-duotone" className="text-2xl" style={{ color: COLORS.primary }} />
                <h3 className="text-sm font-black uppercase tracking-wider text-white">
                  Weekly Schedule
                </h3>
              </div>
              <button
                onClick={addAvailability}
                className="px-4 py-2 rounded-xl border transition-all duration-300 hover:scale-105 font-black text-[10px] uppercase tracking-widest flex items-center gap-2"
                style={{
                  backgroundColor: COLORS.surfaceAccent,
                  borderColor: COLORS.neutralDarkGray,
                  color: COLORS.primary,
                }}
              >
                <Icon icon="solar:add-circle-bold" className="text-lg" />
                Add Slot
              </button>
            </div>
            
            {availabilities.length === 0 ? (
              <div className="text-center py-8">
                <Icon
                  icon="solar:calendar-bold-duotone"
                  className="text-5xl mx-auto mb-3"
                  style={{ color: COLORS.neutralGray }}
                />
                <p className="text-sm mb-2" style={{ color: COLORS.neutralGray }}>
                  No availability slots set
                </p>
                <p className="text-[10px]" style={{ color: COLORS.neutralGray }}>
                  Click "Add Slot" to set your working hours
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {availabilities.map((availability, index) => (
                  <div
                    key={availability.id}
                    className="p-4 rounded-xl border flex items-center gap-4"
                    style={{
                      backgroundColor: COLORS.surfaceAccent,
                      borderColor: COLORS.neutralDarkGray,
                    }}
                  >
                    {/* Day Selection */}
                    <div className="flex-1">
                      <select
                        value={availability.day_of_the_week}
                        onChange={(e) => updateAvailability(index, "day_of_the_week", e.target.value)}
                        className="w-full px-3 py-2 rounded-lg border bg-transparent text-white text-sm font-bold focus:outline-none focus:ring-2 transition-all"
                        style={{
                          borderColor: COLORS.neutralDarkGray,
                          backgroundColor: COLORS.surface,
                        }}
                      >
                        {DAYS_OF_WEEK.map((day) => (
                          <option key={day} value={day} style={{ backgroundColor: COLORS.dark }}>
                            {day}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Start Time */}
                    <div className="flex items-center gap-2">
                      <Icon icon="solar:clock-circle-bold" className="text-lg" style={{ color: COLORS.neutralGray }} />
                      <input
                        type="time"
                        value={formatTimeForDisplay(availability.start_at)}
                        onChange={(e) => updateAvailability(index, "start_at", formatTimeForStorage(e.target.value))}
                        className="px-3 py-2 rounded-lg border bg-transparent text-white text-sm font-bold focus:outline-none focus:ring-2 transition-all"
                        style={{
                          borderColor: COLORS.neutralDarkGray,
                          backgroundColor: COLORS.surface,
                        }}
                      />
                    </div>

                    {/* Separator */}
                    <span className="text-white font-bold">—</span>

                    {/* End Time */}
                    <div className="flex items-center gap-2">
                      <Icon icon="solar:clock-circle-bold" className="text-lg" style={{ color: COLORS.neutralGray }} />
                      <input
                        type="time"
                        value={formatTimeForDisplay(availability.end_at)}
                        onChange={(e) => updateAvailability(index, "end_at", formatTimeForStorage(e.target.value))}
                        className="px-3 py-2 rounded-lg border bg-transparent text-white text-sm font-bold focus:outline-none focus:ring-2 transition-all"
                        style={{
                          borderColor: COLORS.neutralDarkGray,
                          backgroundColor: COLORS.surface,
                        }}
                      />
                    </div>

                    {/* Delete Button */}
                    <button
                      onClick={() => removeAvailability(index)}
                      className="p-2 rounded-lg transition-all duration-300 hover:scale-110"
                      style={{
                        color: "#F87171",
                      }}
                    >
                      <Icon icon="solar:trash-bin-trash-bold" className="text-xl" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            
            <p
              className="text-[9px] font-black uppercase tracking-widest mt-4"
              style={{ color: COLORS.neutralGray }}
            >
              Set the days and times you're available for sessions
            </p>
          </div>

          {/* Save Button */}
          <button
            onClick={handleSaveProfile}
            disabled={isSaving || selectedCategoryIds.length === 0}
            className="w-full px-8 py-5 rounded-2xl border transition-all duration-300 hover:scale-105 font-black text-sm uppercase tracking-widest disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3"
            style={{
              backgroundColor: COLORS.primary,
              borderColor: COLORS.primary,
              color: COLORS.dark,
            }}
          >
            {isSaving ? (
              <>
                <Icon icon="solar:black-hole-line-duotone" className="text-xl animate-spin" />
                Saving Changes...
              </>
            ) : (
              <>
                <Icon icon="solar:diskette-bold-duotone" className="text-xl" />
                Save Profile
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default MyProfile;
