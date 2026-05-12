import React, { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Icon } from "@iconify/react";
import PrimaryInput from "../CustomInputs/PrimaryInput";
import PrimarySelect from "../CustomInputs/PrimarySelect";
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

  useEffect(() => {
    if (initialData) {
      setUsername(initialData.username);
      setEmail(initialData.email);
      setPassword(""); // Don't show existing password
      setBio(initialData.bio);
      setPricePerSecond(initialData.price_per_second);
      setIsOnline(initialData.is_online);
      setSelectedCategories(initialData.categories.map(c => c.id));
      setAvailability(initialData.availability.map(a => ({
        day_of_the_week: a.day_of_the_week,
        start_at: a.start_at,
        end_at: a.end_at,
      })));
      setProfilePicturePreview(initialData.profile_picture_url);
      setProfilePicture(null);
    } else {
      // Reset form for new psychic
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
      // Create preview URL
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
      // Update mode - only include changed fields
      const updateData: any = {
        email,
        is_online: isOnline,
        price_per_second: pricePerSecond,
        categories_ids: selectedCategories,
        bio,
      };
      
      // Add new availability slots
      if (availability.length > 0) {
        updateData.availabilities_create = availability;
      }

      formData.append("data", JSON.stringify(updateData));
      formData.append("isUpdate", "true");
      formData.append("psychicId", initialData.id.toString());
    } else {
      // Create mode - all fields required
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
      <div className="fixed inset-0 z-[150] flex items-center justify-center p-4">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="absolute inset-0 bg-black/60 backdrop-blur-md"
        />

        {/* Modal Card - Ghost Design */}
        <motion.div
          initial={{ scale: 0.98, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.98, opacity: 0 }}
          className="relative w-full max-w-7xl rounded-[40px] border border-white/20 overflow-hidden shadow-2xl"
          style={{ backgroundColor: "transparent", fontFamily: TYPOGRAPHY.fontFamily.body }}
        >
          {/* Main Content Wrapper (Adds subtle glass effect over your dark background) */}
          <div className="bg-white/[0.03] backdrop-blur-2xl">
            
            {/* Header Bar */}
            <div className="px-10 py-8 border-b border-white/10 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <Icon icon="solar:magic-stick-3-bold-duotone" className="text-3xl text-white" />
                <div>
                  <h3 className="text-xl font-black uppercase italic tracking-tighter text-white">
                    {initialData ? "Edit" : "Add"} <span style={{ color: COLORS.primary }}>Psychic</span>
                  </h3>
                  <p className="text-[10px] font-black uppercase tracking-widest text-white/40">Psychic Information</p>
                </div>
              </div>
              <button onClick={onClose} className="text-white/20 hover:text-white transition-colors">
                <Icon icon="solar:close-circle-bold" className="text-2xl" />
              </button>
            </div>

            {/* Main Grid Content */}
            <div className="p-10 grid grid-cols-12 gap-12">
              
              {/* Left Column */}
              <div className="col-span-7 space-y-8">
                <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-3">
                    <label className="text-[10px] font-black uppercase tracking-widest text-white/40 ml-1">Username{!initialData && " *"}</label>
                    <PrimaryInput 
                      value={username} 
                      onChange={(e) => setUsername(e.target.value)} 
                      placeholder="elena_vance"
                      disabled={!!initialData}
                    />
                  </div>
                  <div className="space-y-3">
                    <label className="text-[10px] font-black uppercase tracking-widest text-white/40 ml-1">Email *</label>
                    <PrimaryInput 
                      value={email} 
                      onChange={(e) => setEmail(e.target.value)} 
                      placeholder="email@nexus.aura"
                      type="email"
                    />
                  </div>
                </div>

                {!initialData && (
                  <div className="space-y-3">
                    <label className="text-[10px] font-black uppercase tracking-widest text-white/40 ml-1">Password *</label>
                    <PrimaryInput 
                      value={password} 
                      onChange={(e) => setPassword(e.target.value)} 
                      placeholder="Enter password"
                      type="password"
                    />
                  </div>
                )}

                <div className="space-y-3">
                  <SearchableMultiSelect
                    options={categories}
                    selectedIds={selectedCategories}
                    onChange={setSelectedCategories}
                    placeholder="Select categories..."
                    label="Categories"
                  />
                </div>

                <div className="space-y-3">
                  <label className="text-[10px] font-black uppercase tracking-widest text-white/40 ml-1">Profile Picture{!initialData && " *"}</label>
                  <div className="flex items-center gap-4">
                    {profilePicturePreview && (
                      <img 
                        src={profilePicturePreview} 
                        alt="Preview" 
                        className="w-20 h-20 rounded-2xl object-cover border border-white/20"
                      />
                    )}
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleFileChange}
                      className="text-sm text-white/60"
                    />
                  </div>
                </div>

                <div className="space-y-3">
                  <label className="text-[10px] font-black uppercase tracking-widest text-white/40 ml-1">Psychic Bio</label>
                  <textarea
                    value={bio}
                    onChange={(e) => setBio(e.target.value)}
                    className="w-full h-32 rounded-3xl bg-white/[0.05] border border-white/20 p-5 text-sm text-white focus:border-white transition-all resize-none outline-none"
                    placeholder="Enter bio information..."
                  />
                </div>
              </div>

              {/* Right Column */}
              <div className="col-span-5 space-y-8">
                <div className="p-8 rounded-[40px] border border-white/20 space-y-8">
                  <div className="flex items-center justify-between">
                    <div className="flex flex-col">
                      <span className="text-[11px] font-black uppercase text-white tracking-widest">Pricing Model</span>
                      <span className="text-[9px] text-white/40 uppercase font-bold mt-1">USD per second billing</span>
                    </div>
                    <div className="w-32">
                      <PrimaryInput
                        type="number"
                        step="0.01"
                        value={(pricePerSecond ?? 0).toString()}
                        onChange={(e) => setPricePerSecond(parseFloat(e.target.value) || 0)}
                      />
                    </div>
                  </div>

                  <div className="h-[1px] bg-white/10" />

                  <div className="space-y-5">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-black uppercase text-white tracking-widest">Availability</span>
                      <button onClick={addAvailability} className="text-[10px] text-white border border-white/20 px-3 py-1 rounded-full font-black uppercase flex items-center gap-1 hover:bg-white/10 transition-all">
                        <Icon icon="solar:add-circle-bold" /> Add
                      </button>
                    </div>
                    
                    <div className="space-y-3 max-h-[160px] overflow-y-auto pr-2 custom-scrollbar">
                      {availability.map((slot, index) => (
                        <div key={index} className="flex items-center gap-3 border border-white/10 p-3 rounded-2xl bg-white/[0.02]">
                          <select
                            value={slot.day_of_the_week}
                            onChange={(e) => {
                              const newArr = [...availability];
                              newArr[index].day_of_the_week = e.target.value;
                              setAvailability(newArr);
                            }}
                            className="bg-transparent text-[10px] text-white font-black uppercase outline-none"
                          >
                            {["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"].map((d) => (
                              <option key={d} value={d} className="bg-black">{d.substring(0, 3)}</option>
                            ))}
                          </select>
                          <input
                            type="time"
                            value={slot.start_at.substring(0, 5)}
                            onChange={(e) => {
                              const newArr = [...availability];
                              newArr[index].start_at = `${e.target.value}:00`;
                              setAvailability(newArr);
                            }}
                            className="bg-transparent text-[11px] text-white/80 font-bold outline-none"
                          />
                          <span className="text-white/20">—</span>
                          <input
                            type="time"
                            value={slot.end_at.substring(0, 5)}
                            onChange={(e) => {
                              const newArr = [...availability];
                              newArr[index].end_at = `${e.target.value}:00`;
                              setAvailability(newArr);
                            }}
                            className="bg-transparent text-[11px] text-white/80 font-bold outline-none"
                          />
                          <button onClick={() => removeAvailability(index)} className="ml-auto text-white/20 hover:text-white transition-colors">
                            <Icon icon="solar:trash-bin-minimalistic-bold" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Status Toggle */}
                <div className="flex items-center justify-between p-8 rounded-[32px] border border-white/20">
                  <div className="flex items-center gap-3">
                    <div className={`w-2 h-2 rounded-full ${isOnline ? 'bg-primary' : 'bg-white/20'} animate-pulse`} />
                    <span className="text-[11px] font-black uppercase tracking-widest text-white">Online Status</span>
                  </div>
                  <button 
                    onClick={() => setIsOnline(!isOnline)}
                    className="w-14 h-7 rounded-full p-1 border border-white/40 flex items-center transition-all"
                  >
                    <motion.div 
                      animate={{ x: isOnline ? 28 : 0 }} 
                      className="w-5 h-5 rounded-full bg-white" 
                    />
                  </button>
                </div>
              </div>
            </div>

            {/* Action Footer */}
            <div className="px-10 py-10 border-t border-white/10 flex gap-6">
              <button 
                onClick={onClose}
                className="flex-1 h-16 rounded-[24px] border border-white/20 text-[11px] font-black uppercase tracking-[0.4em] text-white hover:bg-white/5 transition-all"
              >
                Cancel
              </button>
              <button 
                onClick={handleSubmit}
                className="flex-[2] h-16 rounded-[24px] bg-white text-black font-black uppercase text-[11px] tracking-[0.5em] flex items-center justify-center gap-3 hover:scale-[1.01] transition-transform"
              >
                {initialData ? "Update Psychic" : "Create Psychic"}
                <Icon icon="solar:alt-arrow-right-bold" className="text-xl" />
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

export default PractitionerModal;