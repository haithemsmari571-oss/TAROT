import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import tailwindcss from "@tailwindcss/vite";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: "/",
  resolve: {
    alias: {
      "@": "/src",
    },
  },
  server: {
    watch: {
      usePolling: true,
      interval: 1000,
    },
    // DEV-SERVER ONLY (`server.*` is ignored by `vite build`): when the app
    // runs with a relative API base (VITE_API_URL empty, see
    // .env.development.local), forward /api reads to the live site so the UI
    // can be verified against real data. Read-only by construction: anything
    // but GET/HEAD/OPTIONS is answered with 404 instead of being proxied, so
    // local dev can never mutate production.
    proxy: {
      "/api": {
        target: "https://askvalentina.co.uk",
        changeOrigin: true,
        secure: true,
        bypass: (req) =>
          req.method && !["GET", "HEAD", "OPTIONS"].includes(req.method)
            ? false
            : undefined,
      },
    },
  },
});
