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

/* The fields of the server's LibraryItemAdmin (schemas/library_item.py) the
   owner's screens read. Every item holds exactly one of video and audio
   (ck_library_items_one_media). */
export interface OwnerLibraryItem {
  id: number;
  key: string;
  type: string;
  title: string;
  description: string | null;
  audio_url: string | null;
  video_url: string | null;
  video_width: number | null;
  video_height: number | null;
  duration_seconds: number;
  cover_url: string | null;
  enabled: boolean;
  published_at: string | null;
  created_at: string;
}

const LIBRARY_PATH = "/admin/library-items";
const GRANT_PATHS: Record<OwnerMedium, string> = {
  video: `${LIBRARY_PATH}/video-upload-url`,
  audio: `${LIBRARY_PATH}/audio-upload-url`,
};
const REGISTER_PATHS: Record<OwnerMedium, string> = {
  video: `${LIBRARY_PATH}/video`,
  audio: LIBRARY_PATH,
};
const itemPath = (id: number) => `${LIBRARY_PATH}/${id}`;

/* Every item, in the server's order (sort_order, then id). */
export async function listLibraryItems(): Promise<OwnerLibraryItem[]> {
  const { data } = await axiosClient.get<OwnerLibraryItem[]>(LIBRARY_PATH);
  return data;
}

export interface ItemChanges {
  title?: string;
  /* An empty description clears it (the route reads "" as none). */
  description?: string;
  enabled?: boolean;
}

/* Text fields go form-encoded, not multipart: multipart turns every line
   break into CR LF on the way, and a caption's breaks are kept as typed. */
function textForm(fields: Record<string, string | number | boolean | undefined>): URLSearchParams {
  const form = new URLSearchParams();
  Object.entries(fields).forEach(([field, value]) => {
    if (value !== undefined) form.append(field, String(value));
  });
  return form;
}

/* One PATCH of the fields given. */
export async function updateItem(id: number, changes: ItemChanges, signal?: AbortSignal): Promise<OwnerLibraryItem> {
  const { data } = await axiosClient.patch<OwnerLibraryItem>(itemPath(id), textForm({ ...changes }), { signal });
  return data;
}

/* Removes the row, then its files in storage (services/library_items.py
   delete_library_item). */
export async function deleteItem(id: number): Promise<void> {
  await axiosClient.delete(itemPath(id));
}

/* The grant schema caps the name (schemas/library_item.py:24). */
const MAX_ORIGINAL_FILENAME_LENGTH = 255;
export const originalFilename = (file: File) => file.name.slice(0, MAX_ORIGINAL_FILENAME_LENGTH);

export async function requestUploadGrant(medium: OwnerMedium, claim: UploadClaim, signal?: AbortSignal): Promise<UploadGrant> {
  const { data } = await axiosClient.post<UploadGrant>(GRANT_PATHS[medium], claim, { signal });
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
   signature is the permission. The signal stops it when the owner discards
   the post. */
export function putToStorage(
  grant: UploadGrant,
  file: File,
  onProgress: (loaded: number, total: number) => void,
  signal?: AbortSignal,
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new StorageUploadError("NETWORK"));
      return;
    }
    const request = new XMLHttpRequest();
    signal?.addEventListener("abort", () => request.abort(), { once: true });
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
export async function registerItem(
  medium: OwnerMedium,
  registration: Registration,
  signal?: AbortSignal,
): Promise<OwnerLibraryItem> {
  const { grant, claim } = registration;
  const form = textForm({
    [`${medium}_key`]: grant.object_key,
    [`${medium}_content_type`]: claim.content_type,
    [`${medium}_size_bytes`]: claim.size_bytes,
    [`${medium}_sha256`]: claim.sha256,
    [`${medium}_md5`]: claim.content_md5,
    [`${medium}_original_filename`]: claim.original_filename,
    duration_seconds: signedDuration(grant, claim),
    video_width: claim.width || undefined,
    video_height: claim.height || undefined,
    type: registration.type,
    title: registration.title,
    description: registration.description || undefined,
    enabled: false,
    published_at: new Date().toISOString(),
  });
  const { data } = await axiosClient.post<OwnerLibraryItem>(REGISTER_PATHS[medium], form, { signal });
  return data;
}

/* The last step: the cover, when there is one, and enabled=true in the same
   PATCH, which the server applies in one commit (services/library_items.py
   update_library_item). A refused cover leaves the post hidden. Multipart
   for the picture; it carries no text. */
export async function finishItem(
  id: number,
  cover: File | null,
  signal?: AbortSignal,
): Promise<OwnerLibraryItem> {
  const form = new FormData();
  if (cover) form.append("cover_image", cover, cover.name);
  form.append("enabled", "true");
  const { data } = await axiosClient.patch<OwnerLibraryItem>(itemPath(id), form, { signal });
  return data;
}
