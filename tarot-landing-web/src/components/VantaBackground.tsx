import { CSSProperties, useEffect, useRef, useState } from "react";
import * as THREE from "three";

type VantaInstance = { destroy: () => void };
export type VantaEffectFactory = (options: Record<string, unknown>) => VantaInstance;

/** Which render path this wrapper actually took — surfaced in DEV so "effect mounted"
 *  and "fallback gradient" are never again indistinguishable on screen. */
type VantaStatus =
  | "active"
  | "active-texture-missing"
  | "fallback-reduced-motion"
  | "fallback-init-failed";

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
 *
 * DEV observability (stripped from prod builds): the active path is logged to the
 * console, and when ``debugLabel`` is set a small fixed badge states it on-page.
 * If ``options.texturePath`` is set, the URL is preflighted — a shader whose noise
 * texture 404s renders a plausible-but-featureless gradient that is nearly
 * impossible to tell from the CSS fallback by eye, which is exactly how a missing
 * texture shipped unnoticed once already.
 */
export const VantaBackground = ({
  effect,
  options,
  className = "",
  fallbackStyle,
  debugLabel,
}: {
  effect: VantaEffectFactory;
  options: Record<string, unknown>;
  className?: string;
  fallbackStyle?: CSSProperties;
  debugLabel?: string;
}) => {
  const elRef = useRef<HTMLDivElement>(null);
  // Reduced-motion is knowable before the effect runs — resolving it in the
  // initializer (not via setState inside the effect) keeps the first render truthful.
  const [status, setStatus] = useState<VantaStatus | null>(() =>
    prefersReducedMotion() ? "fallback-reduced-motion" : null
  );
  // Options are colour numbers / booleans / numbers — a stable serialised key avoids
  // re-initialising the effect when a caller passes a new-but-equal object literal.
  const optionsKey = JSON.stringify(options);

  useEffect(() => {
    if (prefersReducedMotion()) return;
    const el = elRef.current;
    if (!el) return;
    let instance: VantaInstance | null = null;
    let cancelled = false;
    const parsed = JSON.parse(optionsKey);
    try {
      instance = effect({ el, THREE, ...parsed });
      // eslint-disable-next-line react-hooks/set-state-in-effect -- the mount outcome only exists inside the effect; status is DEV observability, not layout-driving state
      setStatus("active");
    } catch (error) {
      setStatus("fallback-init-failed");
      console.warn("[VantaBackground] effect init failed — static fallback shown", error);
    }
    if (import.meta.env.DEV && instance && typeof parsed.texturePath === "string") {
      fetch(parsed.texturePath)
        .then((res) => {
          const isImage = res.ok && (res.headers.get("content-type") || "").startsWith("image/");
          if (!isImage && !cancelled) setStatus("active-texture-missing");
        })
        .catch(() => {
          if (!cancelled) setStatus("active-texture-missing");
        });
    }
    return () => {
      cancelled = true;
      try {
        instance?.destroy();
      } catch {
        /* a destroy failure must never break unmount */
      }
    };
  }, [effect, optionsKey]);

  useEffect(() => {
    if (import.meta.env.DEV && status) {
      const log = status.startsWith("active-") || status === "fallback-init-failed"
        ? console.warn
        : console.info;
      log(`[VantaBackground] ${debugLabel || "effect"}: ${status}`);
    }
  }, [status, debugLabel]);

  // The badge must be a SIBLING of the effect div, not a child: callers mount the
  // effect at z-0 under their content layer, and a child — even position:fixed with a
  // huge z-index — stays trapped in that z-0 stacking context, i.e. invisible.
  return (
    <>
      <div ref={elRef} className={className} style={fallbackStyle} />
      {import.meta.env.DEV && debugLabel && status && (
        <span
          style={{
            position: "fixed",
            bottom: 8,
            right: 8,
            zIndex: 9999,
            padding: "2px 8px",
            borderRadius: 6,
            fontSize: 11,
            fontFamily: "monospace",
            color: status === "active" ? "#7ee787" : "#f0b429",
            background: "rgba(0,0,0,0.65)",
            pointerEvents: "none",
          }}
        >
          vanta[{debugLabel}]: {status}
        </span>
      )}
    </>
  );
};
