import imageCompression from "browser-image-compression";

/**
 * Compress a phone screenshot in the browser BEFORE upload (Section 6.1).
 * Accepts anything a phone produces (PNG, JPG, WebP, HEIC), any size. Downscales
 * to ~1600px long edge, re-encodes JPEG ~80%, and strips EXIF (the canvas
 * re-encode drops metadata — privacy). The user never sees a size limit.
 */
export async function compressScreenshot(
  file: File,
  onProgress?: (percent: number) => void
): Promise<File> {
  let input = file;

  // HEIC/HEIF (iPhone) can't be drawn to a canvas by most browsers — convert to
  // JPEG first. heic2any is heavy, so load it only when actually needed.
  const isHeic =
    /heic|heif/i.test(file.type) || /\.(heic|heif)$/i.test(file.name);
  if (isHeic) {
    const heic2any = (await import("heic2any")).default as (opts: {
      blob: Blob;
      toType?: string;
      quality?: number;
    }) => Promise<Blob | Blob[]>;
    const converted = await heic2any({ blob: file, toType: "image/jpeg", quality: 0.9 });
    const blob = Array.isArray(converted) ? converted[0] : converted;
    input = new File([blob], file.name.replace(/\.[^.]+$/, ".jpg"), {
      type: "image/jpeg",
    });
  }

  const compressed = await imageCompression(input, {
    maxWidthOrHeight: 1600,
    initialQuality: 0.8,
    useWebWorker: true,
    fileType: "image/jpeg",
    onProgress,
  });

  return compressed instanceof File
    ? compressed
    : new File([compressed], "screenshot.jpg", { type: "image/jpeg" });
}
