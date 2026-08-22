/* HALL SOUNDS — the owner's library, read once per page.

   GET /api/hall-sounds is public and answers the enabled loops in the owner's
   order: {key, name, url, level}. `url` serves the file (relative to the API
   host), `level` is a 0..1 per-file trim. This module fetches the list ONCE,
   keeps it, and lets both React (the pills) and startHall (the engine) read
   the same copy. While it loads, if it fails, and if it is empty, the list
   reads as [] and everything behaves exactly as before the library existed:
   the four generated beds. Nothing here ever throws at the customer.

   The chosen sound is carried in sessionStorage under SOUND_KEY by `key` —
   'none' | 'rain' | 'bowls' | 'hum' (generated) or a library entry's key —
   so a choice on the entry form is still the choice inside the room. */

import { useSyncExternalStore } from "react";
import axiosClient from "@/lib/axiosClient";

/** sessionStorage key for the chosen sound. Was startHall's own constant. */
export const SOUND_KEY = "hall-sound";

export type GeneratedKind = "none" | "rain" | "bowls" | "hum";
export type Mood = Exclude<GeneratedKind, "none">;

/** The four the design always had, in its order and its words. */
export const GENERATED_PILLS: ReadonlyArray<{ key: GeneratedKind; name: string }> = [
  { key: "none", name: "Silence" },
  { key: "rain", name: "Rain" },
  { key: "bowls", name: "Singing bowls" },
  { key: "hum", name: "Deep hum" },
];

export const isGeneratedKind = (k: string): k is GeneratedKind =>
  k === "none" || k === "rain" || k === "bowls" || k === "hum";

export interface HallSoundEntry {
  key: string;
  name: string;
  /** absolute, ready to fetch */
  url: string;
  /** 0..1 per-file trim on the loop's own gain */
  level: number;
}

type Status = "idle" | "loading" | "ready" | "failed";
let status: Status = "idle";
let entries: HallSoundEntry[] = [];
const subscribers = new Set<() => void>();
let inflight: Promise<HallSoundEntry[]> | null = null;

const API_HOST = (import.meta.env.VITE_API_URL ?? "").replace(/\/+$/, "");

/** The file's absolute URL — the API answers a path on its own host. */
export function resolveHallSoundUrl(url: string): string {
  if (/^https?:\/\//i.test(url)) return url;
  return API_HOST + (url.startsWith("/") ? url : "/" + url);
}

function publish() { for (const cb of subscribers) cb(); }

function normalise(raw: unknown): HallSoundEntry[] {
  if (!Array.isArray(raw)) return [];
  const out: HallSoundEntry[] = [];
  for (const candidate of raw) {
    if (!candidate || typeof candidate !== "object") continue;
    const r = candidate as Record<string, unknown>;
    if (!r || typeof r.key !== "string" || !r.key || typeof r.url !== "string" || !r.url) continue;
    if (r.enabled === false) continue;
    if (isGeneratedKind(r.key)) continue;          // never shadow the four
    const level = Number(r.level);
    out.push({
      key: r.key,
      name: typeof r.name === "string" && r.name.trim() ? r.name.trim() : r.key,
      url: resolveHallSoundUrl(r.url),
      level: Number.isFinite(level) ? Math.max(0, Math.min(1, level)) : 1,
    });
  }
  // the API already answers in the owner's order; honour a sort_order if present
  return out;
}

/** Fetch the list once. Safe to call any number of times; never rejects. */
export function loadHallSounds(): Promise<HallSoundEntry[]> {
  if (inflight) return inflight;
  status = "loading";
  inflight = axiosClient
    .get("/hall-sounds", { timeout: 15000 })
    .then((res) => { entries = normalise(res.data); status = "ready"; })
    .catch(() => { entries = []; status = "failed"; })
    .then(() => { publish(); return entries; });
  return inflight;
}

/** The library as it is right now: [] until ready, [] if failed or empty. */
export function getHallSounds(): HallSoundEntry[] { return entries; }
export function hallSoundsStatus(): Status { return status; }
export function findHallSound(key: string): HallSoundEntry | undefined {
  return entries.find((e) => e.key === key);
}
/** Resolves once the fetch has settled (immediately if it already has). */
export function whenHallSoundsSettled(): Promise<HallSoundEntry[]> {
  return status === "ready" || status === "failed" ? Promise.resolve(entries) : loadHallSounds();
}

export function subscribeHallSounds(cb: () => void): () => void {
  subscribers.add(cb);
  return () => { subscribers.delete(cb); };
}

/** React view of the library. Triggers the one fetch if nobody has yet. */
export function useHallSounds(): HallSoundEntry[] {
  if (status === "idle") loadHallSounds();
  return useSyncExternalStore(subscribeHallSounds, getHallSounds, () => entries);
}

/** The generated bed that stands in while a library file downloads and
    decodes, chosen from the entry's own words. Water → rain; low, droning
    words → hum; everything else the bowls, the design's original bed. */
export function nearestMood(entry: Pick<HallSoundEntry, "key" | "name">): Mood {
  const s = (entry.key + " " + entry.name).toLowerCase();
  if (/\b(rain|water|storm|wind|sea|ocean|river|stream|waves?|shower|drizzle|thunder)\b/.test(s)) return "rain";
  if (/\b(hum|drone|deep|bass|low|om|tanpura|earth)\b/.test(s)) return "hum";
  return "bowls";
}

/** What sessionStorage holds right now, for the pills' first paint. */
export function storedSoundKey(): string {
  try { return sessionStorage.getItem(SOUND_KEY) || "none"; } catch { return "none"; }
}
