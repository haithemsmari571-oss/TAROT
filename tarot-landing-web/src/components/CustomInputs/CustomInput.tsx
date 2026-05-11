import React from "react";
import { Icon } from "@iconify/react";
import { COLORS, TYPOGRAPHY } from "../../theme";

interface CustomInputProps {
  label?: string;
  placeholder?: string;
  type?: "text" | "password" | "email" | "search";
  value: string;
  onChange: (val: string) => void;
  icon?: string;
  showToggle?: boolean;
  toggleValue?: boolean;
  onToggle?: () => void;
  uppercase?: boolean;
}

export default function CustomInput({
  label,
  placeholder,
  type = "text",
  value,
  onChange,
  icon,
  showToggle = false,
  toggleValue,
  onToggle,
  uppercase = true,
}: CustomInputProps) {
  const isPassword = type === "password" && showToggle;
  const inputType = isPassword && toggleValue ? "text" : type;

  return (
    <div className="flex flex-col gap-3 w-full">
      {/* LABEL */}
      {label && (
        <label
          className="uppercase tracking-widest"
          style={{
            color: COLORS.primary,
            fontSize: TYPOGRAPHY.fontSize.xs,
            fontWeight: TYPOGRAPHY.fontWeight.extrabold,
            fontFamily: TYPOGRAPHY.fontFamily.accent,
          }}
        >
          {label}
        </label>
      )}

      <div className="relative">
        {/* LEFT ICON */}
        {icon && (
          <Icon
            icon={icon}
            width={16}
            className="absolute left-0 top-1/2 -translate-y-1/2 opacity-80"
            style={{ color: COLORS.primary }}
          />
        )}

        {/* INPUT */}
        <input
          type={inputType}
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={`
            w-full bg-transparent border-b
            py-2 outline-none transition-all
            placeholder:opacity-30
            ${icon ? "pl-6" : ""}
            ${showToggle ? "pr-6" : ""}
            ${uppercase ? "uppercase" : ""}
          `}
          style={{
            borderColor: `${COLORS.neutralWhite}1A`, // white/10
            color: COLORS.neutralWhite,
            fontSize: TYPOGRAPHY.fontSize.sm,
            fontFamily: TYPOGRAPHY.fontFamily.body,
          }}
          onFocus={(e) =>
            (e.currentTarget.style.borderColor = COLORS.primary)
          }
          onBlur={(e) =>
            (e.currentTarget.style.borderColor = `${COLORS.neutralWhite}1A`)
          }
        />

        {/* PASSWORD TOGGLE */}
        {isPassword && (
          <button
            type="button"
            onClick={onToggle}
            className="absolute right-0 top-1/2 -translate-y-1/2 opacity-70 hover:opacity-100 transition"
            style={{ color: COLORS.primary }}
          >
            <Icon
              icon={toggleValue ? "solar:eye-slash-bold" : "solar:eye-bold"}
              width={16}
            />
          </button>
        )}
      </div>
    </div>
  );
}
