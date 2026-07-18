import { CSSProperties, useEffect, useRef } from "react";
import * as THREE from "three";

type VantaInstance = { destroy: () => void };
export type VantaEffectFactory = (options: Record<string, unknown>) => VantaInstance;

const prefersReducedMotion = () =>
  typeof window !== "undefined" &&
  !!window.matchMedia &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * Reusable Vanta.js mount: attaches the given effect to a ref'd div inside useEffect and
 * calls .destroy() in the cleanup on EVERY unmount path (including StrictMode's fast
 * double-mount) — a missed destroy leaks a WebGL context per mount. One wrapper, used by
 * both the cockpit clouds layer and the persona halos; never two copies of this logic.
 *
 * Respects prefers-reduced-motion: when set, the effect is never mounted and the div
 * simply shows ``fallbackStyle`` (a static gradient in the same palette). The same
 * fallback shows if the effect throws at init (e.g. a THREE/vanta version mismatch),
 * so the cockpit never renders a black hole.
 */
export const VantaBackground = ({
  effect,
  options,
  className = "",
  fallbackStyle,
}: {
  effect: VantaEffectFactory;
  options: Record<string, unknown>;
  className?: string;
  fallbackStyle?: CSSProperties;
}) => {
  const elRef = useRef<HTMLDivElement>(null);
  // Options are colour numbers / booleans / numbers — a stable serialised key avoids
  // re-initialising the effect when a caller passes a new-but-equal object literal.
  const optionsKey = JSON.stringify(options);

  useEffect(() => {
    if (prefersReducedMotion()) return;
    const el = elRef.current;
    if (!el) return;
    let instance: VantaInstance | null = null;
    try {
      instance = effect({ el, THREE, ...JSON.parse(optionsKey) });
    } catch (error) {
      console.warn("[VantaBackground] effect init failed — static fallback shown", error);
    }
    return () => {
      try {
        instance?.destroy();
      } catch {
        /* a destroy failure must never break unmount */
      }
    };
  }, [effect, optionsKey]);

  return <div ref={elRef} className={className} style={fallbackStyle} />;
};
