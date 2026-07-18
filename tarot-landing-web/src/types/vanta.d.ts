/** Vanta 0.5.x dist files are UMD bundles whose default export is the effect factory.
 * THREE is passed in via the options object. No official types exist. */
declare module "vanta/dist/vanta.clouds2.min" {
  export type VantaInstance = {
    destroy: () => void;
    setOptions?: (options: Record<string, unknown>) => void;
  };
  const effect: (options: Record<string, unknown>) => VantaInstance;
  export default effect;
}

declare module "vanta/dist/vanta.net.min" {
  export type VantaInstance = {
    destroy: () => void;
    setOptions?: (options: Record<string, unknown>) => void;
  };
  const effect: (options: Record<string, unknown>) => VantaInstance;
  export default effect;
}

declare module "vanta/dist/vanta.halo.min" {
  export type VantaInstance = {
    destroy: () => void;
    setOptions?: (options: Record<string, unknown>) => void;
  };
  const effect: (options: Record<string, unknown>) => VantaInstance;
  export default effect;
}
