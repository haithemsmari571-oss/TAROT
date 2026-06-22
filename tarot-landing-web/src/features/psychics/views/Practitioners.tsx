import React, { useState, useMemo, useEffect } from "react";
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, arrayMove, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Icon } from "@iconify/react";
import { type Psychic } from "../data/PractitionersUsers";
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

  // Apply filters first
  const filteredPsychics = useMemo(() => {
    return psychics.filter((p) => {
      const matchesSearch =
        p.username.toLowerCase().includes(search.toLowerCase()) ||
        p.email.toLowerCase().includes(search.toLowerCase()) ||
        p.bio.toLowerCase().includes(search.toLowerCase()) ||
        p.id.toString().includes(search);

      const matchesCategory = categoryFilter === "All" || p.categories.some(cat => cat.title === categoryFilter);

      const matchesOnline =
        onlineFilter === "all" ||
        (onlineFilter === "online" && p.is_online) ||
        (onlineFilter === "offline" && !p.is_online);

      return matchesSearch && matchesCategory && matchesOnline;
    });
  }, [psychics, search, categoryFilter, onlineFilter]);

  // Sort by manual order if present, otherwise by username
  const sortedPsychics = useMemo(() => {
    const list = [...filteredPsychics];
    list.sort((a, b) => {
      const aOrder = a.order ?? Number.MAX_SAFE_INTEGER;
      const bOrder = b.order ?? Number.MAX_SAFE_INTEGER;
      if (aOrder !== bOrder) return aOrder - bOrder;
      return a.username.localeCompare(b.username);
    });
    return list;
  }, [filteredPsychics]);

  const handleDragEnd = (event: any) => {
    const { active, over } = event;
    if (active.id !== over?.id) {
      const oldIndex = sortedPsychics.findIndex(p => p.id === active.id);
      const newIndex = sortedPsychics.findIndex(p => p.id === over?.id);
      const newOrder = arrayMove(sortedPsychics, oldIndex, newIndex);
      setPsychics(newOrder);
      // Update order on backend
      const moved = newOrder[newIndex];
      psychicsApi.updatePsychic(moved.id, { ...moved, order: newIndex }).catch(() => {});
    }
  };

  const SortableItem = ({ id, psychic }: { id: number, psychic: Psychic }) => {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
    const style = {
      transform: CSS.Transform.toString(transform),
      transition,
      opacity: isDragging ? 0.5 : 1,
    };
    return (
      <div ref={setNodeRef} style={style} className="border-b border-white/10 p-4 flex items-center justify-between bg-transparent">
        <div className="flex-1 flex items-center gap-4">
          <div className="w-11 h-11 rounded-[14px] overflow-hidden border" style={{ backgroundColor: `rgba(255,255,255,0.02)`, borderColor: `rgba(255,255,255,0.05)` }}>
            {psychic.profile_picture_url ? (
              <img src={psychic.profile_picture_url} alt={psychic.username} className="w-full h-full object-cover grayscale-[0.3] hover:grayscale-0 transition-all" />
            ) : (
              <div className="w-full h-full flex items-center justify-center grayscale"><Icon icon="ph:user-fill" className="text-white/20 text-xl" /></div>
            )}
          </div>
          <div className="flex flex-col">
            <span className="text-white font-bold" style={{ fontSize: TYPOGRAPHY.fontSize.sm }}>{psychic.username}</span>
            <span style={{ color: COLORS.primary, fontSize: "9px" }} className="uppercase font-black tracking-widest opacity-60">{psychic.is_verified && "✓ "}@{psychic.username}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button className="p-3 rounded-xl text-white/20 hover:text-primary hover:bg-primary/5 transition-all" onClick={() => { setPsychicToView(psychic); setIsDetailsModalOpen(true); }} title="View Details"><Icon icon="solar:eye-bold-duotone" className="text-lg" /></button>
          <button className="p-3 rounded-xl text-white/20 hover:text-primary hover:bg-primary/5 transition-all" onClick={() => { setSelectedPsychic(psychic); setIsModalOpen(true); }} title="Edit"><Icon icon="solar:pen-new-round-bold-duotone" className="text-lg" /></button>
          <button className="p-3 rounded-xl text-white/20 hover:text-starGold hover:bg-starGold/5 transition-all" onClick={() => { setPsychicToDelete(psychic); setIsDeleteModalOpen(true); }} title="Delete"><Icon icon="solar:trash-bin-trash-bold-duotone" className="text-lg" /></button>
          <div className="cursor-grab text-white/30" {...listeners} {...attributes}><Icon icon="solar:drag-horizontal-bold" className="text-lg" /></div>
        </div>
      </div>
    );
  };

  const handleSave = async (formData: FormData) => {
    try {
      setLoading(true);
      const isUpdate = formData.get("isUpdate") === "true";
      const dataStr = formData.get("data") as string;
      const profilePicture = formData.get("profilePicture") as File | null;
      const parsedData = JSON.parse(dataStr);

      if (isUpdate) {
        const psychicId = parseInt(formData.get("psychicId") as string);
        const updated = await psychicsApi.updatePsychic(psychicId, parsedData, profilePicture || undefined);
        setPsychics(psychics.map((p) => (p.id === psychicId ? updated : p)));
        toast.success("Psychic updated successfully!");
      } else {
        if (!profilePicture) {
          toast.error("Profile picture is required for new psychics");
          setLoading(false);
          return;
        }
        const created = await psychicsApi.createPsychic(parsedData, profilePicture);
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
      await psychicsApi.deletePsychic(psychicToDelete.id);
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

  if (loading) return <div className="p-12 min-h-screen flex items-center justify-center" style={{ backgroundColor: COLORS.dark }}><div className="flex flex-col items-center gap-4"><Icon icon="solar:spinner-bold-duotone" className="text-5xl text-primary animate-spin" /></div></div>;

  return (
    <div className="p-12 min-h-screen" style={{ backgroundColor: COLORS.dark, fontFamily: TYPOGRAPHY.fontFamily.body }}>
      <div className="mb-12">
        <h1 style={TYPOGRAPHY.headings.h2} className="uppercase italic tracking-tighter text-white">Manage <span style={{ color: COLORS.primary }}>Psychics</span></h1>
      </div>
      <div className="p-6 rounded-[32px] border border-white/5 mb-10 flex flex-wrap items-end gap-10 shadow-2xl backdrop-blur-sm" style={{ backgroundColor: `${COLORS.surface}80` }}>
        <div className="flex-1 min-w-[300px]">
          <label className="block text-[9px] font-black uppercase text-white/20 mb-3 ml-1 tracking-widest">Search</label>
          <PrimaryInput fullWidth placeholder="Search by username, email, or bio..." value={search} onChange={(e) => setSearch(e.target.value)} iconLeft={<Icon icon="solar:magnifer-linear" className="text-xl opacity-20" />} />
        </div>
        <div className="w-52"><PrimarySelect label="Category" value={categoryFilter} options={[{ label: "All Categories", value: "All" }, ...categories.map(cat => ({ label: cat.title, value: cat.title }))]} onChange={setCategoryFilter} /></div>
        <div className="w-48"><PrimarySelect label="Status" value={onlineFilter} options={[{ label: "All Status", value: "all" }, { label: "Online", value: "online" }, { label: "Offline", value: "offline" }]} onChange={setOnlineFilter} /></div>
        <button onClick={() => { setSelectedPsychic(null); setIsModalOpen(true); }} className="h-[52px] px-12 rounded-2xl font-black uppercase text-[10px] tracking-[0.3em] transition-all hover:scale-[1.02] active:scale-95 shadow-xl group" style={{ backgroundColor: COLORS.primary, color: COLORS.dark, fontFamily: TYPOGRAPHY.fontFamily.heading }}>
          <span className="flex items-center gap-2">Add Psychic <Icon icon="solar:add-circle-bold" className="text-lg" /></span>
        </button>
      </div>
      <div className="rounded-[32px] overflow-hidden border border-white/5 bg-transparent shadow-[0_30px_60px_rgba(0,0,0,0.4)]">
        <DndContext sensors={useSensors(useSensor(PointerSensor), useSensor(KeyboardSensor))} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={sortedPsychics.map(p => p.id)} strategy={verticalListSortingStrategy}>
            {sortedPsychics.map((psychic) => <SortableItem key={psychic.id} id={psychic.id} psychic={psychic} />)}
          </SortableContext>
        </DndContext>
      </div>
      <PractitionerModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} onSave={handleSave} initialData={selectedPsychic} categories={categories} />
      <PsychicDetailsModal isOpen={isDetailsModalOpen} onClose={() => { setIsDetailsModalOpen(false); setPsychicToView(null); }} psychic={psychicToView} />
      <DeleteModal isOpen={isDeleteModalOpen} onClose={() => { setIsDeleteModalOpen(false); setPsychicToDelete(null); }} onConfirm={handleConfirmPurge} title="Delete Psychic" itemName={psychicToDelete?.username} description="Are you sure you want to delete this psychic? This action cannot be undone." />
    </div>
  );
};

export default Practitioners;