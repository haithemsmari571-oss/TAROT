/* The rules behind the app's asks (ROUND59): which sheet a visit brings,
   what the app pill says, where Safari keeps its Share button, and how to
   undo a browser's no. Pure, and nothing here touches the browser when the
   module loads, so scripts/test-app-asks.mts runs them in Node. The visit
   itself is useAppAsks.ts; the sheets and the pill are AppSheets.tsx. */
import type { PushState } from "@/features/push/webPush";
import type { InstallRoute } from "./useInstallPrompt";

/** Away from the app for longer than this, coming back is a new visit. */
export const NEW_VISIT_AFTER_MS = 30 * 60 * 1000;
/** A sheet waits this long after the screen has settled. */
export const SETTLE_MS = 2000;

export type AskSheet = "install" | "notify";

/* A visit's one sheet: the home screen first, where this browser can add the
   app (Chrome's offer, or an iPhone or iPad); otherwise notifications, while
   they are off and the browser has not blocked them; otherwise nothing. An
   iPhone in Safari always lands on the home screen sheet, since push only
   works from the home-screen app there. */
export function visitAsk(route: InstallRoute, push: PushState): AskSheet | null {
  if (route) return "install";
  if (push === "off") return "notify";
  return null;
}

/* Right after a message she sent: notifications, the moment they matter most;
   on an iPhone in Safari, where they cannot work yet, the home screen sheet. */
export function afterMessageAsk(route: InstallRoute, push: PushState): AskSheet | null {
  if (push === "off") return "notify";
  if (push === "home-screen-first" && route) return "install";
  return null;
}

/** Still worth showing now: the browser can still add the app, or notifications are still off. */
export function askApplies(sheet: AskSheet, route: InstallRoute, push: PushState): boolean {
  return sheet === "install" ? route !== null : push === "off";
}

/* One visit's asks. `shown`: the sheets this visit has shown (a tap on the
   pill counts); `decided`: the visit's own sheet has had its turn;
   `afterMessage`: the ask after a sent message has had its turn; `waiting`:
   the sheet due at the next calm moment, with the reader she wrote to. */
export interface WaitingAsk { sheet: AskSheet; reader: string | null }
export interface VisitAsks {
  shown: AskSheet[];
  decided: boolean;
  afterMessage: boolean;
  waiting: WaitingAsk | null;
}
export const freshVisit = (): VisitAsks => ({ shown: [], decided: false, afterMessage: false, waiting: null });

/* The visit's own sheet, once push is known: none if the visit has already
   shown one (the pill), else the order of visitAsk. */
export function decideVisit(state: VisitAsks, route: InstallRoute, push: PushState): VisitAsks {
  if (state.decided || push === "checking") return state;
  const sheet = state.shown.length === 0 && !state.waiting ? visitAsk(route, push) : null;
  return { ...state, decided: true, waiting: sheet ? { sheet, reader: null } : state.waiting };
}

/* Her first message of the visit: the ask after it, unless this visit has
   already shown that very sheet ("Not now" holds until the next visit). It
   takes the place of a visit sheet still waiting, so a visit never brings
   both at once. Later messages of the same visit bring nothing. */
export function messageSent(state: VisitAsks, route: InstallRoute, push: PushState, reader: string): VisitAsks {
  if (state.afterMessage) return state;
  const sheet = afterMessageAsk(route, push);
  if (!sheet || state.shown.includes(sheet)) return { ...state, afterMessage: true };
  return { ...state, decided: true, afterMessage: true, waiting: { sheet, reader } };
}

/** A sheet has opened (by the visit, after a message, or from the pill). */
export function opened(state: VisitAsks, sheet: AskSheet): VisitAsks {
  return {
    ...state,
    decided: true,
    shown: state.shown.includes(sheet) ? state.shown : [...state.shown, sheet],
    waiting: state.waiting?.sheet === sheet ? null : state.waiting,
  };
}

/* The pill on Home and Chats: "Get the app" until the app runs from the home
   screen, then "Turn on alerts" until they are on, then nothing, for good on
   this device (`done`). "Alerts blocked" when the browser said no. Nothing
   while the browser or the server cannot do it. */
export type PillState = "install" | "alerts" | "blocked" | null;
export function pillState(route: InstallRoute, push: PushState, done: boolean): PillState {
  if (done) return null;
  if (route) return "install";
  if (push === "off") return "alerts";
  if (push === "blocked") return "blocked";
  return null;
}

/* The last step, after which the pill never comes back on this device:
   notifications on, and nothing left to add to the home screen. `offered`:
   this page had Chrome's install offer (since spent, the app may still not
   be on the home screen). */
export const pillFinished = (route: InstallRoute, push: PushState, offered: boolean) =>
  route === null && !offered && push === "on";

/** Hidden at `hiddenAt`, shown again `now`: a new visit after NEW_VISIT_AFTER_MS. */
export const isNewVisit = (hiddenAt: number | null, now: number) => hiddenAt !== null && now - hiddenAt > NEW_VISIT_AFTER_MS;

/* An iPhone, iPad or iPod names itself; iPadOS in its desktop mode reads as
   a Mac with a touch screen. useInstallPrompt.ts isIos reads it too. */
export type IosDevice = "iphone" | "ipad" | null;
export function iosDevice(userAgent: string, maxTouchPoints: number): IosDevice {
  if (/iPad/.test(userAgent) || (userAgent.includes("Macintosh") && maxTouchPoints > 1)) return "ipad";
  return /iPhone|iPod/.test(userAgent) ? "iphone" : null;
}

/* Where Safari keeps its Share button: the bar at the foot of an iPhone's
   screen, in its middle; the bar along the top of an iPad, on its right.
   Another browser on an iPhone draws its own bar, so no arrow there. */
export type SharePlace = "bottom" | "top-right" | null;
const OTHER_IOS_BROWSER = /CriOS|FxiOS|EdgiOS|OPiOS|OPT\/|GSA\/|YaBrowser|DuckDuckGo|Instagram|FBAN|FBAV/;
export function sharePlace(userAgent: string, maxTouchPoints: number): SharePlace {
  const device = iosDevice(userAgent, maxTouchPoints);
  if (!device || !/Safari\//.test(userAgent) || OTHER_IOS_BROWSER.test(userAgent)) return null;
  return device === "ipad" ? "top-right" : "bottom";
}

/* How to undo a browser's no, for the browser she is in: the phone's own
   Settings for the home-screen app on an iPhone or iPad and on Android, Safari's
   settings on a Mac, and the address bar's site icon everywhere else. */
export type BlockedPlace = "ios-app" | "android-app" | "mac-safari" | "browser";
export function blockedPlace(userAgent: string, maxTouchPoints: number, standalone: boolean): BlockedPlace {
  if (iosDevice(userAgent, maxTouchPoints)) return "ios-app";
  if (standalone && /Android/.test(userAgent)) return "android-app";
  if (userAgent.includes("Macintosh") && /Version\/[\d.]+.*Safari\//.test(userAgent) && !/Chrome|Chromium|Edg\/|Firefox/.test(userAgent)) return "mac-safari";
  return "browser";
}

export const BLOCKED_STEPS: Record<BlockedPlace, (appName: string, site: string) => string[]> = {
  "ios-app": (appName) => ["Open the Settings app.", `Tap Notifications, then ${appName}.`, "Turn on Allow Notifications."],
  "android-app": (appName) => ["Open your phone’s Settings, then Apps.", `Tap ${appName}, then Notifications.`, "Turn notifications on."],
  "mac-safari": (_appName, site) => ["In Safari, open Settings, then Websites.", "Choose Notifications.", `Set ${site} to Allow, then reload this page.`],
  browser: () => ["Tap the icon at the left of the address bar.", "Open Permissions or Site settings, then Notifications.", "Choose Allow, then reload this page."],
};
