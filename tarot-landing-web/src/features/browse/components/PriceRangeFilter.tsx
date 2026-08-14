import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import "../../../styles/glass.css";

interface PriceRangeFilterProps {
  minPrice?: number;
  maxPrice?: number;
  onChange: (min?: number, max?: number) => void;
  label?: string;
}

export const PriceRangeFilter = ({
  minPrice,
  maxPrice,
  onChange,
  label = "Price range",
}: PriceRangeFilterProps) => {
  const [localMin, setLocalMin] = useState(minPrice?.toString() || "");
  const [localMax, setLocalMax] = useState(maxPrice?.toString() || "");
  const [isOpen, setIsOpen] = useState(false);
  const popRef = useRef<HTMLDivElement>(null);

  // Update local state when props change
  useEffect(() => {
    setLocalMin(minPrice?.toString() || "");
    setLocalMax(maxPrice?.toString() || "");
  }, [minPrice, maxPrice]);

  // Close popover when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (popRef.current && !popRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleApply = () => {
    const min = localMin ? parseFloat(localMin) : undefined;
    const max = localMax ? parseFloat(localMax) : undefined;
    onChange(min, max);
    setIsOpen(false);
  };

  const handleClear = () => {
    setLocalMin("");
    setLocalMax("");
    onChange(undefined, undefined);
  };

  const hasApplied = minPrice !== undefined || maxPrice !== undefined;

  const chipLabel = !hasApplied
    ? "Any price"
    : minPrice !== undefined && maxPrice !== undefined
      ? `£${minPrice}–£${maxPrice}/min`
      : minPrice !== undefined
        ? `From £${minPrice}/min`
        : `Up to £${maxPrice}/min`;

  return (
    <div ref={popRef} className="relative">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`gl-fchip ${isOpen || hasApplied ? "gl-fchip--on" : ""}`}
        title={label}
      >
        {chipLabel} ▾
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
            className="gl-pop p-4"
          >
            <div className="gl-count text-left" style={{ padding: "0 0 12px" }}>
              Price per minute
            </div>

            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <span className="gl-tf absolute left-3 top-1/2 -translate-y-1/2 text-sm">£</span>
                <input
                  type="number"
                  placeholder="Min"
                  value={localMin}
                  onChange={(e) => setLocalMin(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      handleApply();
                    }
                  }}
                  className="gl-pop-input pl-7 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  min="0"
                  step="0.01"
                />
              </div>

              <span className="gl-tf text-sm">—</span>

              <div className="relative flex-1">
                <span className="gl-tf absolute left-3 top-1/2 -translate-y-1/2 text-sm">£</span>
                <input
                  type="number"
                  placeholder="Max"
                  value={localMax}
                  onChange={(e) => setLocalMax(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      handleApply();
                    }
                  }}
                  className="gl-pop-input pl-7 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  min="0"
                  step="0.01"
                />
              </div>
            </div>

            <div className="flex items-center gap-2 mt-3">
              <button type="button" onClick={handleApply} className="gl-search-btn flex-1" style={{ padding: "10px 0" }}>
                Apply
              </button>
              {(localMin || localMax) && (
                <button type="button" onClick={handleClear} className="gl-fchip justify-center" style={{ padding: "9px 18px" }}>
                  Clear
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
