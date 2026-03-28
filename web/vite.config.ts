import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const proxyTarget = process.env.VITE_PROXY_TARGET ?? "http://localhost:3000";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/auth": proxyTarget,
      "/invites": proxyTarget,
      "/parties": proxyTarget,
      "/ws": {
        target: proxyTarget,
        ws: true,
      },
      "/health": proxyTarget,
    },
  },
});
