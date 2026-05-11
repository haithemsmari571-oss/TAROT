import React, { useState, useEffect, useMemo } from "react";
import { Icon } from "@iconify/react";
import { PrimaryTable, type Column } from "../../../components/Table/PrimaryTable";
import DeleteModal from "../../../components/modals/DeleteModal";
import PrimaryInput from "../../../components/CustomInputs/PrimaryInput";
import { COLORS, TYPOGRAPHY } from "../../../theme";
import { zodiacApi } from "../api/zodiacApi";
import type { ZodiacSign } from "../types/zodiac.types";
import { useToast } from "../../../components/Toast";
import ZodiacSignModal from "../../../components/modals/ZodiacSignModal";

const ZodiacSigns = () => {
  const [zodiacSigns, setZodiacSigns] = useState<ZodiacSign[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedSign, setSelectedSign] = useState<ZodiacSign | null>(null);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [signToDelete, setSignToDelete] = useState<ZodiacSign | null>(null);
  const [search, setSearch] = useState("");

  const toast = useToast();

  // Fetch zodiac signs on mount
  useEffect(() => {
    fetchZodiacSigns();
  }, []);

  const fetchZodiacSigns = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await zodiacApi.getZodiacSigns();
      setZodiacSigns(data);
    } catch (err: any) {
      console.error("Error fetching zodiac signs:", err);
      const errorMessage = err.response?.data?.message || err.response?.data?.detail || err.message || "Failed to load zodiac signs. Please try again.";
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const filteredSigns = useMemo(() => {
    return zodiacSigns.filter((sign) => {
      const matchesSearch =
        sign.name.toLowerCase().includes(search.toLowerCase()) ||
        sign.element.toLowerCase().includes(search.toLowerCase()) ||
        sign.ruling_planet.toLowerCase().includes(search.toLowerCase());
      return matchesSearch;
    });
  }, [zodiacSigns, search]);

  const handleSave = async (signData: any) => {
    try {
      setLoading(true);
      
      if (selectedSign) {
        // Update existing sign
        const updated = await zodiacApi.updateZodiacSign(selectedSign.id, signData);
        setZodiacSigns(zodiacSigns.map((s) => (s.id === selectedSign.id ? updated : s)));
        toast.success("Zodiac sign updated successfully!");
      } else {
        // Create new sign
        const created = await zodiacApi.createZodiacSign(signData);
        setZodiacSigns([created, ...zodiacSigns]);
        toast.success("Zodiac sign created successfully!");
      }
      
      setIsModalOpen(false);
      setSelectedSign(null);
    } catch (err: any) {
      console.error("Error saving zodiac sign:", err);
      const errorMessage = err.response?.data?.message || err.response?.data?.detail || err.message || "Unknown error";
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!signToDelete) return;
    
    try {
      setLoading(true);
      await zodiacApi.deleteZodiacSign(signToDelete.id);
      setZodiacSigns((prev) => prev.filter((s) => s.id !== signToDelete.id));
      toast.success("Zodiac sign deleted successfully!");
      setIsDeleteModalOpen(false);
      setSignToDelete(null);
    } catch (err: any) {
      console.error("Error deleting zodiac sign:", err);
      const errorMessage = err.response?.data?.message || err.response?.data?.detail || err.message || "Unknown error";
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const getElementColor = (element: string) => {
    const colors: Record<string, string> = {
      Fire: "#FF6B6B",
      Earth: "#51CF66",
      Air: "#74C0FC",
      Water: "#A78BFA",
    };
    return colors[element] || COLORS.primary;
  };

  const columns: Column<ZodiacSign>[] = [
    {
      key: "name",
      label: "Sign",
      sortable: true,
      render: (sign) => (
        <div className="flex items-center gap-4">
          <div
            className="w-12 h-12 rounded-2xl flex items-center justify-center font-black text-sm border-2 transition-all hover:scale-110"
            style={{
              backgroundColor: `${getElementColor(sign.element)}15`,
              borderColor: `${getElementColor(sign.element)}40`,
              color: getElementColor(sign.element),
            }}
          >
            {sign.name.substring(0, 2).toUpperCase()}
          </div>
          <div className="flex flex-col">
            <span className="text-white font-bold leading-tight" style={{ fontSize: TYPOGRAPHY.fontSize.sm }}>
              {sign.name}
            </span>
            <span
              style={{ color: COLORS.neutralGray, fontSize: "9px" }}
              className="uppercase font-black tracking-widest opacity-40"
            >
              {sign.date_range_start} to {sign.date_range_end}
            </span>
          </div>
        </div>
      ),
    },
    {
      key: "element",
      label: "Element",
      render: (sign) => (
        <div className="flex items-center gap-2">
          <div
            className="w-2 h-2 rounded-full"
            style={{
              backgroundColor: getElementColor(sign.element),
              boxShadow: `0 0 8px ${getElementColor(sign.element)}`,
            }}
          />
          <span
            className="text-[10px] font-black uppercase tracking-widest"
            style={{ color: getElementColor(sign.element) }}
          >
            {sign.element}
          </span>
        </div>
      ),
    },
    {
      key: "modality",
      label: "Modality",
      render: (sign) => (
        <span className="text-[10px] font-black uppercase tracking-widest text-white/60">
          {sign.modality}
        </span>
      ),
    },
    {
      key: "ruling_planet",
      label: "Ruling Planet",
      render: (sign) => (
        <div className="flex items-center gap-2">
          <Icon icon="solar:planet-bold-duotone" className="text-primary text-sm" />
          <span className="text-[10px] font-black uppercase tracking-widest text-white/80">
            {sign.ruling_planet}
          </span>
        </div>
      ),
    },
    {
      key: "core_trait",
      label: "Core Trait",
      render: (sign) => (
        <div className="flex flex-col gap-1">
          <span className="text-[10px] font-bold text-white/80">{sign.core_trait}</span>
          <span className="text-[9px] text-white/30 italic truncate max-w-[200px]">
            {sign.signature_trait}
          </span>
        </div>
      ),
    },
  ];

  if (loading && zodiacSigns.length === 0) {
    return (
      <div className="p-12 min-h-screen flex items-center justify-center" style={{ backgroundColor: COLORS.dark }}>
        <div className="flex flex-col items-center gap-4">
          <Icon icon="solar:stars-minimalistic-bold-duotone" className="text-5xl text-primary animate-spin" />
          <span className="text-white/60 font-bold uppercase tracking-widest text-sm">Loading Zodiac Signs...</span>
        </div>
      </div>
    );
  }

  if (error && zodiacSigns.length === 0) {
    return (
      <div className="p-12 min-h-screen flex items-center justify-center" style={{ backgroundColor: COLORS.dark }}>
        <div className="flex flex-col items-center gap-4 max-w-md">
          <Icon icon="solar:danger-circle-bold-duotone" className="text-5xl text-starGold" />
          <span className="text-white font-bold text-lg">{error}</span>
          <button
            onClick={fetchZodiacSigns}
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
      <div className="mb-12 flex justify-between items-end">
        <div>
          <h1 style={TYPOGRAPHY.headings.h2} className="uppercase italic tracking-tighter">
            Zodiac <span style={{ color: COLORS.primary }}>Signs</span>
          </h1>
          <p style={{ color: COLORS.neutralGray }} className="text-[10px] font-bold uppercase tracking-widest mt-2 opacity-50">
            Manage Zodiac Signs and Their Properties
          </p>
        </div>
        <div className="flex items-center gap-4 text-white/10 font-black text-[9px] uppercase tracking-widest">
          <span>Total Signs: {zodiacSigns.length}</span>
        </div>
      </div>

      {/* Controls Container */}
      <div
        className="p-6 rounded-[32px] border border-white/5 mb-10 flex flex-wrap items-end gap-10 shadow-2xl backdrop-blur-sm"
        style={{ backgroundColor: `${COLORS.surface}80` }}
      >
        <div className="flex-1 min-w-[300px]">
          <label className="block text-[9px] font-black uppercase text-white/20 mb-3 ml-1 tracking-widest">
            Search Signs
          </label>
          <PrimaryInput
            fullWidth
            placeholder="Search by name, element, or ruling planet..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            iconLeft={<Icon icon="solar:magnifer-linear" className="text-xl opacity-20" />}
          />
        </div>

        <button
          onClick={() => {
            setSelectedSign(null);
            setIsModalOpen(true);
          }}
          className="h-[52px] px-12 rounded-2xl font-black uppercase text-[10px] tracking-[0.3em] transition-all hover:scale-[1.02] active:scale-95 shadow-xl group"
          style={{
            backgroundColor: COLORS.primary,
            color: COLORS.dark,
            fontFamily: TYPOGRAPHY.fontFamily.heading,
          }}
        >
          <span className="flex items-center gap-2">
            Add Zodiac Sign
            <Icon icon="solar:add-circle-bold" className="text-lg group-hover:rotate-90 transition-transform" />
          </span>
        </button>
      </div>

      {/* Main Table */}
      <div className="rounded-[32px] overflow-hidden border border-white/5 bg-transparent shadow-[0_30px_60px_rgba(0,0,0,0.4)]">
        <PrimaryTable
          title="ZODIAC SIGNS"
          data={filteredSigns}
          columns={columns}
          searchEnabled={false}
          actionsColumn={(sign) => (
            <div className="flex items-center justify-end gap-1 pr-4">
              <button
                className="p-3 rounded-xl text-white/20 hover:text-primary hover:bg-primary/5 transition-all"
                onClick={() => {
                  setSelectedSign(sign);
                  setIsModalOpen(true);
                }}
                title="Edit"
              >
                <Icon icon="solar:pen-new-round-bold-duotone" className="text-lg" />
              </button>
              <button
                className="p-3 rounded-xl text-white/20 hover:text-starGold hover:bg-starGold/5 transition-all"
                onClick={() => {
                  setSignToDelete(sign);
                  setIsDeleteModalOpen(true);
                }}
                title="Delete"
              >
                <Icon icon="solar:trash-bin-trash-bold-duotone" className="text-lg" />
              </button>
            </div>
          )}
        />
      </div>

      {/* Modals */}
      <ZodiacSignModal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setSelectedSign(null);
        }}
        onSave={handleSave}
        initialData={selectedSign}
      />

      <DeleteModal
        isOpen={isDeleteModalOpen}
        onClose={() => {
          setIsDeleteModalOpen(false);
          setSignToDelete(null);
        }}
        onConfirm={handleConfirmDelete}
        title="Delete Zodiac Sign"
        itemName={signToDelete?.name}
        description="Are you sure you want to delete this zodiac sign? This action cannot be undone."
      />
    </div>
  );
};

export default ZodiacSigns;
