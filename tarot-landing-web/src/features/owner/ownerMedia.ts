/* What the owner can post and how a chosen file is read before any work
   (ROUND50). The types, sizes and cover rules are the server's: TAROT-BACKEND
   app/services/library_items.py (ALLOWED_LIBRARY_AUDIO_TYPES,
   ALLOWED_LIBRARY_VIDEO_TYPES, MAX_LIBRARY_COVER_BYTES,
   ALLOWED_LIBRARY_COVER_TYPES) and app/schemas/library_item.py:10-11. */

export const REEL_TYPES: Readonly<Record<string, string>> = {
  "video/mp4": ".mp4",
  "video/quicktime": ".mov",
};
export const PODCAST_TYPES: Readonly<Record<string, string>> = {
  "audio/mpeg": ".mp3",
  "audio/ogg": ".ogg",
  "audio/mp4": ".m4a",
};
/* A browser may label a phone recording with a name the server does not use.
   It is asked for under the server's name. */
const BROWSER_TYPE_ALIASES: Readonly<Record<string, string>> = {
  "audio/x-m4a": "audio/mp4",
};

export const MAX_REEL_BYTES = 300 * 1024 * 1024;
export const MAX_PODCAST_BYTES = 2_147_483_647;
export const MAX_COVER_BYTES = 8 * 1024 * 1024;
const COVER_TYPES: readonly string[] = ["image/jpeg", "image/png", "image/webp"];
/* MAX_LIBRARY_ITEM_TITLE_LENGTH, app/schemas/library_item.py:9. */
export const MAX_TITLE_LENGTH = 100;

/* The library item's type: Shorts lists every video whatever its type, and
   Home shows the type as the post's label and chip (ROUND49 B.2). */
export const REEL_ITEM_TYPE = "reel";
export const PODCAST_ITEM_TYPE = "podcast";

export const REEL_ACCEPT = Object.keys(REEL_TYPES).join(",");
export const PODCAST_ACCEPT = [
  ...Object.keys(PODCAST_TYPES),
  ...Object.keys(BROWSER_TYPE_ALIASES),
  ...Object.values(PODCAST_TYPES),
].join(",");
export const COVER_ACCEPT = COVER_TYPES.join(",");

/* The content type the grant is asked for: the browser's label when the server
   knows it (after the alias), or else the file name's ending. Null when it is
   neither, and the screen refuses the file. */
export function serverContentType(file: File, types: Readonly<Record<string, string>>): string | null {
  const declared = BROWSER_TYPE_ALIASES[file.type] ?? file.type;
  if (declared in types) return declared;
  const name = file.name.toLowerCase();
  return Object.keys(types).find((type) => name.endsWith(types[type])) ?? null;
}

export function coverAccepted(file: File): boolean {
  return COVER_TYPES.includes(file.type) && file.size <= MAX_COVER_BYTES;
}

export function formatDuration(seconds: number): string {
  const whole = Math.max(0, Math.round(seconds));
  const hours = Math.floor(whole / 3600);
  const minutes = Math.floor((whole % 3600) / 60);
  const rest = String(whole % 60).padStart(2, "0");
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, "0")}:${rest}` : `${minutes}:${rest}`;
}

export function formatSize(bytes: number): string {
  const megabytes = bytes / (1024 * 1024);
  if (megabytes >= 1) return `${megabytes.toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export interface MediaProbe {
  durationSeconds: number;
  width: number | null;
  height: number | null;
}

const PROBE_TIMEOUT_MS = 20_000;

/* Duration, and for a video its frame size, from a media element's metadata,
   the way the CRM measures audio (crm library.tsx:183-248). An audio file whose
   metadata gives no length is decoded instead. */
function readMetadata(file: File, kind: "video" | "audio"): Promise<MediaProbe> {
  return new Promise((resolve, reject) => {
    const element = document.createElement(kind);
    const objectUrl = URL.createObjectURL(file);
    const timer = window.setTimeout(() => finish(new Error("metadata timed out")), PROBE_TIMEOUT_MS);
    function finish(result: MediaProbe | Error) {
      window.clearTimeout(timer);
      element.onloadedmetadata = null;
      element.onerror = null;
      element.removeAttribute("src");
      element.load();
      URL.revokeObjectURL(objectUrl);
      if (result instanceof Error) reject(result);
      else resolve(result);
    }
    element.preload = "metadata";
    element.muted = true;
    if (element instanceof HTMLVideoElement) element.playsInline = true;
    element.onloadedmetadata = () => {
      const durationSeconds = element.duration;
      if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
        finish(new Error("no duration in the metadata"));
        return;
      }
      const video = element instanceof HTMLVideoElement ? element : null;
      finish({
        durationSeconds,
        width: video && video.videoWidth > 0 ? video.videoWidth : null,
        height: video && video.videoHeight > 0 ? video.videoHeight : null,
      });
    };
    element.onerror = () => finish(new Error("the file could not be read"));
    element.src = objectUrl;
    element.load();
  });
}

async function decodeAudioDuration(file: File): Promise<MediaProbe> {
  const context = new AudioContext();
  try {
    const decoded = await context.decodeAudioData(await file.arrayBuffer());
    if (!Number.isFinite(decoded.duration) || decoded.duration <= 0) throw new Error("no duration in the audio");
    return { durationSeconds: decoded.duration, width: null, height: null };
  } finally {
    await context.close().catch(() => undefined);
  }
}

export async function probeMedia(file: File, kind: "video" | "audio"): Promise<MediaProbe> {
  try {
    return await readMetadata(file, kind);
  } catch (error) {
    if (kind === "audio") return decodeAudioDuration(file);
    throw error;
  }
}
