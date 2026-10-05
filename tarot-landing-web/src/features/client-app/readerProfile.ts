/* A reader's profile as clients read it (ROUND54): her sign, her years
   reading, the languages she speaks and, only when she agreed to show it, her
   ethnicity (the server sends it only then, TAROT-BACKEND
   services/psychics.py _psychic_to_out). Nothing is said for a field the owner
   has not filled in. The twelve signs and their glyphs are the site's own
   (features/oracle/data/Signs.ts). Drawn by ReaderFacts.tsx. */
import { SIGNS } from "@/features/oracle/data/Signs";

/* The language every reader is taken to speak; the Readers card names her
   languages only when she speaks another. */
const ENGLISH = "English";

export type ZodiacSign = (typeof SIGNS)[number];

export const zodiacSignOf = (name: string | null | undefined): ZodiacSign | null =>
  SIGNS.find(sign => sign.name === name) ?? null;

export const yearsReadingLine = (years: number | null | undefined) =>
  years == null ? null : `${years} ${years === 1 ? "year" : "years"} reading`;

export const speaksLine = (languages: string[] | null | undefined) =>
  languages && languages.length > 0 ? `Speaks ${languages.join(", ")}` : null;

/* The Readers card's line: only when she speaks more than English. */
export const cardLanguagesLine = (languages: string[] | null | undefined) =>
  (languages ?? []).some(language => language !== ENGLISH) ? speaksLine(languages) : null;
