import React, { useState, useEffect, useMemo } from "react";
import { Icon } from "@iconify/react";
import { PrimaryTable, type Column } from "../../../components/Table/PrimaryTable";
import DeleteModal from "../../../components/modals/DeleteModal";
import PrimaryInput from "../../../components/CustomInputs/PrimaryInput";
import { COLORS, TYPOGRAPHY } from "../../../theme";
import { lifepathApi } from "../api/lifepathApi";
import type { LifePathNumber } from "../types/lifepath.types";
import { useToast } from "../../../components/Toast";
import LifePathModal from "../../../components/modals/LifePathModal";

const LifePathNumbers = () => {
  const [lifePathNumbers, setLifePathNumbers] = useState<LifePathNumber[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedLifePath, setSelectedLifePath] = useState<LifePathNumber | null>(null);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [lifePathToDelete, setLifePathToDelete] = useState<LifePathNumber | null>(null);
  const [search, setSearch] = useState("");

  const toast = useToast();

  // Fetch life path numbers on mount
  useEffect(() => {
    fetchLifePathNumbers();
  }, []);

  const fetchLifePathNumbers = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await lifepathApi.getLifePathNumbers();
      setLifePathNumbers(data);
    } catch (err: any) {
      console.error("Error fetching life path numbers:", err);
      const errorMessage = err.response?.data?.message || err.response?.data?.detail || err.message || "Failed to load life path numbers. Please try again.";
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const filteredLifePaths = useMemo(() => {
    return lifePathNumbers.filter((lp) => {
      const matchesSearch =
        lp.number.toString().includes(search) ||
        lp.title.toLowerCase().includes(search.toLowerCase()) ||
        lp.description.toLowerCase().includes(search.toLowerCase());
      return matchesSearch;
    });
  }, [lifePathNumbers, search]);

  const handleSave = async (lifePathData: any) => {
    try {
      setLoading(true);
      
      if (selectedLifePath) {
        // Update existing life path
        const updated = await lifepathApi.updateLifePathNumber(selectedLifePath.id, lifePathData);
        setLifePathNumbers(lifePathNumbers.map((lp) => (lp.id === selectedLifePath.id ? updated : lp)));
        toast.success("Life path number updated successfully!");
      } else {
        // Create new life path
        const created = await lifepathApi.createLifePathNumber(lifePathData);
        setLifePathNumbers([created, ...lifePathNumbers]);
        toast.success("Life path number created successfully!");
      }
      
      setIsModalOpen(false);
      setSelectedLifePath(null);
    } catch (err: any) {
      console.error("Error saving life path number:", err);
      const errorMessage = err.response?.data?.message || err.response?.data?.detail || err.message || "Unknown error";
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!lifePathToDelete) return;
    
    try {
      setLoading(true);
      await lifepathApi.deleteLifePathNumber(lifePathToDelete.id);
      setLifePathNumbers((prev) => prev.filter((lp) => lp.id !== lifePathToDelete.id));
      toast.success("Life path number deleted successfully!");
      setIsDeleteModalOpen(false);
      setLifePathToDelete(null);
    } catch (err: any) {
      console.error("Error deleting life path number:", err);
      const errorMessage = err.response?.data?.message || err.response?.data?.detail || err.message || "Unknown error";
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const getNumberColor = (number: number) => {
    // Master numbers get special colors
    if ([11, 22, 33].includes(number)) return COLORS.starGold;
    // Regular numbers get the primary color
    return COLORS.primary;
  };

  const columns: Column<LifePathNumber>[] = [
    {
      key: "number",
      label: "Life Path",
      sortable: true,
      render: (lp) => (
        <div className="flex items-center gap-4">
          <div
            className="w-12 h-12 rounded-2xl flex items-center justify-center font-black text-xl border-2 transition-all hover:scale-110"
            style={{
              backgroundColor: `${getNumberColor(lp.number)}15`,
              borderColor: `${getNumberColor(lp.number)}40`,
              color: getNumberColor(lp.number),
            }}
          >
            {lp.number}
          </div>
          <div className="flex flex-col">
            <span className="text-white font-bold leading-tight" style={{ fontSize: TYPOGRAPHY.fontSize.sm }}>
              {lp.title}
            </span>
            <span
              style={{ color: COLORS.neutralGray, fontSize: "9px" }}
              className="uppercase font-black tracking-widest opacity-40"
            >
              Life Path {lp.number}
            </span>
          </div>
        </div>
      ),
    },
    {
      key: "core_strengths",
      label: "Core Strengths",
      render: (lp) => (
        <div className="flex flex-col gap-1">
          {lp.core_strengths.strengths.slice(0, 2).map((strength, idx) => (
            <div key={idx} className="flex items-center gap-2">
              <Icon icon="solar:star-bold-duotone" className="text-primary text-xs" />
              <span className="text-[10px] font-bold text-white/80">{strength}</span>
            </div>
          ))}
          {lp.core_strengths.strengths.length > 2 && (
            <span className="text-[9px] text-white/30 italic ml-5">
              +{lp.core_strengths.strengths.length - 2} more
            </span>
          )}
        </div>
      ),
    },
    {
      key: "growth_areas",
      label: "Growth Areas",
      render: (lp) => (
        <div className="flex flex-col gap-1">
          {lp.growth_areas.areas.slice(0, 2).map((area, idx) => (
            <div key={idx} className="flex items-center gap-2">
              <Icon icon="solar:arrow-up-bold-duotone" className="text-starGold text-xs" />
              <span className="text-[10px] font-bold text-white/70">{area}</span>
            </div>
          ))}
          {lp.growth_areas.areas.length > 2 && (
            <span className="text-[9px] text-white/30 italic ml-5">
              +{lp.growth_areas.areas.length - 2} more
            </span>
          )}
        </div>
      ),
    },
    {
      key: "description",
      label: "Description",
      render: (lp) => (
        <div className="max-w-xs">
          <p className="text-[10px] text-white/60 line-clamp-2">{lp.description}</p>
        </div>
      ),
    },
  ];

  if (loading && lifePathNumbers.length === 0) {
    return (
      <div className="p-12 min-h-screen flex items-center justify-center" style={{ backgroundColor: COLORS.dark }}>
        <div className="flex flex-col items-center gap-4">
          <Icon icon="solar:calculator-bold-duotone" className="text-5xl text-primary animate-spin" />
          <span className="text-white/60 font-bold uppercase tracking-widest text-sm">Loading Life Path Numbers...</span>
        </div>
      </div>
    );
  }

  if (error && lifePathNumbers.length === 0) {
    return (
      <div className="p-12 min-h-screen flex items-center justify-center" style={{ backgroundColor: COLORS.dark }}>
        <div className="flex flex-col items-center gap-4 max-w-md">
          <Icon icon="solar:danger-circle-bold-duotone" className="text-5xl text-starGold" />
          <span className="text-white font-bold text-lg">{error}</span>
          <button
            onClick={fetchLifePathNumbers}
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
            Life Path <span style={{ color: COLORS.primary }}>Numbers</span>
          </h1>
          <p style={{ color: COLORS.neutralGray }} className="text-[10px] font-bold uppercase tracking-widest mt-2 opacity-50">
            Manage Life Path Numbers and Their Meanings
          </p>
        </div>
        <div className="flex items-center gap-4 text-white/10 font-black text-[9px] uppercase tracking-widest">
          <span>Total Numbers: {lifePathNumbers.length}</span>
        </div>
      </div>

      {/* Controls Container */}
      <div
        className="p-6 rounded-[32px] border border-white/5 mb-10 flex flex-wrap items-end gap-10 shadow-2xl backdrop-blur-sm"
        style={{ backgroundColor: `${COLORS.surface}80` }}
      >
        <div className="flex-1 min-w-[300px]">
          <label className="block text-[9px] font-black uppercase text-white/20 mb-3 ml-1 tracking-widest">
            Search Life Paths
          </label>
          <PrimaryInput
            fullWidth
            placeholder="Search by number, title, or description..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            iconLeft={<Icon icon="solar:magnifer-linear" className="text-xl opacity-20" />}
          />
        </div>

        <button
          onClick={() => {
            setSelectedLifePath(null);
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
            Add Life Path
            <Icon icon="solar:add-circle-bold" className="text-lg group-hover:rotate-90 transition-transform" />
          </span>
        </button>
      </div>

      {/* Main Table */}
      <div className="rounded-[32px] overflow-hidden border border-white/5 bg-transparent shadow-[0_30px_60px_rgba(0,0,0,0.4)]">
        <PrimaryTable
          title="LIFE PATH NUMBERS"
          data={filteredLifePaths}
          columns={columns}
          searchEnabled={false}
          actionsColumn={(lp) => (
            <div className="flex items-center justify-end gap-1 pr-4">
              <button
                className="p-3 rounded-xl text-white/20 hover:text-primary hover:bg-primary/5 transition-all"
                onClick={() => {
                  setSelectedLifePath(lp);
                  setIsModalOpen(true);
                }}
                title="Edit"
              >
                <Icon icon="solar:pen-new-round-bold-duotone" className="text-lg" />
              </button>
              <button
                className="p-3 rounded-xl text-white/20 hover:text-starGold hover:bg-starGold/5 transition-all"
                onClick={() => {
                  setLifePathToDelete(lp);
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
      <LifePathModal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setSelectedLifePath(null);
        }}
        onSave={handleSave}
        initialData={selectedLifePath}
      />

      <DeleteModal
        isOpen={isDeleteModalOpen}
        onClose={() => {
          setIsDeleteModalOpen(false);
          setLifePathToDelete(null);
        }}
        onConfirm={handleConfirmDelete}
        title="Delete Life Path Number"
        itemName={lifePathToDelete ? `Life Path ${lifePathToDelete.number}` : undefined}
        description="Are you sure you want to delete this life path number? This action cannot be undone."
      />
    </div>
  );
};

export default LifePathNumbers;
