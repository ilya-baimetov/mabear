import { defineConfig } from "@playwright/test";

// E2E runs against the built app served by the real Worker (`wrangler dev`) with the mock director (MOCK_DIRECTOR=1)
// and a test-only password, so the password gate is exercised too. No Anthropic key is needed.
const PORT = Number(process.env.E2E_PORT ?? 8791);
const hardware = process.env.E2E_GPU === "hardware";
export const E2E_PASSWORD = "e2e-pass";

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    viewport: { width: 1440, height: 860 },
    channel: "chrome",
    launchOptions: {
      args: [...(hardware ? [] : ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"]), "--autoplay-policy=no-user-gesture-required", "--ignore-gpu-blocklist"],
    },
  },
  webServer: {
    command: `npx vite build --outDir .e2e-dist/${PORT} --emptyOutDir && npx wrangler dev --config wrangler.test.toml --assets .e2e-dist/${PORT} --port ${PORT} --ip localhost --var MOCK_DIRECTOR:1 --var DEMO_PASSWORD:${E2E_PASSWORD} --var SESSION_SECRET:e2e-secret`,
    url: `http://localhost:${PORT}/api/health`,
    reuseExistingServer: false,
    timeout: 180_000,
    stdout: "ignore",
    stderr: "pipe",
  },
});
