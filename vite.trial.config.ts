import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
  root: resolve(import.meta.dirname, 'trial'),
  publicDir: 'public',
  server: { host: '127.0.0.1', port: 5182, strictPort: true, fs: { allow: ['..'] } },
  build: { outDir: '../dist-trial', emptyOutDir: true, chunkSizeWarningLimit: 2000 },
});
