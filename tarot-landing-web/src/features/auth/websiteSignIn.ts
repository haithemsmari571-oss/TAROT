import { UserRole, type User } from "./types/auth.types";
import { clearTokens, decodeToken, getToken, isTokenExpired, saveUser } from "./utils/tokenStorage";

/* Who signs in on the website (ROUND31, B1 = A). A reader (PSYCHIC) or an
   admin (ADMIN) account has nothing here: the staff console is the CRM, which
   admits only the superadmin, so their sign-in ended on a dead end. The
   sign-in page refuses them with this line and keeps no token. The superadmin
   still goes on to the CRM, and the server's sign-in is unchanged, so the
   CRM's own sign-in works as before. */
export const WEBSITE_SIGN_IN_REFUSED = "This account can't sign in here.";

const REFUSED_ROLES: readonly string[] = [UserRole.PSYCHIC, UserRole.ADMIN];

export function signsInHere(role: string | undefined): boolean {
  return !REFUSED_ROLES.includes(role ?? "");
}

export class WebsiteSignInRefused extends Error {
  constructor() {
    super(WEBSITE_SIGN_IN_REFUSED);
    this.name = "WebsiteSignInRefused";
  }
}

/* A reader's or admin's session stored before the sign-in page refused them
   (ROUND32, decision 6) is refused the same way. The website ends it at once,
   on the first page it opens, whatever the address: the tokens go and the
   sign-in page shows the same line. Called by main.tsx before the first
   render, so no route (not even /admin/*'s hand-over to the CRM) ever sees it.
   The server is unchanged: the CRM signs in through the same endpoint and the
   superadmin's session is kept. */
const SIGN_IN_PATH = "/login";
let storedSessionRefused = false;

/* Also used for a token another tab stores later (the CRM shares the site's
   storage): AuthContext.tsx does not adopt one that does not sign in here. */
export function tokenSignsInHere(token: string): boolean {
  return signsInHere(decodeToken(token)?.role);
}

export function endRefusedStoredSession(): void {
  const token = getToken();
  if (!token || tokenSignsInHere(token)) return;
  clearTokens();
  storedSessionRefused = true;
  if (window.location.pathname !== SIGN_IN_PATH) {
    window.history.replaceState(null, "", SIGN_IN_PATH);
  }
}

/* Whether this page load ended such a session (the sign-in page's line). */
export function storedSessionWasRefused(): boolean {
  return storedSessionRefused;
}

/* A session stored without its user (ROUND33, ROUND32 decision 1). The CRM is
   served from the website's own host, so they share this storage, and its
   sign-in stores only the two tokens (crm/src/client/website-auth.ts
   saveWebsiteTokens). The website used to clear such a session on its first
   page, which signed the superadmin out of the CRM. It is now kept when it
   signs in here and has not expired, and AuthContext.tsx reads the user from
   /profile/me. A reader's or admin's session never gets this far:
   endRefusedStoredSession has already ended it. */
export type StoredSessionStart = "none" | "restore" | "fill-user" | "clear";

export function storedSessionStart(token: string | null, hasUser: boolean): StoredSessionStart {
  if (!token) return "none";
  if (isTokenExpired(token) || !tokenSignsInHere(token)) return "clear";
  return hasUser ? "restore" : "fill-user";
}

/* Keeps the user the server names beside the tokens, as the website's own
   sign-in does. A failed read leaves the stored session to its owner: the
   request interceptor already ends a session the server no longer accepts. */
export async function fillStoredUser(readUser: () => Promise<User>): Promise<User | null> {
  try {
    const user = await readUser();
    saveUser(user);
    return user;
  } catch {
    return null;
  }
}
