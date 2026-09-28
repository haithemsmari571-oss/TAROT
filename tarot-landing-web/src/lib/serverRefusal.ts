/* The backend's own words when it refuses a request: the one reading every
   screen uses. A DomainError answers {message} (main.py
   domain_exception_handler); an HTTPException answers {detail: string}; a
   schema refusal is a 422 whose detail is a list of {msg} lines, each behind
   Pydantic's "Value error, " framing. Always text, never the list itself:
   React cannot draw an object, and one drawn blanks the page. */
import { isAxiosError } from "axios";

/** When there is no answer to quote: the request never reached the server. */
export const REFUSAL_FALLBACK = "Something went wrong. Please try again.";

/** The server's words, or undefined when it gave none. */
export function serverRefusal(error: unknown): string | undefined {
  if (!isAxiosError(error) || !error.response) return undefined;
  const data = error.response.data as { message?: unknown; detail?: unknown } | undefined;
  if (typeof data?.message === "string") return data.message;
  if (typeof data?.detail === "string") return data.detail;
  if (Array.isArray(data?.detail)) {
    const lines = data.detail
      .map(item => (typeof (item as { msg?: unknown })?.msg === "string" ? (item as { msg: string }).msg.replace(/^Value error, /, "") : null))
      .filter((line): line is string => line !== null);
    if (lines.length > 0) return lines.join(" ");
  }
  return undefined;
}
