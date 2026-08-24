import axiosClient from "../../lib/axiosClient";

export interface LibraryAdminItem {
  id: number;
  key: string;
  type: string;
  title: string;
  description: string | null;
  audio_file_path: string;
  audio_url: string;
  audio_content_type: string;
  audio_size_bytes: number;
  audio_sha256: string;
  duration_seconds: number;
  cover_image_path: string | null;
  cover_url: string | null;
  cover_content_type: string | null;
  cover_size_bytes: number | null;
  sort_order: number;
  enabled: boolean;
  published_at: string | null;
  original_filename: string | null;
  created_at: string;
  updated_at: string;
}

export interface AudioUploadRequest {
  content_type: "audio/mpeg";
  size_bytes: number;
  sha256: string;
  content_md5: string;
  duration_seconds: number;
  original_filename: string;
}

export interface AudioUploadGrant {
  object_key: string;
  upload_url: string;
  method: "PUT";
  expires_in_seconds: number;
  headers: Record<string, string>;
}

export async function listLibraryItems() {
  const response = await axiosClient.get<LibraryAdminItem[]>("/admin/library-items");
  return response.data;
}

export async function createAudioUploadGrant(body: AudioUploadRequest) {
  const response = await axiosClient.post<AudioUploadGrant>(
    "/admin/library-items/audio-upload-url",
    body,
  );
  return response.data;
}

export async function createLibraryItem(form: FormData) {
  const response = await axiosClient.post<LibraryAdminItem>("/admin/library-items", form);
  return response.data;
}

export async function attachLibraryCover(itemId: number, form: FormData) {
  const response = await axiosClient.patch<LibraryAdminItem>(
    `/admin/library-items/${itemId}`,
    form,
  );
  return response.data;
}
