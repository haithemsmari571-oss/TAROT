import axiosClient from "@/lib/axiosClient";

/* The owner's reader routes (ROUND54), called with the owner's token. Every
   route is superadmin-only on the server and answers {"detail": "<CODE>"} when
   it refuses (TAROT-BACKEND routers/owner_readers.py). The fields go as one
   JSON text in a multipart form beside the photo, so a bio's line breaks are
   kept as typed (multipart would turn them into CR LF). */

export interface ReaderCategory {
  id: number;
  title: string;
}

/* Everything the owner sees of a reader. */
export interface OwnerReader {
  id: number;
  /* Her username, which clients see as her name. */
  name: string;
  email: string;
  picture_url: string | null;
  bio: string | null;
  price_per_message: number | null;
  categories: ReaderCategory[];
  is_listed: boolean;
  /* As stored: her countries ("GB,RO", client-app/countries.ts), or free text
     kept from before ROUND56, which the form shows as "Was: …". */
  ethnicity: string | null;
  years_experience: number | null;
  zodiac_sign: string | null;
  languages: string[];
}

export interface OwnerReaderList {
  items: OwnerReader[];
  /* What a new reader's form starts at. */
  defaults: { price_per_message: number; languages: string[] };
  /* The form's limits, the server's own. */
  limits: { ethnicity_max_countries: number; years_experience_max: number; language_name_max_length: number };
}

/* The fields a change sends; only those present change. null clears. */
export interface ReaderChanges {
  name?: string;
  bio?: string | null;
  price_per_message?: number;
  categories_ids?: number[];
  ethnicity?: string | null;
  years_experience?: number | null;
  zodiac_sign?: string | null;
  languages?: string[];
  is_listed?: boolean;
}

export interface NewReader extends ReaderChanges {
  name: string;
  email: string;
}

export interface OwnerReaderCreated extends OwnerReader {
  /* The email with her set-your-password link went out. */
  password_email_sent: boolean;
}

const READERS_PATH = "/admin/readers";
const readerPath = (id: number) => `${READERS_PATH}/${id}`;

function readerForm(fields: ReaderChanges | null, photo: File | null): FormData {
  const form = new FormData();
  if (fields) form.append("reader", JSON.stringify(fields));
  if (photo) form.append("photo", photo);
  return form;
}

const MULTIPART = { headers: { "Content-Type": "multipart/form-data" } };

export async function listReaders(): Promise<OwnerReaderList> {
  const { data } = await axiosClient.get<OwnerReaderList>(READERS_PATH);
  return data;
}

export async function createReader(reader: NewReader, photo: File): Promise<OwnerReaderCreated> {
  const { data } = await axiosClient.post<OwnerReaderCreated>(READERS_PATH, readerForm(reader, photo), MULTIPART);
  return data;
}

export async function updateReader(id: number, changes: ReaderChanges | null, photo: File | null = null): Promise<OwnerReader> {
  const { data } = await axiosClient.patch<OwnerReader>(readerPath(id), readerForm(changes, photo), MULTIPART);
  return data;
}
