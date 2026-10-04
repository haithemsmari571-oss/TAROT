import { MAX_TITLE_LENGTH } from "./ownerMedia";

/* The caption, one box as on Instagram (ROUND51). Its first line is the post's
   title and the rest is its description, line breaks kept. The same rule
   serves a new post and the edit of one already posted. */

/* Instagram's own caption limit. The server sets none on the description (a
   Text column, no schema maximum); the title keeps its 100. */
export const MAX_CAPTION_LENGTH = 2200;

export interface CaptionParts {
  /* The first line, trimmed and, past MAX_TITLE_LENGTH, cut at a word
     boundary. Empty when the caption has no words yet. */
  title: string;
  /* Everything after the title: the end of a cut first line, then the lines
     below it, line breaks kept, trimmed at both ends as the server trims it. */
  description: string;
  titleCut: boolean;
}

const isSpace = (character: string | undefined) => character !== undefined && /\s/.test(character);
const isHighSurrogate = (code: number) => code >= 0xd800 && code <= 0xdbff;

/* Cut at the last space within the limit; a single word longer than the limit
   is cut at the limit, never inside an emoji. */
function cutTitle(line: string): { title: string; overflow: string } {
  if (line.length <= MAX_TITLE_LENGTH) return { title: line, overflow: "" };
  for (let index = MAX_TITLE_LENGTH; index > 0; index -= 1) {
    if (isSpace(line[index])) return { title: line.slice(0, index).trimEnd(), overflow: line.slice(index).trim() };
  }
  const end = isHighSurrogate(line.charCodeAt(MAX_TITLE_LENGTH - 1)) ? MAX_TITLE_LENGTH - 1 : MAX_TITLE_LENGTH;
  return { title: line.slice(0, end), overflow: line.slice(end) };
}

export function splitCaption(caption: string): CaptionParts {
  // Blank lines before the first words are not the first line.
  const text = caption.replace(/\r\n?/g, "\n").replace(/^(?:[^\S\n]*\n)+/, "");
  const lineEnd = text.indexOf("\n");
  const firstLine = (lineEnd === -1 ? text : text.slice(0, lineEnd)).trim();
  const below = lineEnd === -1 ? "" : text.slice(lineEnd + 1);
  const { title, overflow } = cutTitle(firstLine);
  const description = (overflow && below ? `${overflow}\n${below}` : overflow || below).trim();
  return { title, description, titleCut: firstLine.length > MAX_TITLE_LENGTH };
}

/* Line breaks as a textarea holds them. A description saved through a
   multipart form, as the CRM's library form sends it, holds CR LF. */
export const plainLines = (text: string | null) => (text ?? "").replace(/\r\n?/g, "\n");

/* A post's caption as the owner wrote it: the title, then the description on
   the lines below. splitCaption gives the same title and description back. */
export function joinCaption(title: string, description: string | null): string {
  const below = plainLines(description);
  return below ? `${title}\n${below}` : title;
}

export const formatCaptionCount = (length: number) =>
  `${length.toLocaleString("en-GB")}/${MAX_CAPTION_LENGTH.toLocaleString("en-GB")}`;
