import axiosClient from "@/lib/axiosClient";

/* The website's own library routes, called with the owner's token (ROUND49
   B.1, B.5): measure and hash in the browser, one signed grant, the file PUT
   straight to storage, then the item registered and finished. The same
   sequence as the CRM's library screen (crm library.tsx:144-293, 395-451),
   for video as well as audio. Every route is superadmin-only on the server
   (routers/library_items.py:47). */

export type OwnerMedium = "video" | "audio";

export interface UploadClaim {
  content_type: string;
  size_bytes: number;
  sha256: string;
  content_md5: string;
  duration_seconds: number;
  original_filename: string;
  width?: number;
  height?: number;
}

export interface UploadGrant {
  object_key: string;
  upload_url: string;
  method: string;
  expires_in_seconds: number;
  headers: Record<string, string>;
}

export interface OwnerLibraryItem {
  id: number;
  key: string;
  type: string;
  title: string;
  description: string | null;
  enabled: boolean;
  published_at: string | null;
  cover_url: string | null;
}

const GRANT_PATHS: Record<OwnerMedium, string> = {
  video: "/admin/library-items/video-upload-url",
  audio: "/admin/library-items/audio-upload-url",
};
const REGISTER_PATHS: Record<OwnerMedium, string> = {
  video: "/admin/library-items/video",
  audio: "/admin/library-items",
};
const itemPath = (id: number) => `/admin/library-items/${id}`;

/* The grant schema caps the name (schemas/library_item.py:24). */
const MAX_ORIGINAL_FILENAME_LENGTH = 255;
export const originalFilename = (file: File) => file.name.slice(0, MAX_ORIGINAL_FILENAME_LENGTH);

export async function requestUploadGrant(medium: OwnerMedium, claim: UploadClaim): Promise<UploadGrant> {
  const { data } = await axiosClient.post<UploadGrant>(GRANT_PATHS[medium], claim);
  return data;
}

/* The duration exactly as the server signed it (str() of the float it read),
   which the stored object carries and registration must repeat byte for byte
   (services/library_items.py _verify_stored_upload). */
export function signedDuration(grant: UploadGrant, claim: UploadClaim): string {
  const entry = Object.entries(grant.headers).find(([name]) => name.toLowerCase() === "x-amz-meta-duration-seconds");
  return entry?.[1] ?? String(claim.duration_seconds);
}

export class StorageUploadError extends Error {
  readonly status: number | "NETWORK";

  constructor(status: number | "NETWORK") {
    super(`storage upload failed: ${status}`);
    this.name = "StorageUploadError";
    this.status = status;
  }
}

/* One PUT to the signed address with exactly the signed headers, by
   XMLHttpRequest for its upload progress. No Authorization header: the
   signature is the permission. */
export function putToStorage(
  grant: UploadGrant,
  file: File,
  onProgress: (loaded: number, total: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open(grant.method, grant.upload_url, true);
    request.timeout = 0;
    Object.entries(grant.headers).forEach(([name, value]) => request.setRequestHeader(name, value));
    request.upload.onprogress = (event) => onProgress(event.loaded, event.lengthComputable ? event.total : file.size);
    request.onload = () => {
      if (request.status >= 200 && request.status < 300) {
        onProgress(file.size, file.size);
        resolve();
      } else {
        reject(new StorageUploadError(request.status));
      }
    };
    request.onerror = () => reject(new StorageUploadError("NETWORK"));
    request.onabort = () => reject(new StorageUploadError("NETWORK"));
    request.send(file);
  });
}

export interface Registration {
  grant: UploadGrant;
  claim: UploadClaim;
  type: string;
  title: string;
  description: string;
}

/* Registered hidden, with today's date: the post appears only when it is
   finished (ROUND49 B.2). */
export async function registerItem(medium: OwnerMedium, registration: Registration): Promise<OwnerLibraryItem> {
  const { grant, claim } = registration;
  const form = new FormData();
  form.append(`${medium}_key`, grant.object_key);
  form.append(`${medium}_content_type`, claim.content_type);
  form.append(`${medium}_size_bytes`, String(claim.size_bytes));
  form.append(`${medium}_sha256`, claim.sha256);
  form.append(`${medium}_md5`, claim.content_md5);
  form.append(`${medium}_original_filename`, claim.original_filename);
  form.append("duration_seconds", signedDuration(grant, claim));
  if (claim.width) form.append("video_width", String(claim.width));
  if (claim.height) form.append("video_height", String(claim.height));
  form.append("type", registration.type);
  form.append("title", registration.title);
  if (registration.description) form.append("description", registration.description);
  form.append("enabled", "false");
  form.append("published_at", new Date().toISOString());
  const { data } = await axiosClient.post<OwnerLibraryItem>(REGISTER_PATHS[medium], form);
  return data;
}

/* The last step: the cover, when there is one, and enabled=true in the same
   PATCH, which the server applies in one commit (services/library_items.py
   update_library_item). A refused cover leaves the post hidden. */
export async function finishItem(
  id: number,
  cover: File | null,
  changes: Record<string, string>,
): Promise<OwnerLibraryItem> {
  const form = new FormData();
  if (cover) form.append("cover_image", cover, cover.name);
  Object.entries(changes).forEach(([field, value]) => form.append(field, value));
  form.append("enabled", "true");
  const { data } = await axiosClient.patch<OwnerLibraryItem>(itemPath(id), form);
  return data;
}
