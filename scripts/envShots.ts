// Environment shots of the set (A5 look pass). Usage: npx tsx scripts/envShots.ts <prefix> [--query "post=1"]
// Starts (or reuses) a vite dev server on port 5181, renders tools/stage.html in headless Chromium (SwiftShader
// WebGL) at 1280×720 and saves docs/likeness/<prefix>-<shot>.png. Waits for stage.assetsReady (HDRI + textures).
import { chromium } from "@playwright/test";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

const PORT = 5181;
const args = process.argv.slice(2);
const prefix = args.find((a) => !a.startsWith("--")) ?? "env";
const qi = args.indexOf("--query");
const extra = qi >= 0 ? `&${args[qi + 1]}` : "";
const only = args.indexOf("--only") >= 0 ? args[args.indexOf("--only") + 1].split(",") : null;
const base = `http://127.0.0.1:${PORT}/tools/stage.html`;

export const ENV_SHOTS: Array<{ name: string; query: string }> = [
  { name: "yard-day", query: "cam=yard&tod=day" },
  { name: "yard-sunset", query: "cam=yard&tod=sunset" },
  { name: "wide-day", query: "cam=wide&tod=day" },
  { name: "house-morning", query: "cam=house&tod=morning" },
  { name: "pond-night", query: "cam=pond&tod=night" },
  { name: "closeup-day", query: "campos=-1.5,1.4,2.6&camlook=-4.5,0.9,-2.4&fov=50&tod=day" },
];

async function up(): Promise<boolean> {
  try {
    return (await fetch(base)).ok;
  } catch {
    return false;
  }
}

export async function ensureServer(): Promise<ChildProcess | null> {
  if (await up()) return null;
  const server = spawn("npx", ["vite", "--port", String(PORT), "--strictPort"], { stdio: "ignore", detached: true });
  const t0 = Date.now();
  while (!(await up())) {
    if (Date.now() - t0 > 60_000) throw new Error("vite dev server did not start on port " + PORT);
    await new Promise((r) => setTimeout(r, 500));
  }
  return server;
}

async function main(): Promise<void> {
  const server = await ensureServer();
  const outDir = resolve("docs/likeness");
  mkdirSync(outDir, { recursive: true });
  const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    page.on("pageerror", (e) => console.error("pageerror:", e.message));
    page.on("console", (m) => {
      if (m.type() === "error" || m.type() === "warning") console.log("page:", m.type(), m.text().slice(0, 300));
    });
    for (const s of ENV_SHOTS) {
      if (only && !only.includes(s.name)) continue;
      // after the first frames, wait for the async assets (HDRI + textures), switch adaptive quality off (full
      // resolution + full post: SwiftShader's low frame rate must not degrade the shot) and render a few more frames
      // through tools/stage.ts' __bench hook (a continuous render loop starves headless screenshots)
      // vite may full-reload the page when other files change mid-run: retry the shot
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          await page.goto(`${base}?${s.query}${extra}`);
          await page.waitForFunction(() => (window as unknown as { __ready?: boolean }).__ready === true, null, { timeout: 180_000 });
          await page.evaluate(async () => {
            const w = window as unknown as {
              __stage?: { assetsReady: Promise<void>; setAdaptive(on: boolean): void };
              __bench?: (n: number) => number;
            };
            if (w.__stage) {
              await w.__stage.assetsReady;
              w.__stage.setAdaptive(false);
            }
            w.__bench?.(3);
          });
          await page.evaluate(() => {
            const h = document.getElementById("hud");
            if (h) h.style.display = "none";
          });
          const file = `${outDir}/${prefix}-${s.name}.png`;
          await page.screenshot({ path: file, timeout: 240_000 });
          console.log("saved", file);
          break;
        } catch (e) {
          console.warn(`retry ${s.name}: ${(e as Error).message.split("\n")[0]}`);
        }
      }
    }
  } finally {
    await browser.close();
    if (server?.pid) {
      try {
        process.kill(-server.pid);
      } catch {
        /* already gone */
      }
    }
  }
}

if (process.argv[1] && /envShots/.test(process.argv[1])) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
