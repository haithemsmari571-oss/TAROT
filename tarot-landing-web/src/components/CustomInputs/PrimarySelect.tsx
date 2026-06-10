import { type FC, useState, useRef, useEffect } from "react";
import { Icon } from "@iconify/react";
import { COLORS, TYPOGRAPHY } from "../../theme";

type SelectOption = {
  label: string;
  value: string;
};

type PrimarySelectProps = {
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  label?: string;
  error?: string;
  disabled?: boolean;
  size?: "sm" | "md" | "lg";
  fullWidth?: boolean;
  width?: string | number;
  showIcon?: boolean;
};

const sizeMap = {
  sm: { fontSize: TYPOGRAPHY.fontSize.xs, height: '36px', px: '12px' },
  md: { fontSize: TYPOGRAPHY.fontSize.sm, height: '44px', px: '16px' },
  lg: { fontSize: TYPOGRAPHY.fontSize.base, height: '52px', px: '20px' },
};

const PrimarySelect: FC<PrimarySelectProps> = ({
  value,
  options,
  onChange,
  placeholder = "Select Option",
  label,
  error,
  disabled = false,
  size = "md",
  fullWidth = false,
  width,
  showIcon = true,
}) => {
  const [open, setOpen] = useState(false);
  const selectRef = useRef<HTMLDivElement>(null);
  const { fontSize, height, px } = sizeMap[size];

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (selectRef.current && !selectRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const computedWidth = fullWidth ? "100%" : width ? (typeof width === "number" ? `${width}px` : width) : "200px";

  const handleToggle = () => {
    if (!disabled) setOpen((prev) => !prev);
  };

  const selectedOption = (options ?? []).find((opt) => opt.value === value);

  return (
    <div className="flex flex-col" style={{ width: computedWidth, fontFamily: TYPOGRAPHY.fontFamily.body }} ref={selectRef}>
      {label && (
        <label 
          className="mb-1.5 font-bold uppercase tracking-widest text-[10px]"
          style={{ color: COLORS.neutralGray }}
        >
          {label}
        </label>
      )}

      <div className="relative w-full">
        <div
          onClick={handleToggle}
          className={`
            flex items-center justify-between cursor-pointer transition-all duration-300
            border rounded-xl backdrop-blur-md
            ${disabled ? 'opacity-40 cursor-not-allowed' : ''}
          `}
          style={{
            height,
            fontSize,
            paddingLeft: px,
            paddingRight: px,
            backgroundColor: COLORS.surface,
            borderColor: error ? COLORS.starGold : open ? COLORS.primary : COLORS.neutralDarkGray,
            color: selectedOption ? COLORS.neutralWhite : COLORS.neutralGray,
          }}
        >
          <span className="truncate flex-1">
            {selectedOption ? selectedOption.label : placeholder}
          </span>

          {showIcon && (
            <Icon
              icon={open ? "solar:alt-arrow-up-linear" : "solar:alt-arrow-down-linear"}
              className="ml-2 text-lg transition-transform duration-300"
              style={{ color: open ? COLORS.primary : COLORS.neutralGray }}
            />
          )}
        </div>

        {open && (
          <ul
            className="absolute left-0 z-[100] mt-2 max-h-60 w-full overflow-auto rounded-2xl border p-1.5 shadow-2xl animate-in fade-in zoom-in-95 duration-200"
            style={{
              backgroundColor: COLORS.dark,
              borderColor: COLORS.neutralDarkGray,
              boxShadow: `0 10px 30px -10px ${COLORS.dark}`,
            }}
          >
            {options.map((opt) => {
              const isSelected = opt.value === value;
              return (
                <li
                  key={opt.value}
                  onClick={() => {
                    onChange(opt.value);
                    setOpen(false);
                  }}
                  className="group flex items-center justify-between px-4 py-2.5 mb-1 last:mb-0 rounded-xl cursor-pointer transition-all duration-200"
                  style={{ 
                    fontSize,
                    backgroundColor: isSelected ? `${COLORS.primary}15` : 'transparent',
                    color: isSelected ? COLORS.primary : COLORS.neutralWhite,
                  }}
                  onMouseEnter={(e) => {
                    if (!isSelected) {
                      e.currentTarget.style.backgroundColor = COLORS.surfaceAccent;
                      e.currentTarget.style.color = COLORS.neutralWhite;
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isSelected) {
                      e.currentTarget.style.backgroundColor = 'transparent';
                      e.currentTarget.style.color = COLORS.neutralWhite;
                    }
                  }}
                >
                  <span className={isSelected ? "font-bold" : "font-medium"}>{opt.label}</span>
                  {isSelected && (
                    <Icon icon="solar:check-circle-bold" style={{ color: COLORS.primary }} />
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {error && (
        <span className="mt-1.5 text-[10px] font-bold uppercase" style={{ color: COLORS.starGold }}>
          {error}
        </span>
      )}
    </div>
  );
};

export default PrimarySelect;