import type { ReactNode } from "react";
import { COLORS } from "../../../theme";

interface FieldSetProps {
  label: string;
  children: ReactNode;
}

export const FieldSet = ({ label, children }: FieldSetProps) => (
  <div className="flex flex-col gap-1.5">
    <label
      className="text-[9px] font-black uppercase tracking-widest ml-1"
      style={{ color: COLORS.neutralGray }}
    >
      {label}
    </label>
    {children}
  </div>
);
