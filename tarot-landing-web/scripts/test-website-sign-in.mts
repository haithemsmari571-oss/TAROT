/* Who signs in on the website (ROUND31, B1 = A; src/features/auth/websiteSignIn.ts).
   Run: node --experimental-transform-types scripts/test-website-sign-in.mts
   (the role list is a TypeScript enum, which plain type stripping cannot run). */
import assert from "node:assert/strict";
import { registerHooks } from "node:module";

// The app's modules import each other without the .ts ending, as Vite allows.
registerHooks({
  resolve(specifier, context, nextResolve) {
    try {
      return nextResolve(specifier, context);
    } catch (error) {
      if (specifier.startsWith(".")) return nextResolve(`${specifier}.ts`, context);
      throw error;
    }
  },
});

const { UserRole } = await import("../src/features/auth/types/auth.types.ts");
const { WEBSITE_SIGN_IN_REFUSED, WebsiteSignInRefused, signsInHere } = await import(
  "../src/features/auth/websiteSignIn.ts"
);
// Loaded before the fake window below: axios reads the platform once, on load.
const { INCORRECT_CREDENTIALS, SIGN_IN_UNAVAILABLE, loginRefusal } = await import(
  "../src/features/auth/signInRefusal.ts"
);

// A client and the superadmin sign in (the superadmin goes on to the CRM).
assert.equal(signsInHere(UserRole.USER), true);
assert.equal(signsInHere(UserRole.SUPERADMIN), true);
// A reader and an admin are refused.
assert.equal(signsInHere(UserRole.PSYCHIC), false);
assert.equal(signsInHere(UserRole.ADMIN), false);
// A token with no role keeps today's way (the reader list).
assert.equal(signsInHere(undefined), true);

// The refusal carries the owner's words, which the sign-in page shows.
assert.equal(WEBSITE_SIGN_IN_REFUSED, "This account can't sign in here.");
const refusal = new WebsiteSignInRefused();
assert.ok(refusal instanceof Error);
assert.equal(refusal.message, WEBSITE_SIGN_IN_REFUSED);

console.log("website sign-in: 8 checks passed");

/* A session stored before the refusal (ROUND32, decision 6; endRefusedStoredSession,
   called by main.tsx before the first render). A fake window and localStorage
   stand in for the browser; each case loads the module afresh, as a page load does. */
const TOKEN_KEY = "auth_token";
const REFRESH_TOKEN_KEY = "refresh_token";
const USER_KEY = "auth_user";

function jwtFor(role: string): string {
  const payload = Buffer.from(JSON.stringify({ sub: "7", role, exp: 4102444800 })).toString("base64url");
  return `e30.${payload}.signature`;
}

function pageLoad(path: string, stored: Record<string, string>) {
  const store = new Map(Object.entries(stored));
  const replaced: string[] = [];
  const location = { pathname: path };
  Object.assign(globalThis, {
    localStorage: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, value),
      removeItem: (key: string) => void store.delete(key),
    },
    window: {
      location,
      history: {
        replaceState: (_state: unknown, _title: string, url: string) => {
          replaced.push(url);
          location.pathname = url;
        },
      },
    },
  });
  return { store, replaced, location };
}

let loads = 0;
async function openSite(path: string, stored: Record<string, string>) {
  const page = pageLoad(path, stored);
  loads += 1;
  const rule = await import(`../src/features/auth/websiteSignIn.ts?load=${loads}`);
  rule.endRefusedStoredSession();
  return { ...page, refused: rule.storedSessionWasRefused() as boolean, rule };
}

const websiteSession = (role: string) => ({
  [TOKEN_KEY]: jwtFor(role),
  [REFRESH_TOKEN_KEY]: jwtFor(role),
  [USER_KEY]: JSON.stringify({ id: 7, role }),
});
let sessionChecks = 0;
const check = (ok: boolean, what: string) => {
  assert.ok(ok, what);
  sessionChecks += 1;
};

// A reader's and an admin's stored session end at once, on any page, /admin/* included.
for (const [role, path] of [
  [UserRole.PSYCHIC, "/admin/earnings"],
  [UserRole.PSYCHIC, "/app/home"],
  [UserRole.ADMIN, "/admin/chats"],
  [UserRole.ADMIN, "/home"],
] as const) {
  const site = await openSite(path, websiteSession(role));
  check(site.store.size === 0, `${role} on ${path}: every token cleared`);
  check(site.location.pathname === "/login" && site.replaced.join() === "/login", `${role} on ${path}: opens /login`);
  check(site.refused, `${role} on ${path}: the sign-in page shows the refusal`);
}

// Already on /login: cleared, the line shown, the address kept.
{
  const site = await openSite("/login", websiteSession(UserRole.ADMIN));
  check(site.store.size === 0 && site.refused && site.replaced.length === 0, "admin on /login: cleared in place");
}

// The superadmin keeps its session, stored by the website or by the CRM's own
// sign-in (crm/src/client/website-auth.ts saveWebsiteTokens: the two tokens, no user).
for (const stored of [
  websiteSession(UserRole.SUPERADMIN),
  { [TOKEN_KEY]: jwtFor(UserRole.SUPERADMIN), [REFRESH_TOKEN_KEY]: jwtFor(UserRole.SUPERADMIN) },
]) {
  const site = await openSite("/admin/chats", stored);
  check(site.store.size === Object.keys(stored).length && !site.refused, "superadmin: session kept");
  check(site.location.pathname === "/admin/chats" && site.replaced.length === 0, "superadmin: still goes on to the CRM hand-over");
}

// A client keeps hers; no session, or one this rule cannot read, is left to the old handling.
for (const [stored, what] of [
  [websiteSession(UserRole.USER), "client"],
  [{}, "no session"],
  [{ [TOKEN_KEY]: "not-a-jwt" }, "unreadable token"],
] as const) {
  const site = await openSite("/app/home", stored);
  check(site.store.size === Object.keys(stored).length && !site.refused && site.replaced.length === 0, `${what}: untouched`);
}

// A token another tab stores later: only a client's or the superadmin's is adopted.
{
  const { rule } = await openSite("/home", {});
  check(rule.tokenSignsInHere(jwtFor(UserRole.USER)) && rule.tokenSignsInHere(jwtFor(UserRole.SUPERADMIN)), "a client or superadmin token is adopted");
  check(!rule.tokenSignsInHere(jwtFor(UserRole.PSYCHIC)) && !rule.tokenSignsInHere(jwtFor(UserRole.ADMIN)), "a reader or admin token is not");
}

console.log(`stored sessions: ${sessionChecks} checks passed`);

/* A session stored without its user (ROUND33, ROUND32 decision 1;
   storedSessionStart and fillStoredUser, used by AuthContext.tsx on start).
   The CRM on the same host stores only the two tokens; the website keeps such
   a session when it signs in here and reads the user, instead of clearing it. */
let userChecks = 0;
const checkUser = (ok: boolean, what: string) => {
  assert.ok(ok, what);
  userChecks += 1;
};
const expiredJwtFor = (role: string) =>
  `e30.${Buffer.from(JSON.stringify({ sub: "7", role, exp: 1 })).toString("base64url")}.signature`;
const crmSession = (role: string) => ({ [TOKEN_KEY]: jwtFor(role), [REFRESH_TOKEN_KEY]: jwtFor(role) });

{
  const { rule } = await openSite("/home", {});
  checkUser(rule.storedSessionStart(jwtFor(UserRole.SUPERADMIN), false) === "fill-user", "the CRM's superadmin session is kept and its user read");
  checkUser(rule.storedSessionStart(jwtFor(UserRole.USER), false) === "fill-user", "a client's token-only session is kept and its user read");
  checkUser(rule.storedSessionStart(jwtFor(UserRole.SUPERADMIN), true) === "restore" && rule.storedSessionStart(jwtFor(UserRole.USER), true) === "restore", "a session with its user is restored, as before");
  checkUser(rule.storedSessionStart(expiredJwtFor(UserRole.SUPERADMIN), false) === "clear" && rule.storedSessionStart(expiredJwtFor(UserRole.USER), true) === "clear", "an expired session is cleared, as before");
  checkUser(rule.storedSessionStart(jwtFor(UserRole.PSYCHIC), false) === "clear" && rule.storedSessionStart(jwtFor(UserRole.ADMIN), false) === "clear", "a reader's or admin's token-only session is never kept");
  checkUser(rule.storedSessionStart("not-a-jwt", false) === "clear", "an unreadable token is cleared, as before");
  checkUser(rule.storedSessionStart(null, false) === "none" && rule.storedSessionStart(null, true) === "none", "no token: nothing to do");
}

// On a real page load a reader's or admin's CRM-form session never reaches it:
// main.tsx's endRefusedStoredSession ends it first, with the line.
for (const role of [UserRole.PSYCHIC, UserRole.ADMIN]) {
  const site = await openSite("/home", crmSession(role));
  checkUser(site.store.size === 0 && site.refused && site.location.pathname === "/login", `${role} in the CRM's form: still refused`);
}

// The fill keeps the server's user beside the untouched tokens.
{
  const stored = crmSession(UserRole.SUPERADMIN);
  const site = await openSite("/home", stored);
  const me = { id: 7, role: UserRole.SUPERADMIN, username: "superadmin" };
  const filled = await site.rule.fillStoredUser(async () => me);
  checkUser(filled === me, "the fill returns the server's user");
  checkUser(site.store.get(USER_KEY) === JSON.stringify(me), "auth_user now holds it");
  checkUser(site.store.get(TOKEN_KEY) === stored[TOKEN_KEY] && site.store.get(REFRESH_TOKEN_KEY) === stored[REFRESH_TOKEN_KEY], "both tokens untouched");
}

// A failed read writes nothing and leaves the stored session to its owner.
{
  const stored = crmSession(UserRole.SUPERADMIN);
  const site = await openSite("/home", stored);
  const filled = await site.rule.fillStoredUser(async () => { throw new Error("Network Error"); });
  checkUser(filled === null && !site.store.has(USER_KEY), "a failed read writes no user");
  checkUser(site.store.size === 2 && site.store.get(TOKEN_KEY) === stored[TOKEN_KEY], "a failed read keeps the tokens");
}

console.log(`sessions without a user: ${userChecks} checks passed`);

/* The sign-in page's error line (ROUND38, ROUND35 rank 6; src/features/auth/
   signInRefusal.ts). "Incorrect email or password." only for a real 400 from
   the server; for a 5xx or no answer at all, the general line; any other
   refusal in the server's words, never the wrong-password line. */
let refusalChecks = 0;
const checkRefusal = (actual: string, expected: string, what: string) => {
  assert.equal(actual, expected, what);
  refusalChecks += 1;
};
const answered = (status: number, data: unknown) => ({ isAxiosError: true, message: `Request failed with status code ${status}`, response: { status, data } });

checkRefusal(INCORRECT_CREDENTIALS, "Incorrect email or password.", "the wrong-password line");
checkRefusal(SIGN_IN_UNAVAILABLE, "Something went wrong. Please try again in a moment.", "the general line");
checkRefusal(
  loginRefusal(answered(400, { message: "User with that email or password doesn't exist, Verify your credentials." })),
  INCORRECT_CREDENTIALS,
  "a real 400: wrong email or password",
);
for (const status of [500, 502, 503, 504]) {
  checkRefusal(loginRefusal(answered(status, "<html><center>502 Bad Gateway</center></html>")), SIGN_IN_UNAVAILABLE, `a ${status}: the general line`);
}
checkRefusal(loginRefusal(answered(500, { detail: "Internal server error" })), SIGN_IN_UNAVAILABLE, "a 500 with words: still the general line");
checkRefusal(loginRefusal({ isAxiosError: true, message: "Network Error", code: "ERR_NETWORK" }), SIGN_IN_UNAVAILABLE, "no answer at all");
checkRefusal(loginRefusal(new Error("Failed to decode token")), SIGN_IN_UNAVAILABLE, "a token that cannot be read");
checkRefusal(
  loginRefusal(answered(403, { message: "Account not verified, please verify your account to login" })),
  "Account not verified, please verify your account to login",
  "an unverified reader's 403: the server's words",
);
checkRefusal(
  loginRefusal(answered(422, { detail: [{ msg: "Value error, value is not a valid email address" }] })),
  "value is not a valid email address",
  "a 422: the server's words",
);
checkRefusal(loginRefusal(answered(429, "")), SIGN_IN_UNAVAILABLE, "a refusal with no words: the general line");
checkRefusal(loginRefusal(new WebsiteSignInRefused()), WEBSITE_SIGN_IN_REFUSED, "a reader or admin account: the website's refusal");

console.log(`sign-in error line: ${refusalChecks} checks passed`);
