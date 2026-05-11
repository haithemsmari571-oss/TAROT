import { useState, useEffect, useMemo } from "react";
import { Icon } from "@iconify/react";
import { PrimaryTable, type Column } from "../../../components/Table/PrimaryTable";
import DeleteModal from "../../../components/modals/DeleteModal";
import PrimaryInput from "../../../components/CustomInputs/PrimaryInput";
import { COLORS, TYPOGRAPHY } from "../../../theme";
import { buyOptionsApi } from "../api/buyOptionsApi";
import type { BuyOption, BuyOptionCreate, BuyOptionUpdate } from "../types/buyOptions.types";
import { useToast } from "../../../components/Toast";
import BuyOptionModal from "./BuyOptionModal";

const BuyOptions = () => {
  const [options, setOptions] = useState<BuyOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedOption, setSelectedOption] = useState<BuyOption | null>(null);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [optionToDelete, setOptionToDelete] = useState<BuyOption | null>(null);
  const [search, setSearch] = useState("");

  const toast = useToast();

  useEffect(() => {
    fetchOptions();
  }, []);

  const fetchOptions = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await buyOptionsApi.getBuyOptions();
      setOptions(data);
    } catch (err: any) {
      const errorMessage = err.response?.data?.message || err.response?.data?.detail || err.message || "Failed to load buy options.";
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const filteredOptions = useMemo(() => {
    return options.filter((opt) => {
      const q = search.toLowerCase();
      return opt.label.toLowerCase().includes(q) || opt.points.toString().includes(q);
    });
  }, [options, search]);

  const handleSave = async (data: BuyOptionCreate | BuyOptionUpdate) => {
    try {
      setLoading(true);
      if (selectedOption) {
        const updated = await buyOptionsApi.updateBuyOption(selectedOption.id, data as BuyOptionUpdate);
        setOptions(options.map((o) => (o.id === selectedOption.id ? updated : o)));
        toast.success("Buy option updated successfully!");
      } else {
        const created = await buyOptionsApi.createBuyOption(data as BuyOptionCreate);
        setOptions([created, ...options]);
        toast.success("Buy option created successfully!");
      }
      setIsModalOpen(false);
      setSelectedOption(null);
    } catch (err: any) {
      const errorMessage = err.response?.data?.message || err.response?.data?.detail || err.message || "Unknown error";
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!optionToDelete) return;
    try {
      setLoading(true);
      await buyOptionsApi.deleteBuyOption(optionToDelete.id);
      setOptions((prev) => prev.filter((o) => o.id !== optionToDelete.id));
      toast.success("Buy option deleted successfully!");
      setIsDeleteModalOpen(false);
      setOptionToDelete(null);
    } catch (err: any) {
      const errorMessage = err.response?.data?.message || err.response?.data?.detail || err.message || "Unknown error";
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const columns: Column<BuyOption>[] = [
    {
      key: "label",
      label: "Label",
      sortable: true,
      render: (opt) => (
        <div className="flex items-center gap-4">
          <div
            className="w-12 h-12 rounded-2xl flex items-center justify-center font-black text-sm border-2 transition-all hover:scale-110"
            style={{
              backgroundColor: `${COLORS.primary}15`,
              borderColor: `${COLORS.primary}40`,
              color: COLORS.primary,
            }}
          >
            {opt.label.substring(0, 2).toUpperCase()}
          </div>
          <div className="flex flex-col">
            <span className="text-white font-bold leading-tight text-sm">
              {opt.label}
            </span>
            <span
              style={{ color: COLORS.neutralGray, fontSize: "9px" }}
              className="uppercase font-black tracking-widest opacity-40"
            >
              Sort Order: {opt.sort_order}
            </span>
          </div>
        </div>
      ),
    },
    {
      key: "points",
      label: "Points",
      sortable: true,
      render: (opt) => (
        <span className="text-white font-black text-lg tracking-tight">
          {opt.points.toLocaleString()}
        </span>
      ),
    },
    {
      key: "is_active",
      label: "Status",
      render: (opt) => (
        <div className="flex items-center gap-2">
          <div
            className="w-2 h-2 rounded-full"
            style={{
              backgroundColor: opt.is_active ? "#4ADE80" : "#F87171",
              boxShadow: `0 0 8px ${opt.is_active ? "#4ADE80" : "#F87171"}`,
            }}
          />
          <span
            className="text-[10px] font-black uppercase tracking-widest"
            style={{ color: opt.is_active ? "#4ADE80" : "#F87171" }}
          >
            {opt.is_active ? "Active" : "Inactive"}
          </span>
        </div>
      ),
    },
  ];

  if (loading && options.length === 0) {
    return (
      <div className="p-12 min-h-screen flex items-center justify-center" style={{ backgroundColor: COLORS.dark }}>
        <div className="flex flex-col items-center gap-4">
          <Icon icon="svg-spinners:3-dots-fade" className="text-5xl" style={{ color: COLORS.primary }} />
          <span className="text-white/60 font-bold uppercase tracking-widest text-sm">Loading Buy Options...</span>
        </div>
      </div>
    );
  }

  if (error && options.length === 0) {
    return (
      <div className="p-12 min-h-screen flex items-center justify-center" style={{ backgroundColor: COLORS.dark }}>
        <div className="flex flex-col items-center gap-4 max-w-md">
          <Icon icon="solar:danger-circle-bold-duotone" className="text-5xl" style={{ color: COLORS.starGold }} />
          <span className="text-white font-bold text-lg">{error}</span>
          <button
            onClick={fetchOptions}
            className="px-6 py-3 rounded-xl font-bold uppercase text-xs tracking-wider hover:scale-105 transition-transform"
            style={{ backgroundColor: COLORS.primary, color: COLORS.dark }}
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-12 min-h-screen" style={{ backgroundColor: COLORS.dark, fontFamily: TYPOGRAPHY.fontFamily.body }}>
      <div className="mb-12 flex justify-between items-end">
        <div>
          <h1 className="text-4xl md:text-5xl font-black uppercase italic tracking-tighter" style={TYPOGRAPHY.headings.h2}>
            Buy <span style={{ color: COLORS.primary }}>Options</span>
          </h1>
          <p style={{ color: COLORS.neutralGray }} className="text-[10px] font-bold uppercase tracking-widest mt-2 opacity-50">
            Manage Point Package Options for Users
          </p>
        </div>
        <div className="flex items-center gap-4 text-white/10 font-black text-[9px] uppercase tracking-widest">
          <span>Total: {options.length}</span>
        </div>
      </div>

      <div
        className="p-6 rounded-[32px] border border-white/5 mb-10 flex flex-wrap items-end gap-10 shadow-2xl backdrop-blur-sm"
        style={{ backgroundColor: `${COLORS.surface}80` }}
      >
        <div className="flex-1 min-w-[300px]">
          <label className="block text-[9px] font-black uppercase text-white/20 mb-3 ml-1 tracking-widest">
            Search Options
          </label>
          <PrimaryInput
            fullWidth
            placeholder="Search by label or points..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            iconLeft={<Icon icon="solar:magnifer-linear" className="text-xl opacity-20" />}
          />
        </div>

        <button
          onClick={() => {
            setSelectedOption(null);
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
            Add Buy Option
            <Icon icon="solar:add-circle-bold" className="text-lg group-hover:rotate-90 transition-transform" />
          </span>
        </button>
      </div>

      <div className="rounded-[32px] overflow-hidden border border-white/5 bg-transparent shadow-[0_30px_60px_rgba(0,0,0,0.4)]">
        <PrimaryTable
          title="BUY OPTIONS"
          data={filteredOptions}
          columns={columns}
          searchEnabled={false}
          actionsColumn={(opt) => (
            <div className="flex items-center justify-end gap-1 pr-4">
              <button
                className="p-3 rounded-xl text-white/20 hover:text-primary hover:bg-primary/5 transition-all"
                onClick={() => {
                  setSelectedOption(opt);
                  setIsModalOpen(true);
                }}
                title="Edit"
              >
                <Icon icon="solar:pen-new-round-bold-duotone" className="text-lg" />
              </button>
              <button
                className="p-3 rounded-xl text-white/20 hover:text-starGold hover:bg-starGold/5 transition-all"
                onClick={() => {
                  setOptionToDelete(opt);
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

      <BuyOptionModal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setSelectedOption(null);
        }}
        onSave={handleSave}
        initialData={selectedOption}
      />

      <DeleteModal
        isOpen={isDeleteModalOpen}
        onClose={() => {
          setIsDeleteModalOpen(false);
          setOptionToDelete(null);
        }}
        onConfirm={handleConfirmDelete}
        title="Delete Buy Option"
        itemName={optionToDelete?.label}
        description="Are you sure you want to delete this buy option? This action cannot be undone."
      />
    </div>
  );
};

export default BuyOptions;
