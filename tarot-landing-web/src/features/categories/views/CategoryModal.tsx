import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Icon } from "@iconify/react";
import PrimaryInput from "../../../components/CustomInputs/PrimaryInput";
import { COLORS } from "../../../theme";
import type { Category, CategoryCreate, CategoryUpdate } from "../types/categories.types";

interface CategoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: CategoryCreate | CategoryUpdate) => void;
  initialData: Category | null;
}

const CategoryModal = ({ isOpen, onClose, onSave, initialData }: CategoryModalProps) => {
  const [title, setTitle] = useState("");

  useEffect(() => {
    if (initialData) {
      setTitle(initialData.title);
    } else {
      setTitle("");
    }
  }, [initialData, isOpen]);

  const isFormValid = title.trim().length > 0;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isFormValid) return;

    const data = { title: title.trim() };
    onSave(data);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: "rgba(0, 0, 0, 0.85)", backdropFilter: "blur(10px)" }}
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.8, y: 50, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.8, y: 50, opacity: 0 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="p-8 rounded-[40px] border max-w-lg w-full relative overflow-hidden"
            style={{
              backgroundColor: `${COLORS.surface}dd`,
              borderColor: `${COLORS.primary}60`,
              boxShadow: `0 30px 80px rgba(0,0,0,0.5)`,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-8">
              <div>
                <h2 className="text-3xl font-black uppercase tracking-tight text-white">
                  {initialData ? "Edit" : "Add"}{" "}
                  <span style={{ color: COLORS.primary }}>Category</span>
                </h2>
                <p className="text-[9px] font-bold uppercase tracking-widest mt-2" style={{ color: COLORS.neutralGray }}>
                  {initialData ? "Update category details" : "Create a new category"}
                </p>
              </div>
              <button
                onClick={onClose}
                className="w-10 h-10 flex items-center justify-center rounded-full bg-white/5 text-white/40 hover:text-white transition-all"
              >
                <Icon icon="ph:x-bold" className="text-xl" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <label className="block text-[9px] font-black uppercase text-white/30 mb-3 ml-1 tracking-widest">
                  Title
                </label>
                <PrimaryInput
                  fullWidth
                  placeholder="e.g. Love, Career, Tarot Reading"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </div>

              <motion.button
                type="submit"
                disabled={!isFormValid}
                className="w-full py-4 rounded-2xl font-black text-[11px] uppercase tracking-widest transition-all relative overflow-hidden group disabled:opacity-40 disabled:cursor-not-allowed"
                style={{
                  backgroundColor: COLORS.primary,
                  color: COLORS.dark,
                  boxShadow: `0 10px 40px ${COLORS.primary}40`,
                }}
                whileHover={isFormValid ? { scale: 1.02 } : {}}
                whileTap={isFormValid ? { scale: 0.98 } : {}}
              >
                <span className="relative z-10">
                  {initialData ? "Save Changes" : "Create Category"}
                </span>
                <motion.div
                  className="absolute inset-0 opacity-0 group-hover:opacity-100"
                  style={{
                    background: `linear-gradient(135deg, ${COLORS.primary} 0%, ${COLORS.secondary} 100%)`,
                  }}
                />
              </motion.button>
            </form>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default CategoryModal;
