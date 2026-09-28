/* The installed app's service worker (ROUND31, B2). The build writes it from
   ./sw.js to SERVICE_WORKER_FILE at the site's root (vite.config.ts,
   appServiceWorker); the app shell registers it for the app's pages only, the
   manifest's scope, so no other page of the website goes through it. */
export const SERVICE_WORKER_FILE = "sw.js";
export const APP_SCOPE = "/app/";

/* A production build only: the dev server has no /sw.js. The browser fetches
   the worker afresh on every load (updateViaCache "none"), so a new release
   is picked up at once. */
export function registerAppServiceWorker() {
  if (!import.meta.env.PROD || !("serviceWorker" in navigator)) return;
  navigator.serviceWorker
    .register(`/${SERVICE_WORKER_FILE}`, { scope: APP_SCOPE, updateViaCache: "none" })
    .catch((error) => console.error("app_service_worker_failed", error));
}
