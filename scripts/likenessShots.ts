// Likeness screenshots (spec §7.3 step 4). Usage: npx tsx scripts/likenessShots.ts [--pass N] [--char masha|bear]
// Starts (or reuses) a vite dev server on port 5180, renders tools/likeness.html in headless Chromium and saves
// docs/likeness/pass<N>-<char>-<shot>.png (front, three-quarter, face close-up, black silhouette).
import { chromium } from "@playwright/test";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

const PORT = 5180;
const args = process.argv.slice(2);
const argOf = (k: string): string | undefined => {
  const i = args.indexOf(k);
  return i >= 0 ? args[i + 1] : undefined;
};
const pass = Number(argOf("--pass") ?? 1);
const chars = argOf("--char") ? [argOf("--char") as string] : ["masha", "bear"];
const base = `http://127.0.0.1:${PORT}/tools/likeness.html`;

const SHOTS: Array<{ name: string; query: string }> = [
  { name: "front", query: "angle=front" },
  { name: "three", query: "angle=three&emotion=happy" },
  { name: "face", query: "angle=face&emotion=happy" },
  { name: "silhouette", query: "angle=front&sil=1" },
];

async function up(): Promise<boolean> {
  try {
    const r = await fetch(base);
    return r.ok;
  } catch {
    return false;
  }
}

async function main(): Promise<void> {
  let server: ChildProcess | null = null;
  if (!(await up())) {
    // own process group so the whole npx → vite tree can be stopped afterwards
    server = spawn("npx", ["vite", "--port", String(PORT), "--strictPort"], { stdio: "ignore", detached: true });
    const t0 = Date.now();
    while (!(await up())) {
      if (Date.now() - t0 > 60_000) throw new Error("vite dev server did not start on port " + PORT);
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  const outDir = resolve("docs/likeness");
  mkdirSync(outDir, { recursive: true });
  const browser = await chromium.launch({
    args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--autoplay-policy=no-user-gesture-required"],
  });
  try {
    const page = await browser.newPage({ viewport: { width: 800, height: 800 } });
    page.on("pageerror", (e) => console.error("pageerror:", e.message));
    for (const c of chars) {
      for (const s of SHOTS) {
        await page.goto(`${base}?char=${c}&${s.query}&label=0`);
        await page.waitForFunction(() => (window as unknown as { __ready?: boolean }).__ready === true, null, { timeout: 90_000 });
        const file = `${outDir}/pass${pass}-${c}-${s.name}.png`;
        await page.screenshot({ path: file });
        console.log("saved", file);
      }
    }
  } finally {
    await browser.close();
    if (server?.pid) {
      try {
        process.kill(-server.pid, "SIGTERM");
      } catch {
        server.kill();
      }
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
