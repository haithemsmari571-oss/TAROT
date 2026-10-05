import { useQuery, type QueryClient } from "@tanstack/react-query";
import { isAxiosError } from "axios";
import { formatGbp } from "@/lib/currency";
import {
  listReaders,
  type NewReader,
  type OwnerReader,
  type OwnerReaderList,
  type ReaderChanges,
} from "./ownerReadersApi";

/* Readers on the owner's phone (ROUND54): the list, the form's state, what a
   save sends, and the lines a refusal shows. */

export const OWNER_READERS_QUERY_KEY = ["owner-readers"] as const;

export function useOwnerReaders() {
  return useQuery({ queryKey: OWNER_READERS_QUERY_KEY, queryFn: listReaders });
}

/* A saved reader into the list already read, so going back shows her as saved. */
export function keepReader(queryClient: QueryClient, reader: OwnerReader) {
  queryClient.setQueryData<OwnerReaderList>(OWNER_READERS_QUERY_KEY, (list) => {
    if (!list) return list;
    const known = list.items.some((item) => item.id === reader.id);
    return { ...list, items: known ? list.items.map((item) => (item.id === reader.id ? reader : item)) : [reader, ...list.items] };
  });
}

/* The form stops new typing at this many characters. A longer bio already
   stored is shown whole and kept unless it is changed. */
export const READER_BIO_MAX_LENGTH = 300;

/* The languages offered as chips, in this order; "Add another" adds any other. */
export const LANGUAGE_CHOICES = [
  "English", "French", "Arabic", "Spanish", "Italian", "German",
  "Portuguese", "Polish", "Romanian", "Turkish", "Urdu", "Hindi",
] as const;

export const priceLine = (price: number | null) => (price == null ? "No price set" : `${formatGbp(price)} per message`);

const REFUSAL_LINES: Record<string, string> = {
  NAME_TAKEN: "Another account already has this name. Add a surname or an initial.",
  EMAIL_TAKEN: "This email already has an account.",
  PHOTO_NOT_ACCEPTED: "This photo cannot be used. Choose a JPEG, PNG or WebP photo.",
  PHOTO_TOO_LARGE: "This photo is too big. Choose a smaller one.",
  UNKNOWN_CATEGORY: "A speciality is no longer there. Go back and open her again.",
  READER_NOT_FOUND: "This reader is not here any more.",
};
const NOT_SAVED = "It did not save. Try again.";
const CHECK_FIELDS = "Something in the form cannot be saved. Check it and try again.";

/* The server's refusal as one plain line. */
export function readerRefusal(error: unknown): string {
  if (!isAxiosError(error)) return NOT_SAVED;
  const detail = (error.response?.data as { detail?: unknown } | undefined)?.detail;
  if (typeof detail === "string" && REFUSAL_LINES[detail]) return REFUSAL_LINES[detail];
  return error.response?.status === 422 ? CHECK_FIELDS : NOT_SAVED;
}

/* What the form holds while it is edited. */
export interface ReaderDraft {
  name: string;
  bio: string;
  price: string;
  categoryIds: number[];
  ethnicity: string;
  showEthnicity: boolean;
  years: number | null;
  zodiac: string | null;
  languages: string[];
  email: string;
}

const priceText = (price: number | null) => (price == null ? "" : price.toFixed(2));

export function draftOf(reader: OwnerReader | null, defaults: OwnerReaderList["defaults"]): ReaderDraft {
  if (!reader) {
    return {
      name: "", bio: "", price: priceText(defaults.price_per_message), categoryIds: [], ethnicity: "",
      showEthnicity: false, years: null, zodiac: null, languages: [...defaults.languages], email: "",
    };
  }
  return {
    name: reader.name,
    bio: reader.bio ?? "",
    price: priceText(reader.price_per_message),
    categoryIds: reader.categories.map((category) => category.id),
    ethnicity: reader.ethnicity ?? "",
    showEthnicity: reader.show_ethnicity,
    years: reader.years_experience,
    zodiac: reader.zodiac_sign,
    languages: [...reader.languages],
    email: reader.email,
  };
}

const singleSpaced = (text: string) => text.trim().split(/\s+/).filter(Boolean).join(" ");

/* Pounds above £0 with at most two decimals ("2.5", "2.50", "3"), else null. */
export function parsePrice(text: string): number | null {
  const trimmed = text.trim();
  if (!/^\d+(?:\.\d{1,2})?$/.test(trimmed)) return null;
  const price = Number(trimmed);
  return price > 0 ? price : null;
}

const sameList = <T,>(a: T[], b: T[]) => a.length === b.length && a.every((item, index) => item === b[index]);
const sortedIds = (ids: number[]) => [...ids].sort((x, y) => x - y);

/* The tick counts only with an ethnicity to show (the server's rule too). */
const shownWith = (draft: ReaderDraft) => draft.showEthnicity && singleSpaced(draft.ethnicity) !== "";

/* A new reader's fields. */
export function newReaderOf(draft: ReaderDraft): NewReader {
  return {
    name: singleSpaced(draft.name),
    email: draft.email.trim(),
    bio: draft.bio.trim() || null,
    price_per_message: parsePrice(draft.price) ?? undefined,
    categories_ids: draft.categoryIds,
    ethnicity: singleSpaced(draft.ethnicity) || null,
    show_ethnicity: shownWith(draft),
    years_experience: draft.years,
    zodiac_sign: draft.zodiac,
    languages: draft.languages,
  };
}

/* Only what differs from her as saved, so an untouched long bio or an
   untouched empty field is never sent. */
export function changesOf(draft: ReaderDraft, reader: OwnerReader): ReaderChanges {
  const changes: ReaderChanges = {};
  const name = singleSpaced(draft.name);
  if (name !== reader.name) changes.name = name;
  if (draft.bio !== (reader.bio ?? "")) changes.bio = draft.bio.trim() || null;
  const price = parsePrice(draft.price);
  if (price !== null && price !== reader.price_per_message) changes.price_per_message = price;
  if (!sameList(sortedIds(draft.categoryIds), sortedIds(reader.categories.map((category) => category.id)))) {
    changes.categories_ids = draft.categoryIds;
  }
  const ethnicity = singleSpaced(draft.ethnicity) || null;
  if (ethnicity !== reader.ethnicity) changes.ethnicity = ethnicity;
  if (shownWith(draft) !== reader.show_ethnicity) changes.show_ethnicity = shownWith(draft);
  if (draft.years !== reader.years_experience) changes.years_experience = draft.years;
  if (draft.zodiac !== reader.zodiac_sign) changes.zodiac_sign = draft.zodiac;
  if (!sameList(draft.languages, reader.languages)) changes.languages = draft.languages;
  return changes;
}
