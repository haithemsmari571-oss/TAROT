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
