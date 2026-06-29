import React, { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Icon } from "@iconify/react";
import PrimaryInput from "../CustomInputs/PrimaryInput";
import { COLORS, TYPOGRAPHY } from "../../theme";
import type { Psychic } from "../../features/psychics/data/PractitionersUsers";
import type { PsychicAvailabilityCreate, PsychicCategory } from "../../features/browse/types/psychic.types";
import { SearchableMultiSelect } from "../../features/browse/components/SearchableMultiSelect";

interface PractitionerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: FormData) => void;
  initialData: Psychic | null;
  categories: PsychicCategory[];
}

const PractitionerModal = ({ isOpen, onClose, onSave, initialData, categories }: PractitionerModalProps) => {
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [bio, setBio] = useState("");
  const [pricePerSecond, setPricePerSecond] = useState(0.05);
  const [isOnline, setIsOnline] = useState(true);
  const [selectedCategories, setSelectedCategories] = useState<number[]>([]);
  const [availability, setAvailability] = useState<PsychicAvailabilityCreate[]>([]);
  const [profilePicture, setProfilePicture] = useState<File | null>(null);
  const [profilePicturePreview, setProfilePicturePreview] = useState<string>("");
  const [order, setOrder] = useState<number>(9999);

  useEffect(() => {
    if (initialData) {
      setUsername(initialData.username || "");
      setEmail(initialData.email || "");
      setPassword(""); 
      setBio(initialData.bio || "");
      setPricePerSecond(initialData.price_per_second ?? 0.05);
      setIsOnline(initialData.is_online ?? true);
      setSelectedCategories(initialData.categories ? initialData.categories.map(c => c.id) : []);
      setAvailability(initialData.availability ? initialData.availability.map(a => ({
        day_of_the_week: a.day_of_the_week,
        start_at: a.start_at,
        end_at: a.end_at,
      })) : []);
      setProfilePicturePreview(initialData.profile_picture_url || "");
      setProfilePicture(null);
      setOrder(initialData.order ?? 9999);
    } else {
      setUsername("");
      setEmail("");
      setPassword("");
      setBio("");
      setPricePerSecond(0.05);
      setIsOnline(true);
      setSelectedCategories([]);
      setAvailability([{ day_of_the_week: "Monday", start_at: "09:00:00", end_at: "17:00:00" }]);
      setProfilePicture(null);
      setProfilePicturePreview("");
      setOrder(9999);
    }
  }, [initialData, isOpen]);

  const addAvailability = () => {
    const newSlot: PsychicAvailabilityCreate = { 
      day_of_the_week: "Monday", 
      start_at: "09:00:00", 
      end_at: "17:00:00" 
    };
    setAvailability([...availability, newSlot]);
  };

  const removeAvailability = (index: number) => {
    setAvailability(availability.filter((_, i) => i !== index));
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setProfilePicture(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setProfilePicturePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = () => {
    const formData = new FormData();

    if (initialData) {
      const updateData: any = {
        email,
        is_online: isOnline,
        price_per_second: pricePerSecond,
        categories_ids: selectedCategories,
        bio,
        order,
        availabilities_create: availability,
        replace_availabilities: true,
      };

      formData.append("data", JSON.stringify(updateData));
      formData.append("isUpdate", "true");
      formData.append("psychicId", initialData.id.toString());
    } else {
      if (!username || !email || !password || !profilePicture) {
        alert("Please fill in all required fields including username, email, password, and profile picture");
        return;
      }

      const createData = {
        username,
        email,
        password,
        bio,
        price_per_second: pricePerSecond,
        is_online: isOnline,
        categories_ids: selectedCategories,
        availability,
        order,
      };

      formData.append("data", JSON.stringify(createData));
      formData.append("isUpdate", "false");
    }

    if (profilePicture) {
      formData.append("profilePicture", profilePicture);
    }

    onSave(formData);
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 sm:p-6 md:p-10">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="absolute inset-0 bg-black/80 backdrop-blur-md"
        />

        {/* Modal Card Structure */}
        <motion.div
          initial={{ scale: 0.96, opacity: 0, y: 15 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.96, opacity: 0, y: 15 }}
          transition={{ type: "spring", duration: 0.5, bounce: 0.15 }}
          className="relative w-full max-w-5xl max-h-[90vh] flex flex-col rounded-[32px] border border-white/10 overflow-hidden shadow-[0_50px_100px_-20px_rgba(0,0,0,0.7)]"
          style={{ 
            backgroundColor: `${COLORS.surface || "#121214"}95`, 
            fontFamily: TYPOGRAPHY.fontFamily.body,
            backdropFilter: "blur(30px)"
          }}
        >
          {/* Ambient Glow */}
          <div className="absolute top-0 left-1/4 -translate-x-1/2 w-[350px] h-[350px] bg-primary/5 rounded-full blur-[130px] pointer-events-none" style={{ backgroundColor: COLORS.primary }} />

          {/* Fixed Header */}
          <div className="relative px-8 py-6 border-b border-white/5 flex items-center justify-between bg-white/[0.01] backdrop-blur-md z-10">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-2xl border border-white/5 bg-white/[0.02]" style={{ color: COLORS.primary }}>
                <Icon icon="solar:magic-stick-3-bold-duotone" className="text-2xl" />
              </div>
              <div>
                <h3 className="text-xl font-black uppercase italic tracking-tighter text-white">
                  {initialData ? "Edit" : "Create"} <span style={{ color: COLORS.primary }}>Practitioner</span>
                </h3>
                <p className="text-[9px] font-black uppercase tracking-[0.4em] text-white/30 mt-0.5">
                  Profile Configuration Matrix
                </p>
              </div>
            </div>
            <button 
              onClick={onClose} 
              className="p-2.5 rounded-xl border border-white/5 bg-white/[0.02] text-white/40 hover:text-white hover:border-white/20 transition-all active:scale-95"
            >
              <Icon icon="solar:close-circle-bold" className="text-xl" />
            </button>
          </div>

          {/* Core Content Viewports */}
          <div className="flex-1 overflow-y-auto p-8 md:p-10 grid grid-cols-12 gap-8 custom-scrollbar">
            
            {/* Left Content Side */}
            <div className="col-span-12 md:col-span-7 space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-[9px] font-black uppercase tracking-widest text-white/40 ml-1">
                    Username{!initialData && " *"}
                  </label>
                  <PrimaryInput 
                    value={username} 
                    onChange={(e) => setUsername(e.target.value)} 
                    placeholder="elena_vance"
                    disabled={!!initialData}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[9px] font-black uppercase tracking-widest text-white/40 ml-1">
                    Email Address *
                  </label>
                  <PrimaryInput 
                    value={email} 
                    onChange={(e) => setEmail(e.target.value)} 
                    placeholder="email@nexus.aura"
                    type="email"
                  />
                </div>
              </div>

              {!initialData && (
                <div className="space-y-2">
                  <label className="text-[9px] font-black uppercase tracking-widest text-white/40 ml-1">Password *</label>
                  <PrimaryInput 
                    value={password} 
                    onChange={(e) => setPassword(e.target.value)} 
                    placeholder="Enter unique credential pass"
                    type="password"
                  />
                </div>
              )}

              <div className="space-y-2 searchable-select-custom">
                <SearchableMultiSelect
                  options={categories}
                  selectedIds={selectedCategories}
                  onChange={setSelectedCategories}
                  placeholder="Select linked attributes..."
                  label="Specialties & Core Categories"
                />
              </div>

              <div className="space-y-2">
                <label className="text-[9px] font-black uppercase tracking-widest text-white/40 ml-1">
                  Profile Avatar Picture{!initialData && " *"}
                </label>
                <div className="flex items-center gap-4 p-4 rounded-xl border border-white/5 bg-white/[0.01]">
                  {profilePicturePreview && (
                    <img 
                      src={profilePicturePreview} 
                      alt="Preview" 
                      className="w-16 h-16 rounded-xl object-cover border border-white/10 shadow-md bg-black/20"
                    />
                  )}
                  <div className="flex-1">
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleFileChange}
                      className="text-xs text-white/60 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-black file:uppercase file:tracking-wider file:bg-white/10 file:text-white hover:file:bg-white/15 file:transition-all cursor-pointer"
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[9px] font-black uppercase tracking-widest text-white/40 ml-1">Biography Statement</label>
                <textarea
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  className="w-full h-32 rounded-2xl bg-white/[0.02] border border-white/5 p-4 text-xs text-white/90 focus:border-white/20 transition-all resize-none outline-none leading-relaxed"
                  placeholder="Enter summary profile introduction descriptions..."
                />
              </div>
            </div>

            {/* Right Control Panels Side */}
            <div className="col-span-12 md:col-span-5 space-y-6">
              
              {/* Pricing Box */}
              <div className="p-6 rounded-2xl border border-white/5 bg-white/[0.01] flex items-center justify-between gap-4">
                <div className="flex flex-col">
                  <span className="text-[10px] font-black uppercase text-white tracking-widest">Pricing Matrix</span>
                  <span className="text-[9px] text-white/30 uppercase font-bold mt-0.5">USD Base Rate per Second</span>
                </div>
                <div className="w-28">
                  <PrimaryInput
                    type="number"
                    value={pricePerSecond.toString()}
                    onChange={(e) => setPricePerSecond(parseFloat(e.target.value) || 0)}
                  />
                </div>
              </div>

              {/* Display Order Box */}
              <div className="p-6 rounded-2xl border border-white/5 bg-white/[0.01] flex items-center justify-between gap-4">
                <div className="flex flex-col">
                  <span className="text-[10px] font-black uppercase text-white tracking-widest">Display Sequence</span>
                  <span className="text-[9px] text-white/30 uppercase font-bold mt-0.5">List Ordering Priority</span>
                </div>
                <div className="w-28">
                  <PrimaryInput
                    type="number"
                    value={order.toString()}
                    onChange={(e) => setOrder(Number(e.target.value) || 0)}
                  />
                </div>
              </div>

              {/* Availability Panel */}
              <div className="p-6 rounded-2xl border border-white/5 bg-white/[0.01] space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-black uppercase text-white tracking-widest">Availability Timeline</span>
                  <button 
                    onClick={addAvailability} 
                    className="text-[9px] text-white border border-white/10 px-2.5 py-1 rounded-lg font-black uppercase flex items-center gap-1 hover:bg-white/5 transition-all"
                  >
                    <Icon icon="solar:add-circle-bold" className="text-xs" style={{ color: COLORS.primary }} /> Add Slot
                  </button>
                </div>
                
                <div className="space-y-2.5 max-h-[220px] overflow-y-auto pr-1 custom-scrollbar">
                  {availability.length === 0 ? (
                    <div className="text-center py-6 text-xs text-white/30 italic border border-dashed border-white/5 rounded-xl">
                      No availability windows added
                    </div>
                  ) : (
                    availability.map((slot, index) => (
                      <div key={index} className="flex items-center gap-2 border border-white/5 p-2.5 rounded-xl bg-black/20">
                        <select
                          value={slot.day_of_the_week}
                          onChange={(e) => {
                            const newArr = [...availability];
                            newArr[index].day_of_the_week = e.target.value;
                            setAvailability(newArr);
                          }}
                          className="bg-neutral-900 border border-white/5 rounded-lg p-1.5 text-[9px] text-white font-black uppercase outline-none cursor-pointer"
                        >
                          {["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"].map((d) => (
                            <option key={d} value={d}>{d.substring(0, 3)}</option>
                          ))}
                        </select>
                        
                        <input
                          type="time"
                          value={slot.start_at ? slot.start_at.substring(0, 5) : "09:00"}
                          onChange={(e) => {
                            const newArr = [...availability];
                            newArr[index].start_at = `${e.target.value}:00`;
                            setAvailability(newArr);
                          }}
                          className="bg-neutral-900 border border-white/5 rounded-lg p-1 text-[10px] text-white/80 font-bold outline-none text-center"
                        />
                        <span className="text-white/20 font-mono text-xs">—</span>
                        <input
                          type="time"
                          value={slot.end_at ? slot.end_at.substring(0, 5) : "17:00"}
                          onChange={(e) => {
                            const newArr = [...availability];
                            newArr[index].end_at = `${e.target.value}:00`;
                            setAvailability(newArr);
                          }}
                          className="bg-neutral-900 border border-white/5 rounded-lg p-1 text-[10px] text-white/80 font-bold outline-none text-center"
                        />

                        <button 
                          onClick={() => removeAvailability(index)} 
                          className="ml-auto p-1.5 rounded-lg text-white/30 hover:text-red-400 hover:bg-white/5 transition-colors"
                        >
                          <Icon icon="solar:trash-bin-minimalistic-bold" className="text-sm" />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Status Switcher Toggle */}
              <div className="flex items-center justify-between p-5 rounded-2xl border border-white/5 bg-white/[0.01]">
                <div className="flex items-center gap-3">
                  <div 
                    className="w-1.5 h-1.5 rounded-full animate-pulse" 
                    style={{ 
                      backgroundColor: isOnline ? (COLORS.primary || "#fff") : "rgba(255,255,255,0.2)",
                      boxShadow: isOnline ? `0 0 8px ${COLORS.primary}` : "none"
                    }} 
                  />
                  <span className="text-[10px] font-black uppercase tracking-widest text-white">Online Lifecycle Status</span>
                </div>
                <button 
                  onClick={() => setIsOnline(!isOnline)}
                  className="w-12 h-6 rounded-full p-0.5 border border-white/20 flex items-center transition-all bg-black/20"
                >
                  <motion.div 
                    layout
                    animate={{ x: isOnline ? 22 : 0 }} 
                    className="w-4 h-4 rounded-full bg-white shadow-md" 
                  />
                </button>
              </div>
            </div>

          </div>

          {/* Action Processing Sticky Footer */}
          <div className="px-8 py-5 border-t border-white/5 bg-white/[0.01] backdrop-blur-md flex gap-4 z-10">
            <button 
              onClick={onClose}
              className="flex-1 h-12 rounded-xl border border-white/10 text-[10px] font-black uppercase tracking-widest text-white hover:bg-white/5 transition-all"
            >
              Cancel
            </button>
            <button 
              onClick={handleSubmit}
              className="flex-[2] h-12 rounded-xl bg-white text-black font-black uppercase text-[10px] tracking-widest flex items-center justify-center gap-2 hover:opacity-90 active:scale-[0.99] transition-all"
            >
              {initialData ? "Update Practitioner Profile" : "Create Profile"}
              <Icon icon="solar:alt-arrow-right-bold" className="text-base" />
            </button>
          </div>
        </motion.div>
      </div>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 5px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.05);
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(255, 255, 255, 0.12);
        }
      `}</style>
    </AnimatePresence>
  );
};

export default PractitionerModal;