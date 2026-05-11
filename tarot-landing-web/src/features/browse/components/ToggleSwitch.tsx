import { motion } from "framer-motion";
import { COLORS } from "../../../theme";

interface ToggleSwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  description?: string;
}

export const ToggleSwitch = ({
  checked,
  onChange,
  label,
  description,
}: ToggleSwitchProps) => {
  // If no label or description, render compact version
  if (!label && !description) {
    return (
      <button
        onClick={(e) => {
          e.stopPropagation();
          onChange(!checked);
        }}
        className="relative inline-flex items-center h-5 rounded-full w-9 transition-colors focus:outline-none flex-shrink-0"
        style={{
          backgroundColor: checked ? COLORS.primary : `${COLORS.neutralWhite}20`,
        }}
      >
        <motion.span
          layout
          transition={{
            type: "spring",
            stiffness: 500,
            damping: 30,
          }}
          className="inline-block w-3.5 h-3.5 rounded-full shadow-lg"
          style={{
            backgroundColor: COLORS.neutralWhite,
            transform: checked ? "translateX(20px)" : "translateX(2px)",
          }}
        />
      </button>
    );
  }

  return (
    <div className="flex items-center justify-between">
      <div className="flex-1">
        {label && (
          <label className="block text-xs font-bold uppercase tracking-widest mb-1" style={{ color: COLORS.neutralWhite + "80" }}>
            {label}
          </label>
        )}
        {description && (
          <p className="text-xs opacity-50" style={{ color: COLORS.neutralWhite }}>
            {description}
          </p>
        )}
      </div>

      <button
        onClick={() => onChange(!checked)}
        className="relative inline-flex items-center h-7 rounded-full w-14 transition-colors focus:outline-none"
        style={{
          backgroundColor: checked ? COLORS.primary : `${COLORS.neutralWhite}20`,
        }}
      >
        <motion.span
          layout
          transition={{
            type: "spring",
            stiffness: 500,
            damping: 30,
          }}
          className="inline-block w-5 h-5 rounded-full shadow-lg"
          style={{
            backgroundColor: COLORS.neutralWhite,
            transform: checked ? "translateX(34px)" : "translateX(4px)",
          }}
        />
      </button>
    </div>
  );
};
