/* What adding the app to the home screen can do in this browser: for the You
   tab's "Add to your home screen" row (ClientYouScreen.tsx), and for the
   visit's install sheet and the app pill (AppSheets.tsx, ROUND59).

   Chrome (Android and desktop) fires beforeinstallprompt once a page load,
   when the manifest (public/manifest.webmanifest, linked in index.html) makes
   the app installable, and only the page holding that event may open the
   browser's install dialog, once, with prompt(). The listener is attached
   when this module first loads, and the site's entry (main.tsx) imports it:
   Chrome fires the event under a second after the page opens, before the
   lazy app shell has arrived. The offer is then kept however long she takes
   to reach a sheet or the row. preventDefault keeps Chrome's own install bar
   away, on every page: the app's own sheet, pill and row are the hints.

   Safari fires no such event. On an iPhone or iPad the row opens the two
   Share steps instead. Anywhere else with no offer, and whenever the app
   already runs from the home screen, there is no row. */
import { useSyncExternalStore } from "react";
import { iosDevice } from "./appAsks";

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
}

let offer: BeforeInstallPromptEvent | null = null;
/* This page load has had an offer, even if it is spent now: the app may
   still not be on the home screen (appAsks.ts pillFinished). */
let offered = false;
const subscribers = new Set<() => void>();
function hold(next: BeforeInstallPromptEvent | null) {
  offer = next;
  subscribers.forEach(cb => cb());
}

window.addEventListener("beforeinstallprompt", event => {
  event.preventDefault();
  offered = true;
  hold(event as BeforeInstallPromptEvent);
});
// Installed, from the row or from the browser's own menu: the offer is spent.
window.addEventListener("appinstalled", () => hold(null));

function subscribe(cb: () => void) {
  subscribers.add(cb);
  return () => { subscribers.delete(cb); };
}
const heldOffer = () => offer;

/* Opened from the home screen: the manifest's display mode, or Safari's own
   flag on an iPhone. Also what phone notifications ask on an iPhone, where
   only the home-screen app can receive them (push/webPush.ts). */
export function runsStandalone() {
  return window.matchMedia("(display-mode: standalone)").matches
    || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

/* An iPhone, iPad or iPod (appAsks.ts iosDevice). */
export function isIos() {
  return iosDevice(navigator.userAgent, navigator.maxTouchPoints) !== null;
}

/** "prompt": the browser's install dialog. "share-steps": the iPhone sheet. null: no row. */
export type InstallRoute = "prompt" | "share-steps" | null;

export function useInstallPrompt() {
  const held = useSyncExternalStore(subscribe, heldOffer);
  const route: InstallRoute = runsStandalone() ? null : held ? "prompt" : isIos() ? "share-steps" : null;
  const prompt = () => {
    if (!held) return;
    // An offer opens the dialog once; a later page load may bring a new one.
    hold(null);
    held.prompt().catch(() => { /* already spent: the row has gone with it */ });
  };
  return { route, prompt, offered };
}
