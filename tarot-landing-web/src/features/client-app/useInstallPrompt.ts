/* What the You tab's "Add to your home screen" row (ClientYouScreen.tsx) can
   do in this browser.

   Chrome (Android and desktop) fires beforeinstallprompt once a page load,
   when the manifest (public/manifest.webmanifest, linked in index.html) makes
   the app installable, and only the page holding that event may open the
   browser's install dialog, once, with prompt(). The listener is attached
   when this module first loads, and the site's entry (main.tsx) imports it:
   Chrome fires the event under a second after the page opens, before the
   lazy app shell has arrived. The offer is then kept however long she takes
   to reach the You tab. preventDefault keeps Chrome's own install bar away,
   on every page: the row is the one hint.

   Safari fires no such event. On an iPhone or iPad the row opens the two
   Share steps instead. Anywhere else with no offer, and whenever the app
   already runs from the home screen, there is no row. */
import { useSyncExternalStore } from "react";

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
}

let offer: BeforeInstallPromptEvent | null = null;
const subscribers = new Set<() => void>();
function hold(next: BeforeInstallPromptEvent | null) {
  offer = next;
  subscribers.forEach(cb => cb());
}

window.addEventListener("beforeinstallprompt", event => {
  event.preventDefault();
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
   flag on an iPhone. */
function runsStandalone() {
  return window.matchMedia("(display-mode: standalone)").matches
    || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

/* An iPhone, iPad or iPod names itself; iPadOS in its desktop mode reads as
   a Mac with a touch screen. */
function isIos() {
  const ua = navigator.userAgent;
  return /iPhone|iPad|iPod/.test(ua) || (ua.includes("Macintosh") && navigator.maxTouchPoints > 1);
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
  return { route, prompt };
}
