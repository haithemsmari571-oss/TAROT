import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react-swc";
import tailwindcss from "@tailwindcss/vite";
import { SERVICE_WORKER_FILE } from "./src/features/client-app/offline/appServiceWorker";

/* The installed app's service worker (ROUND31, B2). On the client build (not
   the SSR build that prerenders pages) it fills the template
   src/features/client-app/offline/sw.js with this build's release and the app
   shell (the files index.html names under /assets/), and writes it to /sw.js.
   Each build is a release: a new cache that replaces the last on the next
   load. */
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
        .replace("__APP_SHELL__", JSON.stringify(appShell));
      this.emitFile({ type: "asset", fileName: SERVICE_WORKER_FILE, source });
    },
  };
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), appServiceWorker()],
  base: "/",
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
