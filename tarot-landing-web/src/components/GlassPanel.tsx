import { CSSProperties, forwardRef, ReactNode } from "react";

/**
 * Shared frosted-glass surface — the cockpit design system's card primitive
 * (Phase 1: session cockpit; Phase 2 reuses it across the admin panel).
 * Visuals live in .glass-panel (src/styles/cockpit.css), themed by the CSS
 * variables injected at the AdminLayout root; this wrapper only composes the
 * class so callers never copy-paste the treatment inline.
 */
export const GlassPanel = forwardRef<HTMLDivElement, {
  children?: ReactNode;
  className?: string;
  style?: CSSProperties;
}>(({ children, className = "", style }, ref) => (
  <div ref={ref} className={`glass-panel ${className}`} style={style}>
    {children}
  </div>
));

GlassPanel.displayName = "GlassPanel";
