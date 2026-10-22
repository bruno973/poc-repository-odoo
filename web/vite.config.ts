// vite.config.ts — Leila One (SPA React).
// En développement, /api est relayé vers Fastify : même origine pour le navigateur,
// donc cookie de session sans CORS. En production, c'est le reverse proxy (nginx.conf).
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const apiTarget = process.env["API_TARGET"] ?? "http://localhost:3001";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 4321,
    proxy: { "/api": { target: apiTarget, xfwd: true } },
  },
  preview: {
    port: 4321,
    proxy: { "/api": { target: apiTarget, xfwd: true } },
  },
  build: { sourcemap: true },
});
