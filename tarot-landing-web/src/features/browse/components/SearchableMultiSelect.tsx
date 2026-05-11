import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Icon } from "@iconify/react";
import { COLORS, TYPOGRAPHY } from "../../../theme";

interface Option {
  id: number;
  title: string;
}

interface SearchableMultiSelectProps {
  options: Option[];
  selectedIds: number[];
  onChange: (selectedIds: number[]) => void;
  placeholder?: string;
  label?: string;
}

export const SearchableMultiSelect = ({
  options,
  selectedIds,
  onChange,
  placeholder = "Select options...",
  label = "Categories",
}: SearchableMultiSelectProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filteredOptions = options.filter((option) =>
    option.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const selectedOptions = options.filter((option) => selectedIds.includes(option.id));

  const toggleOption = (id: number) => {
    if (selectedIds.includes(id)) {
      onChange(selectedIds.filter((selectedId) => selectedId !== id));
    } else {
      onChange([...selectedIds, id]);
    }
  };

  const clearAll = () => {
    onChange([]);
    setSearchQuery("");
  };

  return (
    <div ref={dropdownRef} className="relative">
      {/* Label */}
      {label && (
        <label className="block text-xs font-bold uppercase tracking-widest mb-2" style={{ color: COLORS.neutralWhite + "80" }}>
          {label}
        </label>
      )}

      {/* Trigger Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-4 py-3 rounded-xl border flex items-center justify-between"
        style={{
          backgroundColor: COLORS.surface,
          borderColor: isOpen ? COLORS.primary : `${COLORS.neutralWhite}10`,
          fontFamily: TYPOGRAPHY.fontFamily.body,
        }}
      >
        <div className="flex items-center gap-2 flex-wrap flex-1">
          {selectedOptions.length > 0 ? (
            selectedOptions.map((option) => (
              <span
                key={option.id}
                className="px-2 py-1 rounded-lg text-xs font-bold flex items-center gap-1"
                style={{
                  backgroundColor: COLORS.primary + "20",
                  color: COLORS.primary,
                  border: `1px solid ${COLORS.primary}40`,
                }}
              >
                {option.title}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleOption(option.id);
                  }}
                  className="hover:opacity-70"
                >
                  <Icon icon="ph:x" className="text-xs" />
                </button>
              </span>
            ))
          ) : (
            <span className="text-sm opacity-40" style={{ color: COLORS.neutralWhite }}>
              {placeholder}
            </span>
          )}
        </div>
        <Icon
          icon={isOpen ? "ph:caret-up" : "ph:caret-down"}
          className="text-lg ml-2"
          style={{ color: COLORS.neutralWhite + "60" }}
        />
      </button>

      {/* Dropdown */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
            className="absolute z-50 w-full mt-2 rounded-xl border overflow-hidden"
            style={{
              backgroundColor: COLORS.surface,
              borderColor: `${COLORS.neutralWhite}10`,
              boxShadow: "0 10px 40px rgba(0,0,0,0.5)",
            }}
          >
            {/* Search Input */}
            <div className="p-3 border-b" style={{ borderColor: `${COLORS.neutralWhite}10` }}>
              <div className="relative">
                <Icon
                  icon="ph:magnifying-glass"
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-base"
                  style={{ color: COLORS.neutralWhite + "40" }}
                />
                <input
                  type="text"
                  placeholder="Search..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-3 py-2 rounded-lg bg-transparent text-sm outline-none border"
                  style={{
                    color: COLORS.neutralWhite,
                    borderColor: `${COLORS.neutralWhite}10`,
                    fontFamily: TYPOGRAPHY.fontFamily.body,
                  }}
                  onClick={(e) => e.stopPropagation()}
                />
              </div>
            </div>

            {/* Options List */}
            <div className="max-h-60 overflow-y-auto">
              {filteredOptions.length > 0 ? (
                filteredOptions.map((option) => {
                  const isSelected = selectedIds.includes(option.id);
                  return (
                    <button
                      key={option.id}
                      onClick={() => toggleOption(option.id)}
                      className="w-full px-4 py-3 flex items-center justify-between hover:bg-white/5 transition-colors text-left"
                    >
                      <span className="text-sm font-medium" style={{ color: COLORS.neutralWhite }}>
                        {option.title}
                      </span>
                      {isSelected && (
                        <Icon icon="ph:check-circle-fill" className="text-lg" style={{ color: COLORS.primary }} />
                      )}
                    </button>
                  );
                })
              ) : (
                <div className="px-4 py-8 text-center">
                  <Icon icon="ph:magnifying-glass" className="text-4xl mb-2 mx-auto opacity-20" style={{ color: COLORS.neutralWhite }} />
                  <p className="text-sm opacity-40" style={{ color: COLORS.neutralWhite }}>
                    No options found
                  </p>
                </div>
              )}
            </div>

            {/* Footer Actions */}
            {selectedOptions.length > 0 && (
              <div className="p-3 border-t" style={{ borderColor: `${COLORS.neutralWhite}10` }}>
                <button
                  onClick={clearAll}
                  className="w-full py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-colors"
                  style={{
                    backgroundColor: `${COLORS.neutralWhite}05`,
                    color: COLORS.primary,
                    border: `1px solid ${COLORS.primary}40`,
                  }}
                >
                  Clear All ({selectedOptions.length})
                </button>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
