import type { OwnerMedium } from "./ownerLibraryApi";

/* What the owner can post and how a chosen file is read before any work
   (ROUND50, ROUND51). The types, sizes and cover rules are the server's:
   TAROT-BACKEND app/services/library_items.py (ALLOWED_LIBRARY_AUDIO_TYPES,
   ALLOWED_LIBRARY_VIDEO_TYPES, MAX_LIBRARY_COVER_BYTES,
   ALLOWED_LIBRARY_COVER_TYPES, prepare_cover's 2400px) and
   app/schemas/library_item.py:9-11. */

const VIDEO_TYPES: Readonly<Record<string, string>> = {
  "video/mp4": ".mp4",
  "video/quicktime": ".mov",
};
const AUDIO_TYPES: Readonly<Record<string, string>> = {
  "audio/mpeg": ".mp3",
  "audio/ogg": ".ogg",
  "audio/mp4": ".m4a",
};
const MEDIA_TYPES: Readonly<Record<OwnerMedium, Readonly<Record<string, string>>>> = {
  video: VIDEO_TYPES,
  audio: AUDIO_TYPES,
};
const MEDIA_ORDER: readonly OwnerMedium[] = ["video", "audio"];
/* A browser may label a phone recording with a name the server does not use.
   It is asked for under the server's name. */
const BROWSER_TYPE_ALIASES: Readonly<Record<string, string>> = {
  "audio/x-m4a": "audio/mp4",
};

export const MAX_MEDIA_BYTES: Readonly<Record<OwnerMedium, number>> = {
  video: 300 * 1024 * 1024,
  audio: 2_147_483_647,
};
const MAX_COVER_BYTES = 8 * 1024 * 1024;
const COVER_TYPES: readonly string[] = ["image/jpeg", "image/png", "image/webp"];
/* The server keeps a cover at most this many pixels on its long side. */
const MAX_COVER_EDGE = 2400;
/* MAX_LIBRARY_ITEM_TITLE_LENGTH, app/schemas/library_item.py:9. */
export const MAX_TITLE_LENGTH = 100;

/* What a post is, stored as the library item's type (ROUND51). Shorts lists
   every video whatever its type; Home lists every recording and shows its type
   as the post's label and chip (ROUND49 B.2), so a meditation needs nothing
   new on the server. */
export const POST_KINDS = {
  reel: { medium: "video", label: "Reel" },
  podcast: { medium: "audio", label: "Podcast" },
  meditation: { medium: "audio", label: "Meditation" },
} as const satisfies Record<string, { medium: OwnerMedium; label: string }>;
export type PostKind = keyof typeof POST_KINDS;
export const POST_KIND_ORDER = Object.keys(POST_KINDS) as PostKind[];
const isPostKind = (type: string): type is PostKind => type in POST_KINDS;
/* A type posted elsewhere (the CRM's library) is shown as it is stored. */
export const kindLabel = (type: string) => (isPostKind(type) ? POST_KINDS[type].label : type);

/* The one picker takes a video or a recording. The file name endings are
   listed for recordings, which phones often hand over unlabelled. */
export const MEDIA_ACCEPT = [
  ...Object.keys(VIDEO_TYPES),
  ...Object.keys(AUDIO_TYPES),
  ...Object.keys(BROWSER_TYPE_ALIASES),
  ...Object.values(AUDIO_TYPES),
].join(",");
export const COVER_ACCEPT = COVER_TYPES.join(",");

export interface MediaFile {
  medium: OwnerMedium;
  /* The content type the grant is asked for. */
  contentType: string;
}

/* The browser's label when the server knows it (after the alias), or else the
   file name's ending. Null when it is neither. */
function mediaFileOf(file: File): MediaFile | null {
  const declared = BROWSER_TYPE_ALIASES[file.type] ?? file.type;
  const labelled = MEDIA_ORDER.find((medium) => declared in MEDIA_TYPES[medium]);
  if (labelled) return { medium: labelled, contentType: declared };
  const name = file.name.toLowerCase();
  for (const medium of MEDIA_ORDER) {
    const types = MEDIA_TYPES[medium];
    const contentType = Object.keys(types).find((type) => name.endsWith(types[type]));
    if (contentType) return { medium, contentType };
  }
  return null;
}

export type MediaRefusal = "notMedia" | "videoTooBig" | "audioTooBig";

/* A chosen file, read before any work: what it is, or why it cannot be posted
   (a type the server refuses, or more than the server takes). */
export function classifyMedia(file: File): MediaFile | { refusal: MediaRefusal } {
  const media = mediaFileOf(file);
  if (!media) return { refusal: "notMedia" };
  if (file.size > MAX_MEDIA_BYTES[media.medium]) return { refusal: media.medium === "video" ? "videoTooBig" : "audioTooBig" };
  return media;
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
function readMetadata(file: File, kind: OwnerMedium): Promise<MediaProbe> {
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

export async function probeMedia(file: File, kind: OwnerMedium): Promise<MediaProbe> {
  try {
    return await readMetadata(file, kind);
  } catch (error) {
    if (kind === "audio") return decodeAudioDuration(file);
    throw error;
  }
}

/* A reel's cover until the owner chooses a photo (ROUND51): the frame at one
   second, drawn in the browser and kept as a JPEG no larger than the server
   keeps a cover. A video shorter than that gives its middle frame. */
const REEL_COVER_FRAME_SECONDS = 1;
const COVER_FRAME_QUALITY = 0.9;
const COVER_FRAME_NAME = "cover.jpg";

export function captureVideoFrame(file: File): Promise<File> {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    const objectUrl = URL.createObjectURL(file);
    const timer = window.setTimeout(() => finish(new Error("the frame timed out")), PROBE_TIMEOUT_MS);
    function finish(result: File | Error) {
      window.clearTimeout(timer);
      video.onloadedmetadata = null;
      video.onseeked = null;
      video.onerror = null;
      video.removeAttribute("src");
      video.load();
      URL.revokeObjectURL(objectUrl);
      if (result instanceof Error) reject(result);
      else resolve(result);
    }
    video.preload = "auto";
    video.muted = true;
    video.playsInline = true;
    video.onloadedmetadata = () => {
      const duration = video.duration;
      video.currentTime = Number.isFinite(duration) && duration > 0
        ? Math.min(REEL_COVER_FRAME_SECONDS, duration / 2)
        : REEL_COVER_FRAME_SECONDS;
    };
    video.onseeked = () => {
      const { videoWidth: width, videoHeight: height } = video;
      if (!width || !height) {
        finish(new Error("the video has no picture"));
        return;
      }
      const scale = Math.min(1, MAX_COVER_EDGE / Math.max(width, height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(width * scale);
      canvas.height = Math.round(height * scale);
      const context = canvas.getContext("2d");
      if (!context) {
        finish(new Error("the frame could not be drawn"));
        return;
      }
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((blob) => {
        if (!blob || blob.size > MAX_COVER_BYTES) finish(new Error("the frame could not be kept"));
        else finish(new File([blob], COVER_FRAME_NAME, { type: "image/jpeg", lastModified: Date.now() }));
      }, "image/jpeg", COVER_FRAME_QUALITY);
    };
    video.onerror = () => finish(new Error("the video could not be read"));
    video.src = objectUrl;
    video.load();
  });
}
