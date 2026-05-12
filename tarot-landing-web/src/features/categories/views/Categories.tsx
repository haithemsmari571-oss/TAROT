import { useState, useEffect, useMemo } from "react";
import { Icon } from "@iconify/react";
import { PrimaryTable, type Column } from "../../../components/Table/PrimaryTable";
import DeleteModal from "../../../components/modals/DeleteModal";
import PrimaryInput from "../../../components/CustomInputs/PrimaryInput";
import { COLORS, TYPOGRAPHY } from "../../../theme";
import { categoriesApi } from "../api/categoriesApi";
import type { Category, CategoryCreate, CategoryUpdate } from "../types/categories.types";
import { useToast } from "../../../components/Toast";
import CategoryModal from "./CategoryModal";

const Categories = () => {
  const [items, setItems] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<Category | null>(null);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<Category | null>(null);
  const [search, setSearch] = useState("");

  const toast = useToast();

  useEffect(() => {
    fetchItems();
  }, []);

  const fetchItems = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await categoriesApi.getCategories();
      setItems(data);
    } catch (err: any) {
      const errorMessage = err.response?.data?.message || err.response?.data?.detail || err.message || "Failed to load categories.";
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      const q = search.toLowerCase();
      return item.title.toLowerCase().includes(q);
    });
  }, [items, search]);

  const handleSave = async (data: CategoryCreate | CategoryUpdate) => {
    try {
      setLoading(true);
      if (selectedItem) {
        const updated = await categoriesApi.updateCategory(selectedItem.id, data as CategoryUpdate);
        setItems(items.map((o) => (o.id === selectedItem.id ? updated : o)));
        toast.success("Category updated successfully!");
      } else {
        const created = await categoriesApi.createCategory(data as CategoryCreate);
        setItems([created, ...items]);
        toast.success("Category created successfully!");
      }
      setIsModalOpen(false);
      setSelectedItem(null);
    } catch (err: any) {
      const errorMessage = err.response?.data?.message || err.response?.data?.detail || err.message || "Unknown error";
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!itemToDelete) return;
    try {
      setLoading(true);
      await categoriesApi.deleteCategory(itemToDelete.id);
      setItems((prev) => prev.filter((o) => o.id !== itemToDelete.id));
      toast.success("Category deleted successfully!");
      setIsDeleteModalOpen(false);
      setItemToDelete(null);
    } catch (err: any) {
      const errorMessage = err.response?.data?.message || err.response?.data?.detail || err.message || "Unknown error";
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const columns: Column<Category>[] = [
    {
      key: "title",
      label: "Category Title",
      sortable: true,
      render: (item) => (
        <div className="flex items-center gap-4">
          <div
            className="w-12 h-12 rounded-2xl flex items-center justify-center font-black text-sm border-2 transition-all hover:scale-110"
            style={{
              backgroundColor: `${COLORS.primary}15`,
              borderColor: `${COLORS.primary}40`,
              color: COLORS.primary,
            }}
          >
            {item.title.substring(0, 2).toUpperCase()}
          </div>
          <div className="flex flex-col">
            <span className="text-white font-bold leading-tight text-sm">
              {item.title}
            </span>
            <span
              style={{ color: COLORS.neutralGray, fontSize: "9px" }}
              className="uppercase font-black tracking-widest opacity-40"
            >
              ID: {item.id}
            </span>
          </div>
        </div>
      ),
    },
  ];

  if (loading && items.length === 0) {
    return (
      <div className="p-12 min-h-screen flex items-center justify-center" style={{ backgroundColor: COLORS.dark }}>
        <div className="flex flex-col items-center gap-4">
          <Icon icon="svg-spinners:3-dots-fade" className="text-5xl" style={{ color: COLORS.primary }} />
          <span className="text-white/60 font-bold uppercase tracking-widest text-sm">Loading Categories...</span>
        </div>
      </div>
    );
  }

  if (error && items.length === 0) {
    return (
      <div className="p-12 min-h-screen flex items-center justify-center" style={{ backgroundColor: COLORS.dark }}>
        <div className="flex flex-col items-center gap-4 max-w-md">
          <Icon icon="solar:danger-circle-bold-duotone" className="text-5xl" style={{ color: COLORS.starGold }} />
          <span className="text-white font-bold text-lg">{error}</span>
          <button
            onClick={fetchItems}
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
            <span style={{ color: COLORS.primary }}>Categories</span>
          </h1>
          <p style={{ color: COLORS.neutralGray }} className="text-[10px] font-bold uppercase tracking-widest mt-2 opacity-50">
            Manage Psychic Categories
          </p>
        </div>
        <div className="flex items-center gap-4 text-white/10 font-black text-[9px] uppercase tracking-widest">
          <span>Total: {items.length}</span>
        </div>
      </div>

      <div
        className="p-6 rounded-[32px] border border-white/5 mb-10 flex flex-wrap items-end gap-10 shadow-2xl backdrop-blur-sm"
        style={{ backgroundColor: `${COLORS.surface}80` }}
      >
        <div className="flex-1 min-w-[300px]">
          <label className="block text-[9px] font-black uppercase text-white/20 mb-3 ml-1 tracking-widest">
            Search Categories
          </label>
          <PrimaryInput
            fullWidth
            placeholder="Search by title..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            iconLeft={<Icon icon="solar:magnifer-linear" className="text-xl opacity-20" />}
          />
        </div>

        <button
          onClick={() => {
            setSelectedItem(null);
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
            Add Category
            <Icon icon="solar:add-circle-bold" className="text-lg group-hover:rotate-90 transition-transform" />
          </span>
        </button>
      </div>

      <div className="rounded-[32px] overflow-hidden border border-white/5 bg-transparent shadow-[0_30px_60px_rgba(0,0,0,0.4)]">
        <PrimaryTable
          title="CATEGORIES"
          data={filteredItems}
          columns={columns}
          searchEnabled={false}
          actionsColumn={(item) => (
            <div className="flex items-center justify-end gap-1 pr-4">
              <button
                className="p-3 rounded-xl text-white/20 hover:text-primary hover:bg-primary/5 transition-all"
                onClick={() => {
                  setSelectedItem(item);
                  setIsModalOpen(true);
                }}
                title="Edit"
              >
                <Icon icon="solar:pen-new-round-bold-duotone" className="text-lg" />
              </button>
              <button
                className="p-3 rounded-xl text-white/20 hover:text-starGold hover:bg-starGold/5 transition-all"
                onClick={() => {
                  setItemToDelete(item);
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

      <CategoryModal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setSelectedItem(null);
        }}
        onSave={handleSave}
        initialData={selectedItem}
      />

      <DeleteModal
        isOpen={isDeleteModalOpen}
        onClose={() => {
          setIsDeleteModalOpen(false);
          setItemToDelete(null);
        }}
        onConfirm={handleConfirmDelete}
        title="Delete Category"
        itemName={itemToDelete?.title}
        description="Are you sure you want to delete this category? It will be removed from all assigned psychics."
      />
    </div>
  );
};

export default Categories;
