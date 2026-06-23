import { type FC, type ChangeEvent, type ReactNode } from "react";
import { Icon } from "@iconify/react";
import styles from "./css/PrimaryInput.module.css";
import { COLORS, TYPOGRAPHY } from "../../theme";

// 1. Extend React's native InputHTMLAttributes, but omit things we are manually redefining
interface PrimaryInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "size" | "onChange" | "value"> {
  value: string | number; // Now accepts numbers cleanly
  placeholder?: string;
  onChange: (e: ChangeEvent<HTMLInputElement>) => void;
  disabled?: boolean;
  iconLeft?: ReactNode;
  iconRight?: ReactNode;
  type?: string;
  label?: string;
  error?: string;
  size?: "sm" | "md" | "lg";
  fullWidth?: boolean;
}

const sizeMap = {
  sm: { fontSize: TYPOGRAPHY.fontSize.xs, padding: "8px 12px" },
  md: { fontSize: TYPOGRAPHY.fontSize.sm, padding: "12px 16px" },
  lg: { fontSize: TYPOGRAPHY.fontSize.base, padding: "16px 20px" },
};

const PrimaryInput: FC<PrimaryInputProps> = ({
  value,
  placeholder,
  onChange,
  disabled = false,
  iconLeft,
  iconRight,
  type = "text",
  label,
  error,
  size = "md",
  fullWidth = false,
  className, // Captured from native props if passed
  ...props   // Collects everything else safely (like step, min, max, etc.)
}) => {
  const { fontSize, padding } = sizeMap[size];

  return (
    <div className={`flex flex-col ${fullWidth ? "w-full" : "w-auto"}`}>
      {/* Label - Using Bricolage Grotesque */}
      {label && (
        <label
          className="mb-2 text-[10px] font-black uppercase tracking-[0.15em]"
          style={{ 
            fontFamily: TYPOGRAPHY.fontFamily.heading,
            color: error ? "#ff4d4d" : COLORS.neutralGray 
          }}
        >
          {label}
        </label>
      )}

      {/* Input Wrapper */}
      <div className="relative flex items-center w-full group">
        {/* Left Icon */}
        {iconLeft && (
          <div className="absolute left-4 z-10 flex items-center justify-center pointer-events-none text-primary opacity-60 group-focus-within:opacity-100 transition-opacity">
            {iconLeft}
          </div>
        )}

        {/* Input Field */}
        <input
          {...props} // Spreads native HTML properties down safely (handles step={0.0001})
          type={type}
          value={value}
          placeholder={placeholder}
          onChange={onChange}
          disabled={disabled}
          className={`${styles.primaryInput} ${size} ${error ? 'error' : ''} ${className || ''}`}
          style={{
            fontFamily: TYPOGRAPHY.fontFamily.body,
            fontSize,
            paddingLeft: iconLeft ? "2.8rem" : padding.split(' ')[1],
            paddingRight: iconRight ? "2.8rem" : padding.split(' ')[1],
            paddingTop: padding.split(' ')[0],
            paddingBottom: padding.split(' ')[0],
            borderRadius: "14px",
            color: COLORS.neutralWhite,
            backgroundColor: COLORS.surface,
            border: `1px solid ${error ? "#ff4d4d" : COLORS.neutralDarkGray}`,
            width: "100%",
            outline: "none",
            transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
          }}
        />

        {/* Right Icon */}
        {iconRight && (
          <div className="absolute right-4 z-10 flex items-center justify-center pointer-events-none text-neutralGray">
            {iconRight}
          </div>
        )}
      </div>

      {/* Error Message */}
      {error && (
        <div className="flex items-center gap-1 mt-1.5 ml-1">
          <Icon icon="solar:danger-bold" className="text-red-500 text-xs" />
          <span
            className="text-[10px] font-bold uppercase tracking-wide text-red-500"
            style={{ fontFamily: TYPOGRAPHY.fontFamily.body }}
          >
            {error}
          </span>
        </div>
      )}
    </div>
  );
};

export default PrimaryInput;