/* What the sign-in page says when signing in fails (ROUND38, ROUND35 rank 6).
   Only a real 400 from the server, its answer to a wrong email or password,
   is "Incorrect email or password." A 5xx, or no answer at all, is the general
   line: before, the page told her her password was wrong when the server was
   down. Any other refusal is shown in the server's words (an address it cannot
   read, 422; an unverified reader or admin account, 403), and a reader or
   admin account gets the website's own refusal (websiteSignIn.ts). */
import { isAxiosError } from "axios";
import { serverRefusal } from "../../lib/serverRefusal";
import { WebsiteSignInRefused } from "./websiteSignIn";

export const INCORRECT_CREDENTIALS = "Incorrect email or password.";
export const SIGN_IN_UNAVAILABLE = "Something went wrong. Please try again in a moment.";

export function loginRefusal(error: unknown): string {
  if (error instanceof WebsiteSignInRefused) return error.message;
  if (!isAxiosError(error) || !error.response) return SIGN_IN_UNAVAILABLE;
  const { status } = error.response;
  if (status === 400) return INCORRECT_CREDENTIALS;
  if (status >= 500) return SIGN_IN_UNAVAILABLE;
  return serverRefusal(error) ?? SIGN_IN_UNAVAILABLE;
}
