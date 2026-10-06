/* Visitor statistics (ROUND61): Umami, self-hosted beside the site
   (docker-compose.umami.yml), with no cookie and nothing that names a visitor.

   Counted: a page view for every address of the public pages and of the app
   at /app, and the six events of AnalyticsEvent, each sent once where it truly
   happens. Never counted: the owner's phone admin (owner.html never loads the
   tracker, and an /owner address reached inside the site is dropped) and the
   web admin at /admin.

   Sent: the address with its query and hash dropped and the sign-in tokens and
   chat numbers in it masked (cleanPath), the page title, the referring site
   (only its address), the screen size and the language. Never an email, a
   name, an account number or a message: no event carries more than a top-up's
   band. A browser that asks Do Not Track sends nothing (data-do-not-track).

   The tracker and its collect address are the site's own (nginx.conf, the /av/
   locations), so they load like any other file of the site. Files that cannot
   import this one name the same values: nginx.conf (ANALYTICS_SCRIPT and the
   collect address /av/e), docker-compose.umami.yml (the collect address, from
   the script's folder), TAROT-BACKEND app/routers/public_seo.py (the tag on the
   article pages, which the backend draws without this app) and
   scripts/umami/start.sh (reads ANALYTICS_WEBSITE_ID here to create the site
   in Umami).

   Nothing here touches the browser when the module loads: the sign-up, top-up
   and push files that import it are also in the prerender's build. */
import { isOwnerPath } from "@/features/owner/ownerPaths";
import { STARDUST_MIN_USD, STARDUST_TIERS } from "@/features/payment/stardustTiers";
import { formatGbp } from "@/lib/currency";

/** The site in Umami, created with this id by scripts/umami/start.sh. */
export const ANALYTICS_WEBSITE_ID = "43e0254c-8130-4685-8fd1-bc7ea2ddd17a";
/** Umami's tracker, served by the site itself (nginx.conf). */
export const ANALYTICS_SCRIPT = "/av/s.js";
/** Only the live site counts: a dev server or any other copy sends nothing. */
const SITE_HOSTS = ["askvalentina.co.uk", "www.askvalentina.co.uk"];
/** The window function the tracker hands every payload to (data-before-send). */
const BEFORE_SEND = "avAnalyticsBeforeSend";

export type AnalyticsEvent =
  /** the account was created (useRegister.ts) */
  | "signup_completed"
  /** her first message ever, in any thread, as the server counts it (useThreadConnection.ts) */
  | "first_message_sent"
  /** the checkout is open and she is on her way to Stripe (usePayment.ts) */
  | "topup_started"
  /** back from Stripe with the payment taken, with its band only (startAnalytics) */
  | "topup_completed"
  /** the app opened from the home screen for the first time on this device (startAnalytics) */
  | "app_installed"
  /** she turned on phone notifications in the app (webPush.ts) */
  | "notifications_enabled";

/* A top-up's amount is sent as a band, never the amount: from the site
   minimum, two steps of the band's own, then the first amount of each bonus
   tier (stardustTiers.ts). Amounts are whole pounds, so "£20-£49" is 20 to 49.
   The last band runs to the top of the slider, so no band is one amount. */
const BAND_FLOORS = [STARDUST_MIN_USD, 20, 50, ...STARDUST_TIERS.map(tier => tier.minUsd)];
export const TOPUP_BANDS = BAND_FLOORS.map((floor, index) => {
  const next = BAND_FLOORS[index + 1];
  return next === undefined ? `${formatGbp(floor)} and over` : `${formatGbp(floor)}-${formatGbp(next - 1)}`;
});
function bandIndex(pounds: number): number {
  return BAND_FLOORS.reduce((found, floor, index) => (pounds >= floor ? index : found), 0);
}
export const amountBand = (pounds: number) => TOPUP_BANDS[bandIndex(pounds)];

/* The band rides to Stripe and back on the top-up's return address
   (TopUpContext.tsx), as its number in TOPUP_BANDS, so the return needs
   nothing kept on the device. The server appends "&status=success" or
   "&status=cancelled" (payments.py checkout_return_urls). */
const TOPUP_BAND_PARAM = "topup_band";
export function withTopUpBand(returnUrl: string, pounds: number): string {
  return `${returnUrl}${returnUrl.includes("?") ? "&" : "?"}${TOPUP_BAND_PARAM}=${bandIndex(pounds)}`;
}

/* The return from Stripe is a page load: the band is taken off the address
   before the router reads it, so a reload never counts the payment twice. */
function takeTopUpReturn(): string | null {
  const url = new URL(window.location.href);
  const index = url.searchParams.get(TOPUP_BAND_PARAM);
  if (index === null) return null;
  url.searchParams.delete(TOPUP_BAND_PARAM);
  window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
  const band = /^\d+$/.test(index) ? TOPUP_BANDS[Number(index)] : undefined;
  return band !== undefined && url.searchParams.get("status") === "success" ? band : null;
}

/* app_installed: the first time the app opens from the home screen on this
   device. The one thing this file keeps on the device, a flag with no identity
   in it, so the event is sent once. */
const HOME_SCREEN_OPENED_KEY = "av.homeScreenOpened";
function firstHomeScreenOpen(fromHomeScreen: boolean): boolean {
  if (!fromHomeScreen) return false;
  try {
    if (localStorage.getItem(HOME_SCREEN_OPENED_KEY) === "1") return false;
    localStorage.setItem(HOME_SCREEN_OPENED_KEY, "1");
    return true;
  } catch {
    return false; // storage refused: not counted, rather than counted on every open
  }
}

/* The parts of an address that point at one person: a sign-in or
   email-confirmation token and a conversation's number, each replaced by its
   kind. Reader numbers and article names stay: those are public pages. */
const MASKS: [RegExp, string][] = [
  [/^\/(reset-password|verify-email)\/[^/]+/i, "/$1/:token"],
  [/^\/((?:app\/)?chats)\/\d+/i, "/$1/:chat"],
];
export const cleanPath = (path: string) => MASKS.reduce((out, [pattern, mask]) => out.replace(pattern, mask), path);

/** Not counted: the owner's phone admin and the web admin. */
export const isCounted = (path: string) => !isOwnerPath(path) && !/^\/admin(?:\/|$)/i.test(path);

/* The referring page: a page of this site as its masked path (none for a
   page that is never counted), any other site as its address alone. */
function cleanReferrer(referrer: string): string {
  try {
    const from = new URL(referrer, window.location.origin);
    if (from.origin !== window.location.origin) return `${from.origin}/`;
    return isCounted(from.pathname) ? cleanPath(from.pathname) : "";
  } catch {
    return "";
  }
}

type Payload = Record<string, unknown>;
/* Every page view and event passes here before it leaves (data-before-send).
   null drops it. */
export function beforeSend(_type: string, payload: Payload): Payload | null {
  const url = typeof payload.url === "string" ? new URL(payload.url, window.location.origin) : null;
  if (!isCounted(url?.pathname ?? window.location.pathname)) return null;
  const kept: Payload = { ...payload, id: undefined };
  if (url) kept.url = `${url.origin}${cleanPath(url.pathname)}`;
  if (typeof kept.referrer === "string" && kept.referrer) kept.referrer = cleanReferrer(kept.referrer);
  return kept;
}

interface Tracker {
  track: (name: string, data?: Record<string, string>) => Promise<void>;
}
const tracker = () => (window as Window & { umami?: Tracker }).umami;
let started = false;
/* Events sent before the tracker has arrived, sent when it does. */
const waiting: [AnalyticsEvent, Record<string, string> | undefined][] = [];

function send(name: AnalyticsEvent, data: Record<string, string> | undefined, umami: Tracker) {
  umami.track(name, data).catch(() => { /* a lost count never reaches a screen */ });
}

/** One of the six events. Nothing at all where the tracker is not loaded. */
export function trackEvent(name: AnalyticsEvent, data?: Record<string, string>): void {
  if (!started) return;
  const umami = tracker();
  if (umami) send(name, data, umami);
  else waiting.push([name, data]);
}

/* Called once by main.tsx, before the router reads the address, with whether
   this page opened from the home screen (useInstallPrompt.ts runsStandalone).
   The tracker is loaded on the live site's public pages and app, after the
   page (async), and counts the first page view and every address the app
   moves to. */
export function startAnalytics(fromHomeScreen: boolean): void {
  const topUpBand = takeTopUpReturn();
  if (!import.meta.env.PROD || !SITE_HOSTS.includes(window.location.hostname) || !isCounted(window.location.pathname)) return;
  (window as unknown as Record<string, unknown>)[BEFORE_SEND] = beforeSend;
  const script = document.createElement("script");
  script.async = true;
  script.src = ANALYTICS_SCRIPT;
  Object.assign(script.dataset, {
    websiteId: ANALYTICS_WEBSITE_ID,
    domains: SITE_HOSTS.join(","),
    doNotTrack: "true",
    excludeSearch: "true",
    excludeHash: "true",
    beforeSend: BEFORE_SEND,
  });
  script.addEventListener("load", () => {
    const umami = tracker();
    if (umami) waiting.splice(0).forEach(([name, data]) => send(name, data, umami));
  });
  document.head.appendChild(script);
  started = true;
  if (topUpBand) trackEvent("topup_completed", { band: topUpBand });
  if (firstHomeScreenOpen(fromHomeScreen)) trackEvent("app_installed");
}
