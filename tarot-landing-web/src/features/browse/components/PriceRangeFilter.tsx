import { useState, useEffect } from "react";
import { Icon } from "@iconify/react";
import { COLORS, TYPOGRAPHY } from "../../../theme";

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
  label = "Price Range (per minute)",
}: PriceRangeFilterProps) => {
  const [localMin, setLocalMin] = useState(minPrice?.toString() || "");
  const [localMax, setLocalMax] = useState(maxPrice?.toString() || "");

  // Update local state when props change
  useEffect(() => {
    setLocalMin(minPrice?.toString() || "");
    setLocalMax(maxPrice?.toString() || "");
  }, [minPrice, maxPrice]);

  const handleApply = () => {
    const min = localMin ? parseFloat(localMin) : undefined;
    const max = localMax ? parseFloat(localMax) : undefined;
    onChange(min, max);
  };

  const handleClear = () => {
    setLocalMin("");
    setLocalMax("");
    onChange(undefined, undefined);
  };

  const hasValue = localMin || localMax;

  return (
    <div>
      {/* Label */}
      {label && (
        <label className="block text-xs font-bold uppercase tracking-widest mb-2" style={{ color: COLORS.neutralWhite + "80" }}>
          {label}
        </label>
      )}

      <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
        {/* Min Price Input */}
        <div className="flex-1 min-w-[80px]">
          <div className="relative">
            <span
              className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold"
              style={{ color: COLORS.neutralWhite + "40" }}
            >
              $
            </span>
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
              className="w-full pl-8 pr-3 py-3 rounded-xl border text-sm outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              style={{
                backgroundColor: COLORS.surface,
                borderColor: `${COLORS.neutralWhite}10`,
                color: COLORS.neutralWhite,
                fontFamily: TYPOGRAPHY.fontFamily.body,
              }}
              min="0"
              step="0.01"
            />
          </div>
        </div>

        {/* Separator */}
        <span className="text-sm font-bold" style={{ color: COLORS.neutralWhite + "40" }}>
          —
        </span>

        {/* Max Price Input */}
        <div className="flex-1">
          <div className="relative">
            <span
              className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold"
              style={{ color: COLORS.neutralWhite + "40" }}
            >
              $
            </span>
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
              className="w-full pl-8 pr-3 py-3 rounded-xl border text-sm outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              style={{
                backgroundColor: COLORS.surface,
                borderColor: `${COLORS.neutralWhite}10`,
                color: COLORS.neutralWhite,
                fontFamily: TYPOGRAPHY.fontFamily.body,
              }}
              min="0"
              step="0.01"
            />
          </div>
        </div>

        {/* Apply Button */}
        <button
          onClick={handleApply}
          className="px-4 py-3 rounded-xl text-sm font-bold transition-all"
          style={{
            backgroundColor: COLORS.primary,
            color: COLORS.dark,
          }}
        >
          <Icon icon="ph:check" className="text-lg" />
        </button>

        {/* Clear Button */}
        {hasValue && (
          <button
            onClick={handleClear}
            className="px-4 py-3 rounded-xl text-sm font-bold transition-all"
            style={{
              backgroundColor: `${COLORS.neutralWhite}10`,
              color: COLORS.neutralWhite,
              border: `1px solid ${COLORS.neutralWhite}20`,
            }}
          >
            <Icon icon="ph:x" className="text-lg" />
          </button>
        )}
      </div>
    </div>
  );
};
