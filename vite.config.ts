import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Dev: /api is proxied to `wrangler dev` (port 8787) when running the worker locally.
export default defineConfig({
  plugins: [react()],
  server: { proxy: { "/api": "http://127.0.0.1:8787", "/login": "http://127.0.0.1:8787" } },
  build: { outDir: "dist", sourcemap: false, chunkSizeWarningLimit: 2000,
    rolldownOptions: { input: { studio: "index.html", voice: "voice/index.html" } },
  },
});
