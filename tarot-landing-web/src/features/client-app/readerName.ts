/* A reader's name as clients see it. A reader has no display name apart from
   her username. When the username reads as a name (words of letters, an
   apostrophe may join letters, single spaces between words) it is her display
   name. Any other username (end_control_reader_fee70ab6, sophie-moon-2) is a
   handle with no display name in it, so she is named by its first name part,
   never by the raw username. Title case, as the card writes names. The emails
   use the same rule (TAROT-BACKEND app/services/reply_emails.py reader_name). */
const NAME_WORD = "\\p{L}+(?:['\u2019]\\p{L}+)*";
const DISPLAY_NAME = new RegExp(`^${NAME_WORD}(?: ${NAME_WORD})*$`, "u");
const FIRST_NAME_PART = new RegExp(NAME_WORD, "u");

export function readerDisplayName(username: string | null | undefined): string {
  const trimmed = (username ?? "").trim();
  const name = DISPLAY_NAME.test(trimmed) ? trimmed : (trimmed.match(FIRST_NAME_PART)?.[0] ?? "");
  return name ? name.charAt(0).toUpperCase() + name.slice(1).toLowerCase() : "";
}
