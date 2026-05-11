import { COLORS, TYPOGRAPHY } from "../../theme";

type CustomTextAreaProps = {
  label: string;
  placeholder?: string;
  rows?: number;
  badgeText?: string;
  uppercase?: boolean;
};

export const CustomTextArea = ({
  label,
  placeholder = "",
  rows = 6,
  badgeText = "SECURE_INPUT_ACTIVE",
  uppercase = true,
}: CustomTextAreaProps) => {
  return (
    <div className="flex flex-col gap-4 relative w-full">
      {/* LABEL */}
      <label
        className="uppercase tracking-[0.4em] flex items-center gap-2"
        style={{
          color: COLORS.primary,
          fontSize: TYPOGRAPHY.fontSize.xs,
          fontWeight: TYPOGRAPHY.fontWeight.extrabold,
          fontFamily: TYPOGRAPHY.fontFamily.accent,
        }}
      >
        {label}
      </label>

      {/* TEXTAREA */}
      <textarea
        rows={rows}
        placeholder={placeholder}
        className={`
          w-full outline-none transition-all
          ${uppercase ? "uppercase" : ""}
        `}
        style={{
          backgroundColor: `${COLORS.neutralWhite}08`,
          borderLeft: `1px solid ${COLORS.neutralWhite}`, // DEFAULT
          padding: "1.5rem",
          color: COLORS.neutralWhite,
          fontSize: TYPOGRAPHY.fontSize.sm,
          fontFamily: TYPOGRAPHY.fontFamily.body,
        }}
        onFocus={(e) => {
          e.currentTarget.style.backgroundColor = `${COLORS.neutralWhite}0D`;
          e.currentTarget.style.borderLeftColor = COLORS.primary; // FOCUS
        }}
        onBlur={(e) => {
          e.currentTarget.style.backgroundColor = `${COLORS.neutralWhite}08`;
          e.currentTarget.style.borderLeftColor = COLORS.neutralWhite; // RESET
        }}
      />

      {/* BADGE */}
      {badgeText && (
        <div
          className="absolute bottom-2 right-4 uppercase"
          style={{
            fontSize: "0.55rem",
            color: `${COLORS.primary}66`,
            fontFamily: TYPOGRAPHY.fontFamily.accent,
          }}
        >
          {badgeText}
        </div>
      )}
    </div>
  );
};
