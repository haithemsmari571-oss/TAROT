/* The installed app's service worker (ROUND31, B2). The build writes it from
   ./sw.js to SERVICE_WORKER_FILE at the site's root (vite.config.ts,
   appServiceWorker); the app shell registers it for the app's pages only, the
   manifest's scope, so no other page of the website goes through it.

   Since ROUND57 the owner's phone admin registers the same file for its own
   pages (OWNER_SCOPE), for phone notifications only: the worker keeps the app
   shell and draws the offline screen under APP_SCOPE alone. Relative imports
   only: vite.config.ts loads this file before the @/ alias exists. */
import { OWNER_PATH } from "../../owner/ownerPaths";

export const SERVICE_WORKER_FILE = "sw.js";
export const APP_SCOPE = "/app/";
export const OWNER_SCOPE = `${OWNER_PATH}/`;
/* What the worker posts to an open page when a notification is tapped: the
   page moves to the address itself (useOpenFromNotification, push/webPush.ts).
   The build writes the same word into sw.js. */
export const OPEN_FROM_NOTIFICATION = "av-open-from-notification";

/* A production build only: the dev server has no /sw.js. The browser fetches
   the worker afresh on every load (updateViaCache "none"), so a new release
   is picked up at once. A failure leaves the page as it is, with phone
   notifications off. */
export function registerServiceWorker(scope: string) {
  if (!import.meta.env.PROD || !("serviceWorker" in navigator)) return;
  navigator.serviceWorker
    .register(`/${SERVICE_WORKER_FILE}`, { scope, updateViaCache: "none" })
    .catch((error) => console.error("app_service_worker_failed", error));
}

export function registerAppServiceWorker() {
  registerServiceWorker(APP_SCOPE);
}
