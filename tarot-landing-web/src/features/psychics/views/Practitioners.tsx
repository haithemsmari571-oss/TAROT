import React, { useState, useMemo, useEffect } from "react";
import { Icon } from "@iconify/react";
import { type Psychic, getCategoryColor } from "../data/PractitionersUsers";
import { PrimaryTable, type Column } from "../../../components/Table/PrimaryTable";
import PractitionerModal from "../../../components/modals/PractitionerModal";
import DeleteModal from "../../../components/modals/DeleteModal";
import PsychicDetailsModal from "../../../components/modals/PsychicDetailsModal";
import PrimarySelect from "../../../components/CustomInputs/PrimarySelect";
import PrimaryInput from "../../../components/CustomInputs/PrimaryInput";
import { COLORS, TYPOGRAPHY } from "../../../theme";
import { psychicsApi } from "../../browse/api/psychicsApi";
import { categoriesApi } from "../../browse/api/categoriesApi";
import type { PsychicCategory } from "../../browse/types/psychic.types";
import { useToast } from "../../../components/Toast";

const Practitioners = () => {
  const [psychics, setPsychics] = useState<Psychic[]>([]);
  const [categories, setCategories] = useState<PsychicCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedPsychic, setSelectedPsychic] = useState<Psychic | null>(null);

  // --- Deletion State ---
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [psychicToDelete, setPsychicToDelete] = useState<Psychic | null>(null);

  // --- Details State ---
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
  const [psychicToView, setPsychicToView] = useState<Psychic | null>(null);

  // --- Filter State ---
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("All");
  const [onlineFilter, setOnlineFilter] = useState<string>("all");

  const toast = useToast();

  // Fetch data on mount
  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);
        
        // Fetch both psychics and categories
        const [psychicsData, categoriesData] = await Promise.all([
          psychicsApi.getPsychics({ limit: 100 }), // Fetch all psychics
          categoriesApi.getCategories()
        ]);
        
        setPsychics(psychicsData.items);
        setCategories(categoriesData);
      } catch (err) {
        console.error("Error fetching data:", err);
        setError("Failed to load psychics. Please try again.");
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  const filteredPsychics = useMemo(() => {
    return psychics.filter((p) => {
      // Search filter
      const matchesSearch =
        p.username.toLowerCase().includes(search.toLowerCase()) ||
        p.email.toLowerCase().includes(search.toLowerCase()) ||
        p.bio.toLowerCase().includes(search.toLowerCase()) ||
        p.id.toString().includes(search);
      
      // Category filter
      const matchesCategory = categoryFilter === "All" || 
        p.categories.some(cat => cat.title === categoryFilter);
      
      // Online status filter
      const matchesOnline = 
        onlineFilter === "all" ||
        (onlineFilter === "online" && p.is_online) ||
        (onlineFilter === "offline" && !p.is_online);
      
      return matchesSearch && matchesCategory && matchesOnline;
    });
  }, [psychics, search, categoryFilter, onlineFilter]);

  const handleSave = async (formData: FormData) => {
    try {
      setLoading(true);
      const isUpdate = formData.get("isUpdate") === "true";
      const dataStr = formData.get("data") as string;
      const profilePicture = formData.get("profilePicture") as File | null;
      const parsedData = JSON.parse(dataStr);

      if (isUpdate) {
        const psychicId = parseInt(formData.get("psychicId") as string);
        
        // Call update API
        const updated = await psychicsApi.updatePsychic(
          psychicId,
          parsedData,
          profilePicture || undefined
        );
        
        // Update local state
        setPsychics(
          psychics.map((p) =>
            p.id === psychicId ? updated : p
          )
        );
        
        toast.success("Psychic updated successfully!");
      } else {
        // Validate required fields for creation
        if (!profilePicture) {
          toast.error("Profile picture is required for new psychics");
          setLoading(false);
          return;
        }

        // Call create API
        const created = await psychicsApi.createPsychic(parsedData, profilePicture);
        
        // Add to local state
        setPsychics([created, ...psychics]);
        
        toast.success("Psychic created successfully!");
      }
      
      setIsModalOpen(false);
      setSelectedPsychic(null);
    } catch (err: any) {
      console.error("Error saving practitioner:", err);
      toast.error(`Failed to save: ${err.response?.data?.detail || err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmPurge = async () => {
    if (!psychicToDelete) return;
    
    try {
      setLoading(true);
      
      // Call delete API
      await psychicsApi.deletePsychic(psychicToDelete.id);
      
      // Remove from local state
      setPsychics((prev) => prev.filter((p) => p.id !== psychicToDelete.id));
      
      toast.success("Psychic deleted successfully!");
      setIsDeleteModalOpen(false);
      setPsychicToDelete(null);
    } catch (err: any) {
      console.error("Error deleting practitioner:", err);
      toast.error(`Failed to delete: ${err.response?.data?.detail || err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const columns: Column<Psychic>[] = [
    {
      key: "username",
      label: "Psychic",
      sortable: true,
      render: (p) => (
        <div className="flex items-center gap-4">
          <div
            className="w-11 h-11 rounded-[14px] overflow-hidden border transition-all hover:scale-110 shrink-0"
            style={{
              backgroundColor: `rgba(255,255,255,0.02)`,
              borderColor: `rgba(255,255,255,0.05)`,
            }}
          >
            {p.profile_picture_url ? (
              <img 
                src={p.profile_picture_url} 
                alt={p.username} 
                className="w-full h-full object-cover grayscale-[0.3] hover:grayscale-0 transition-all" 
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center grayscale">
                <Icon icon="ph:user-fill" className="text-white/20 text-xl" />
              </div>
            )}
          </div>
          <div className="flex flex-col">
            <span className="text-white font-bold leading-tight" style={{ fontSize: TYPOGRAPHY.fontSize.sm }}>
              {p.username}
            </span>
            <span style={{ color: COLORS.primary, fontSize: "9px" }} className="uppercase font-black tracking-widest opacity-60">
              {p.is_verified && "✓ "}@{p.username}
            </span>
          </div>
        </div>
      ),
    },
    {
      key: "categories",
      label: "Categories",
      render: (p) => (
        <div className="flex flex-col gap-1">
          {p.categories.length > 0 ? (
            <>
              <div className="flex items-center gap-2">
                <Icon icon="solar:magic-stick-3-bold-duotone" className="text-xs text-primary" />
                <span className="text-[10px] font-black uppercase tracking-widest text-white/80">
                  {p.categories[0].title}
                </span>
              </div>
              {p.categories.length > 1 && (
                <span className="text-[9px] text-white/20 uppercase font-black">
                  + {p.categories.length - 1} more
                </span>
              )}
            </>
          ) : (
            <span className="text-[9px] text-white/30 italic">No specialty</span>
          )}
        </div>
      ),
    },
    {
      key: "availability",
      label: "Availability",
      render: (p) => (
        <div className="flex flex-col gap-1">
          {p.availability && p.availability.length > 0 ? (
            <>
              <div className="flex items-center gap-1.5">
                <div className="px-2 py-0.5 rounded-md bg-white/5 border border-white/5 flex items-center gap-1">
                   <Icon icon="solar:calendar-minimalistic-bold-duotone" className="text-[10px] text-primary" />
                   <span className="text-[9px] text-white/70 font-black uppercase tracking-tighter">
                     {p.availability[0].day_of_the_week}
                   </span>
                </div>
                <span className="text-[9px] text-white/30 font-bold">
                  {p.availability[0].start_at.split(':')[0]}:00 — {p.availability[0].end_at.split(':')[0]}:00
                </span>
              </div>
              {p.availability.length > 1 && (
                <span className="text-[8px] text-white/10 uppercase font-black ml-1">
                  + {p.availability.length - 1} additional slots
                </span>
              )}
            </>
          ) : (
            <span className="text-[9px] text-white/40 italic">Not set</span>
          )}
        </div>
      ),
    },
    {
      key: "price_per_second",
      label: "Rate",
      sortable: true,
      render: (p) => (
        <div className="flex flex-col">
          <span className="text-white font-bold text-xs">
            {new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format((p.price_per_second ?? 0) * 60)}/min
          </span>
          <div className="flex items-center gap-1 mt-0.5">
             <Icon icon="solar:dollar-bold-duotone" className="text-[10px] text-white/20" />
             <span className="text-[9px] text-white/30 uppercase font-black">
               ${(p.price_per_second ?? 0).toFixed(3)}/sec
             </span>
          </div>
        </div>
      ),
    },
    {
      key: "is_online",
      label: "Status",
      render: (p) => {
        const color = p.is_online ? COLORS.primary : COLORS.starGold;
        return (
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: color, boxShadow: `0 0 8px ${color}` }} />
            <span style={{ color, fontSize: "9px" }} className="font-black uppercase tracking-widest">
              {p.is_online ? "Live" : "Standby"}
            </span>
          </div>
        );
      },
    },
  ];

  if (loading) {
    return (
      <div className="p-12 min-h-screen flex items-center justify-center" style={{ backgroundColor: COLORS.dark }}>
        <div className="flex flex-col items-center gap-4">
          <Icon icon="solar:spinner-bold-duotone" className="text-5xl text-primary animate-spin" />
          <span className="text-white/60 font-bold uppercase tracking-widest text-sm">Loading Psychics...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-12 min-h-screen flex items-center justify-center" style={{ backgroundColor: COLORS.dark }}>
        <div className="flex flex-col items-center gap-4 max-w-md">
          <Icon icon="solar:danger-circle-bold-duotone" className="text-5xl text-starGold" />
          <span className="text-white font-bold text-lg">{error}</span>
          <button
            onClick={() => window.location.reload()}
            className="px-6 py-3 rounded-xl bg-primary text-dark font-bold uppercase text-xs tracking-wider hover:scale-105 transition-transform"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-12 min-h-screen" style={{ backgroundColor: COLORS.dark, fontFamily: TYPOGRAPHY.fontFamily.body }}>
      
      {/* Header */}
      <div className="mb-12">
        <h1 style={TYPOGRAPHY.headings.h2} className="uppercase italic tracking-tighter">
          Manage <span style={{ color: COLORS.primary }}>Psychics</span>
        </h1>
        <p style={{ color: COLORS.neutralGray }} className="text-[10px] font-bold uppercase tracking-widest mt-2 opacity-50">
          Psychic Management Dashboard
        </p>
      </div>

      {/* Control Strip */}
      <div
        className="p-6 rounded-[32px] border border-white/5 mb-10 flex flex-wrap items-end gap-10 shadow-2xl backdrop-blur-sm"
        style={{ backgroundColor: `${COLORS.surface}80` }}
      >
        <div className="flex-1 min-w-[300px]">
          <label className="block text-[9px] font-black uppercase text-white/20 mb-3 ml-1 tracking-widest">Search</label>
          <PrimaryInput
            fullWidth
            placeholder="Search by username, email, or bio..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            iconLeft={<Icon icon="solar:magnifer-linear" className="text-xl opacity-20" />}
          />
        </div>

        <div className="w-52">
          <PrimarySelect
            label="Category"
            value={categoryFilter}
            options={[
              { label: "All Categories", value: "All" },
              ...categories.map(cat => ({
                label: cat.title,
                value: cat.title
              }))
            ]}
            onChange={setCategoryFilter}
          />
        </div>

        <div className="w-48">
          <PrimarySelect
            label="Status"
            value={onlineFilter}
            options={[
              { label: "All Status", value: "all" },
              { label: "Online", value: "online" },
              { label: "Offline", value: "offline" },
            ]}
            onChange={setOnlineFilter}
          />
        </div>

        <button
          onClick={() => { setSelectedPsychic(null); setIsModalOpen(true); }}
          className="h-[52px] px-12 rounded-2xl font-black uppercase text-[10px] tracking-[0.3em] transition-all hover:scale-[1.02] active:scale-95 shadow-xl group"
          style={{
            backgroundColor: COLORS.primary,
            color: COLORS.dark,
            fontFamily: TYPOGRAPHY.fontFamily.heading,
          }}
        >
          <span className="flex items-center gap-2">
            Add Psychic
            <Icon icon="solar:add-circle-bold" className="text-lg group-hover:rotate-90 transition-transform" />
          </span>
        </button>
      </div>

      {/* Main Table */}
      <div className="rounded-[32px] overflow-hidden border border-white/5 bg-transparent shadow-[0_30px_60px_rgba(0,0,0,0.4)]">
        <PrimaryTable
          title="PSYCHICS LIST"
          data={filteredPsychics}
          columns={columns}
          actionsColumn={(p) => (
            <div className="flex items-center justify-end gap-1 pr-4">
              <button 
                className="p-3 rounded-xl text-white/20 hover:text-primary hover:bg-primary/5 transition-all"
                onClick={() => { setPsychicToView(p); setIsDetailsModalOpen(true); }}
                title="View Details"
              >
                <Icon icon="solar:eye-bold-duotone" className="text-lg" />
              </button>
              <button
                className="p-3 rounded-xl text-white/20 hover:text-primary hover:bg-primary/5 transition-all"
                onClick={() => { setSelectedPsychic(p); setIsModalOpen(true); }}
                title="Edit"
              >
                <Icon icon="solar:pen-new-round-bold-duotone" className="text-lg" />
              </button>
              <button
                className="p-3 rounded-xl text-white/20 hover:text-starGold hover:bg-starGold/5 transition-all"
                onClick={() => { setPsychicToDelete(p); setIsDeleteModalOpen(true); }}
                title="Delete"
              >
                <Icon icon="solar:trash-bin-trash-bold-duotone" className="text-lg" />
              </button>
            </div>
          )}
        />
      </div>

      {/* Modals */}
      <PractitionerModal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
        onSave={handleSave} 
        initialData={selectedPsychic}
        categories={categories}
      />

      <PsychicDetailsModal
        isOpen={isDetailsModalOpen}
        onClose={() => { setIsDetailsModalOpen(false); setPsychicToView(null); }}
        psychic={psychicToView}
      />

      <DeleteModal
        isOpen={isDeleteModalOpen}
        onClose={() => { setIsDeleteModalOpen(false); setPsychicToDelete(null); }}
        onConfirm={handleConfirmPurge}
        title="Delete Psychic"
        itemName={psychicToDelete?.username}
        description="Are you sure you want to delete this psychic? This action cannot be undone."
      />
    </div>
  );
};

export default Practitioners;