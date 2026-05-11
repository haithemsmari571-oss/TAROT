import React from "react";
import { Icon } from "@iconify/react";

interface CustomCheckboxProps {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  icon?: string; // optional custom icon
}

export default function CustomCheckbox({
  label,
  checked,
  onChange,
  icon = "mingcute:check-fill",
}: CustomCheckboxProps) {
  return (
    <label className="flex items-center gap-3 group cursor-pointer select-none">
      <div className="relative flex items-center justify-center">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="
            peer appearance-none w-5 h-5 rounded-md
            border border-white/20 bg-white/5 
            transition-all duration-300 
            cursor-pointer
            checked:bg-green-500 checked:border-green-500
          "
        />

        <Icon
          icon={icon}
          className="
            absolute w-3.5 h-3.5 text-white opacity-0 
            transition-all duration-300 
            peer-checked:opacity-100 peer-checked:scale-100
            scale-75
          "
        />
      </div>

      <span className="text-gray-300 group-hover:text-white transition-colors">
        {label}
      </span>
    </label>
  );
}
