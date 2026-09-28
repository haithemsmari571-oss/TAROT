/* The installed app's service worker (ROUND31, B2). A template: the build
   (vite.config.ts, appServiceWorker) fills in the release and the app shell's
   files and writes it to /sw.js. It is registered for the app's pages only
   (appServiceWorker.ts, scope /app/), so no other page of the website ever
   goes through it.

   What it keeps: only the app shell (the script, styles and preloads the page
   names first) and the build's own files under /assets/, whose names change
   with their content. Never an API answer, never anything under /api or
   /crm, never another site's file, never a page.

   Pages always come from the network, so a release shows at once. With no
   network, a page is answered with the one offline screen below; its Try
   again reloads the address she was on.

   Each build is a release with its own cache. The browser checks /sw.js on
   every load; a new release's worker takes over at once and deletes every
   older release's cache. */

const RELEASE = __RELEASE__;
const APP_SHELL = __APP_SHELL__;
const CACHE_PREFIX = "av-app-";
const CACHE = CACHE_PREFIX + RELEASE;

const OFFLINE_LINE = "You're offline. Check your connection and try again.";
const TRY_AGAIN = "Try again";

/* The hall's world without its runtime: the night sky's base, the frosted
   panel with its gold hairline, Fraunces for the line and Inter for the
   button (VISUAL_INVENTORY.md; hall.css:145, glass.css:37). Self-contained:
   with no network there is nothing else to load. */
const OFFLINE_PAGE = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#120c18">
<title>Ask Valentina</title>
<style>
  html, body { margin: 0; height: 100%; }
  body {
    display: flex; align-items: center; justify-content: center;
    padding: max(24px, env(safe-area-inset-top)) 24px max(24px, env(safe-area-inset-bottom));
    box-sizing: border-box;
    background: radial-gradient(120% 80% at 50% 18%, #2a1a3e 0%, #160d22 48%, #120c18 100%);
    color: rgba(244, 239, 230, 0.95);
    -webkit-font-smoothing: antialiased;
  }
  main {
    width: 100%; max-width: 360px; box-sizing: border-box;
    padding: 32px 26px 28px; border-radius: 22px; text-align: center;
    background: linear-gradient(165deg, rgba(30, 18, 48, 0.6), rgba(12, 6, 24, 0.5));
    border: 1px solid rgba(255, 214, 150, 0.22);
    box-shadow: 0 18px 50px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(244, 239, 230, 0.08);
    -webkit-backdrop-filter: blur(18px); backdrop-filter: blur(18px);
  }
  p {
    margin: 0 0 24px;
    font-family: "Fraunces", Georgia, serif; font-weight: 300;
    font-size: 22px; line-height: 1.35; letter-spacing: -0.01em;
  }
  button {
    font-family: "Inter", system-ui, -apple-system, "Segoe UI", sans-serif; font-weight: 600; font-size: 15px;
    padding: 13px 28px; border: 0; border-radius: 999px; cursor: pointer;
    color: #2a1a10; background: linear-gradient(140deg, #ffecc4, #e6c48c);
  }
</style>
</head>
<body>
<main>
<p>${OFFLINE_LINE}</p>
<button type="button" onclick="location.reload()">${TRY_AGAIN}</button>
</main>
</body>
</html>`;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((names) => Promise.all(
        names
          .filter((name) => name.startsWith(CACHE_PREFIX) && name !== CACHE)
          .map((name) => caches.delete(name)),
      ))
      .then(() => self.clients.claim()),
  );
});

/* Another site, the API and the CRM are never answered here: the browser
   fetches them as if there were no worker. */
function passesThrough(url) {
  return url.origin !== self.location.origin
    || url.pathname === "/api" || url.pathname.startsWith("/api/")
    || url.pathname === "/crm" || url.pathname.startsWith("/crm/");
}

function offlineScreen() {
  return new Response(OFFLINE_PAGE, {
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (passesThrough(url)) return;

  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(offlineScreen));
    return;
  }

  // A build file: the same name is always the same bytes, so the kept copy
  // answers first. A part of a file (a media range) is left to the browser.
  if (!url.pathname.startsWith("/assets/") || request.headers.has("range")) return;
  event.respondWith(
    caches.open(CACHE).then((cache) => cache.match(request).then((kept) => kept || fetch(request).then((response) => {
      if (response.status === 200) cache.put(request, response.clone());
      return response;
    }))),
  );
});
