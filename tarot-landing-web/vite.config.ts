import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig, type Connect, type Plugin } from "vite";
import react from "@vitejs/plugin-react-swc";
import tailwindcss from "@tailwindcss/vite";
import { APP_SCOPE, OPEN_FROM_NOTIFICATION, SERVICE_WORKER_FILE } from "./src/features/client-app/offline/appServiceWorker";
import { isOwnerPath } from "./src/features/owner/ownerPaths";
import { BRAND_NAME } from "./src/lib/company";

/* The owner's phone admin has its own page (ROUND55): the same app as
   index.html, with the owner's install files in its static head, which is
   what an iPhone reads when it adds a page to the home screen. nginx.conf
   serves it for every /owner address; this does the same on the dev server
   and the preview server, where every other address still gets index.html. */
const OWNER_PAGE = "owner.html";

const serveOwnerPage: Connect.NextHandleFunction = (req, _res, next) => {
  const url = new URL(req.url ?? "/", "http://localhost");
  if ((req.method === "GET" || req.method === "HEAD") && isOwnerPath(url.pathname)) {
    req.url = `/${OWNER_PAGE}${url.search}`;
  }
  next();
};

function ownerPage(): Plugin {
  return {
    name: "owner-page",
    configureServer(server) {
      server.middlewares.use(serveOwnerPage);
    },
    configurePreviewServer(server) {
      server.middlewares.use(serveOwnerPage);
    },
  };
}

/* The installed app's service worker (ROUND31, B2). On the client build (not
   the SSR build that prerenders pages) it fills the template
   src/features/client-app/offline/sw.js with this build's release and the app
   shell (the files index.html names under /assets/), the app's scope, the
   word a tapped notification posts to an open page and the brand name
   (ROUND57), and writes it to /sw.js. Each build is a release: a new cache that replaces the last on
   the next load. */
function appServiceWorker(): Plugin {
  let ssrBuild = false;
  return {
    name: "app-service-worker",
    apply: "build",
    enforce: "post",
    configResolved(config) {
      ssrBuild = Boolean(config.build.ssr);
    },
    generateBundle(_options, bundle) {
      if (ssrBuild) return;
      const html = bundle["index.html"];
      if (!html || html.type !== "asset") return this.error("app service worker: index.html is not in the build");
      const appShell = [...new Set(String(html.source).match(/\/assets\/[^"'\s>]+/g) ?? [])];
      const source = readFileSync(new URL("./src/features/client-app/offline/sw.js", import.meta.url), "utf8")
        .replace("__RELEASE__", JSON.stringify(new Date().toISOString()))
        .replace("__APP_SHELL__", JSON.stringify(appShell))
        .replace("__APP_SCOPE__", JSON.stringify(APP_SCOPE))
        .replace("__OPEN_FROM_NOTIFICATION__", JSON.stringify(OPEN_FROM_NOTIFICATION))
        .replace("__BRAND_NAME__", JSON.stringify(BRAND_NAME));
      this.emitFile({ type: "asset", fileName: SERVICE_WORKER_FILE, source });
    },
  };
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), appServiceWorker(), ownerPage()],
  base: "/",
  build: {
    rollupOptions: {
      // Two pages, one app: both load src/main.tsx, so they share one bundle.
      // The SSR build (build:ssr) names its own entry, which Vite takes instead.
      input: {
        index: fileURLToPath(new URL("./index.html", import.meta.url)),
        owner: fileURLToPath(new URL(`./${OWNER_PAGE}`, import.meta.url)),
      },
    },
  },
  resolve: {
    alias: [
      { find: "@", replacement: "/src" },
      // Icons are drawn from the build, never fetched from api.iconify.design
      // (src/lib/offlineIcons.ts). Exactly "@iconify/react": that file's own
      // "@iconify/react/offline" import still reaches the package.
      { find: /^@iconify\/react$/, replacement: fileURLToPath(new URL("./src/lib/offlineIcons.ts", import.meta.url)) },
    ],
  },
  server: {
    watch: {
      usePolling: true,
      interval: 1000,
    },
    // DEV-SERVER ONLY (`server.*` is ignored by `vite build`): when the app
    // runs with a relative API base (VITE_API_URL empty, see
    // .env.development.local), forward /api to the live site so the flow can be
    // verified against real data and the real notification websocket.
    //
    // Still deliberately narrow. Reads pass. Of the writes, ONLY the three the
    // reading entry flow actually performs are allowed through — sign in,
    // refresh the token, request a reading. Every other write is answered 404
    // instead of being proxied, so nothing else here can change production.
    proxy: {
      "/api": {
        target: "https://askvalentina.co.uk",
        changeOrigin: true,
        secure: true,
        ws: true,
        bypass: (req) => {
          const m = req.method || "";
          if (["GET", "HEAD", "OPTIONS"].includes(m)) return undefined;
          const allowed = [
            "/api/auth/sign-in",
            "/api/auth/refresh-token",
            "/api/chat/request",
          ];
          const path = (req.url || "").split("?")[0];
          return m === "POST" && allowed.includes(path) ? undefined : false;
        },
      },
    },
  },
});
