/* One UK clock for the app. Readers keep UK hours and every time the app shows
   is Europe/London whatever the browser's zone: the chats list's activity
   times and "Back at", the room's day separators and status, the reader
   profile's "Back at". */
import { messageDate } from "./useThreadConnection";

/** HH:MM in UK time, for a Date. */
export const ukClock = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", hour: "2-digit", minute: "2-digit" });
const ukLongDay = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", day: "numeric", month: "long", year: "numeric" });

// Older socket payloads use UTC without a suffix; messageDate reads those as
// UTC, so a server timestamp always lands on the UK clock.
/** HH:MM in UK time, for a server timestamp. */
export const clockAt = (value: string) => ukClock.format(messageDate(value));
/** "18 September 2026" in UK time, for a server timestamp. */
export const dayOf = (value: string) => ukLongDay.format(messageDate(value));

// en-GB abbreviates September as "Sept", so the short day is assembled from
// the parts of the plain English locale, whose months are three letters.
const ukShortDayParts = new Intl.DateTimeFormat("en", { timeZone: "Europe/London", day: "numeric", month: "short", year: "numeric" });
/** "18 Sep 2026" in UK time, for a server timestamp. */
export const shortDayOf = (value: string) => {
  const part = Object.fromEntries(ukShortDayParts.formatToParts(messageDate(value)).map(({ type, value }) => [type, value]));
  return `${part.day} ${part.month} ${part.year}`;
};
