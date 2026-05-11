import { type FC, type ChangeEvent } from "react";
import { Icon } from "@iconify/react"; // Swapped to Iconify
import { COLORS, TYPOGRAPHY } from "../../theme";

type PrimaryCheckboxProps = {
  checked: boolean;
  onChange: (e: ChangeEvent<HTMLInputElement>) => void;
  label?: string;
  disabled?: boolean;
  error?: string;
  size?: "sm" | "md" | "lg";
  fullWidth?: boolean;
};

const sizeMap = {
  sm: { boxSize: "16px", iconSize: "10px", fontSize: TYPOGRAPHY.fontSize.xs, gap: "8px" },
  md: { boxSize: "20px", iconSize: "12px", fontSize: TYPOGRAPHY.fontSize.sm, gap: "10px" },
  lg: { boxSize: "24px", iconSize: "16px", fontSize: TYPOGRAPHY.fontSize.base, gap: "12px" },
};

const PrimaryCheckbox: FC<PrimaryCheckboxProps> = ({
  checked,
  onChange,
  label,
  disabled = false,
  error,
  size = "md",
  fullWidth = false,
}) => {
  const { boxSize, iconSize, gap, fontSize } = sizeMap[size];

  return (
    <div className={`flex flex-col ${fullWidth ? "w-full" : "w-auto"}`}>
      <label
        className={`flex items-center select-none relative group ${disabled ? 'cursor-not-allowed opacity-40' : 'cursor-pointer'}`}
        style={{ gap, fontFamily: TYPOGRAPHY.fontFamily.body }}
      >
        {/* Checkbox Box */}
        <div
          className="flex items-center justify-center transition-all duration-300 rounded-md border"
          style={{
            width: boxSize,
            height: boxSize,
            backgroundColor: checked ? COLORS.primary : "transparent",
            borderColor: error ? COLORS.starGold : checked ? COLORS.primary : COLORS.neutralDarkGray,
            boxShadow: checked ? `0 0 10px ${COLORS.primary}40` : "none",
          }}
        >
          {checked && (
            <Icon 
              icon="solar:check-read-bold" 
              style={{ fontSize: iconSize, color: COLORS.dark }} 
            />
          )}
        </div>

        {/* Label Text */}
        {label && (
          <span
            className="font-bold transition-colors duration-300"
            style={{
              fontSize,
              color: checked ? COLORS.neutralWhite : COLORS.neutralGray,
            }}
          >
            {label}
          </span>
        )}

        {/* Hidden Native Input */}
        <input
          type="checkbox"
          checked={checked}
          onChange={onChange}
          disabled={disabled}
          className="absolute opacity-0 pointer-events-none"
        />
      </label>

      {/* Error Message */}
      {error && (
        <span
          className="mt-1 text-[10px] font-black uppercase tracking-wider"
          style={{ color: COLORS.starGold, fontFamily: TYPOGRAPHY.fontFamily.body }}
        >
          {error}
        </span>
      )}
    </div>
  );
};

export default PrimaryCheckbox;