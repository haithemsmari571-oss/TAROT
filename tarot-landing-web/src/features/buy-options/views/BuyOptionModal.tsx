import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Icon } from "@iconify/react";
import PrimaryInput from "../../../components/CustomInputs/PrimaryInput";
import { COLORS } from "../../../theme";
import type { BuyOption, BuyOptionCreate, BuyOptionUpdate } from "../types/buyOptions.types";

interface BuyOptionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: BuyOptionCreate | BuyOptionUpdate) => void;
  initialData: BuyOption | null;
}

const BuyOptionModal = ({ isOpen, onClose, onSave, initialData }: BuyOptionModalProps) => {
  const [label, setLabel] = useState("");
  const [points, setPoints] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [sortOrder, setSortOrder] = useState("0");

  useEffect(() => {
    if (initialData) {
      setLabel(initialData.label);
      setPoints(initialData.points.toString());
      setIsActive(initialData.is_active);
      setSortOrder(initialData.sort_order.toString());
    } else {
      setLabel("");
      setPoints("");
      setIsActive(true);
      setSortOrder("0");
    }
  }, [initialData, isOpen]);

  const isFormValid = label.trim() && points.trim() && parseInt(points) > 0;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isFormValid) return;

    const data = {
      label: label.trim(),
      points: parseInt(points),
      is_active: isActive,
      sort_order: parseInt(sortOrder) || 0,
    };

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
                  <span style={{ color: COLORS.primary }}>Buy Option</span>
                </h2>
                <p className="text-[9px] font-bold uppercase tracking-widest mt-2" style={{ color: COLORS.neutralGray }}>
                  {initialData ? "Update package configuration" : "Create a new point package"}
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
                  Label
                </label>
                <PrimaryInput
                  fullWidth
                  placeholder="e.g. Starter, Basic, Popular"
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-[9px] font-black uppercase text-white/30 mb-3 ml-1 tracking-widest">
                  Points
                </label>
                <PrimaryInput
                  fullWidth
                  type="number"
                  placeholder="e.g. 100"
                  value={points}
                  onChange={(e) => setPoints(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-[9px] font-black uppercase text-white/30 mb-3 ml-1 tracking-widest">
                  Sort Order
                </label>
                <PrimaryInput
                  fullWidth
                  type="number"
                  placeholder="0"
                  value={sortOrder}
                  onChange={(e) => setSortOrder(e.target.value)}
                />
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setIsActive(!isActive)}
                  className="relative w-12 h-7 rounded-full transition-all"
                  style={{
                    backgroundColor: isActive ? COLORS.primary : `${COLORS.neutralGray}40`,
                  }}
                >
                  <motion.div
                    className="absolute top-1 w-5 h-5 rounded-full bg-white shadow"
                    animate={{ x: isActive ? 26 : 2 }}
                    transition={{ type: "spring", stiffness: 500, damping: 30 }}
                  />
                </button>
                <span className="text-[10px] font-black uppercase tracking-widest text-white/60">
                  {isActive ? "Active" : "Inactive"}
                </span>
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
                  {initialData ? "Save Changes" : "Create Option"}
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

export default BuyOptionModal;
