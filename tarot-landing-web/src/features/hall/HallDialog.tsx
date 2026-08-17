/* A dialog in the hall's own language.

   Structure only. Every visual value comes from hall.css: the scrim is the
   design's own veil, and the card IS .panel — same gradient, border, blur,
   shadow and radius. Inside, callers use .eyebrow, .ptitle, .psub, .begin,
   .quiet and .legal, which already exist. Nothing new is invented, no copy is
   changed, and no action is added or removed. */

import { useEffect, type ReactNode } from "react";
import "../../styles/hall.css";
import "../../styles/hall-room.css";

export default function HallDialog({
  open, onClose, labelledBy, children, wide,
}: {
  open: boolean;
  onClose: () => void;
  labelledBy?: string;
  children: ReactNode;
  wide?: boolean;
}) {
  /* Escape closes, exactly as tapping the scrim does. */
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="hdlg" role="dialog" aria-modal="true" aria-labelledby={labelledBy}
         onClick={onClose}>
      <section className={"panel hdlg-card" + (wide ? " wide" : "")}
               onClick={(e) => e.stopPropagation()}>
        {children}
      </section>
    </div>
  );
}
