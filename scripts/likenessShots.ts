// Likeness screenshots (spec §7.3 step 4). Usage: npx tsx scripts/likenessShots.ts [--pass N] [--char masha|bear]
// Starts (or reuses) a vite dev server on port 5180, renders tools/likeness.html in headless Chromium and saves
// docs/likeness/pass<N>-<char>-<shot>.png (front, three-quarter, face close-up, black silhouette).
// Motion filmstrips (motion feel): --motion <fixture>:<char>:<t0>:<dt>:<n> (repeatable) renders evaluate() frames of a
// compiled fixture episode → docs/likeness/pass<N>-motion-f<fixture>-<char>-<t0>.png (stills are skipped).
// In-app check: --app <fixture chip id> plays that example in the real app (vite dev, no director needed for
// fixtures) and saves 6 playback frames + both close-ups → docs/likeness/pass<N>-app-<id>-*.png.
import { chromium } from "@playwright/test";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const PORT = 5180;
const args = process.argv.slice(2);
const argOf = (k: string): string | undefined => {
  const i = args.indexOf(k);
  return i >= 0 ? args[i + 1] : undefined;
};
const pass = Number(argOf("--pass") ?? 1);
const chars = argOf("--char") ? [argOf("--char") as string] : ["masha", "bear"];
const motions = args.flatMap((a, i) => (a === "--motion" && args[i + 1] ? [args[i + 1]] : []));
const apps = args.flatMap((a, i) => (a === "--app" && args[i + 1] ? [args[i + 1]] : []));
const stages = args.flatMap((a, i) => (a === "--stage" && args[i + 1] ? [args[i + 1]] : []));
const base = `http://127.0.0.1:${PORT}/tools/likeness.html`;

const SHOTS: Array<{ name: string; query: string }> = args.includes("--faces")
  ? // face sheet: every viseme + a few emotions, close-up (spec §7.3 face rig check)
    [
      ...["rest", "open_small", "open_wide", "o", "e", "frown", "grin"].map((v) => ({ name: `viseme-${v}`, query: `angle=face&viseme=${v}` })),
      ...["surprised", "sad", "angry", "sleepy", "mischievous", "scared"].map((e) => ({ name: `emotion-${e}`, query: `angle=face&emotion=${e}` })),
    ]
  : [
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
    page.on("console", (m) => {
      if (motions.length || stages.length || m.type() === "error") console.log("page:", m.type(), m.text().slice(0, 300));
    });
    for (const spec of motions) {
      const [f, c, t0, dt, n] = spec.split(":");
      await page.setViewportSize({ width: 1600, height: 300 * Math.ceil(Number(n || 12) / 4) });
      await page.goto(`${base}?motion=${f}&char=${c}&t0=${t0 ?? 0}&dt=${dt ?? ""}&n=${n ?? 12}&label=0`.replace("&dt=&", "&"));
      await page.waitForFunction(() => (window as unknown as { __ready?: boolean }).__ready === true, null, { timeout: 120_000 });
      const file = `${outDir}/pass${pass}-motion-f${f}-${c}-${t0 ?? 0}.png`;
      await page.screenshot({ path: file });
      console.log("saved", file);
    }
    for (const spec of stages) {
      // --stage <fixture>:<t>[:<focus>] → the real engine stage (set + look) at time t
      const [f, t, focus] = spec.split(":");
      await page.setViewportSize({ width: 1280, height: 720 });
      await page.goto(`${base}?stage=${f}&t=${t}${focus ? `&focus=${focus}` : ""}`);
      await page.waitForFunction(() => (window as unknown as { __ready?: boolean }).__ready === true, null, { timeout: 180_000 });
      const file = `${outDir}/pass${pass}-stage-f${f}-${t}${focus ? `-${focus}` : ""}.png`;
      const png = await page.evaluate(() => (window as unknown as { __png: string }).__png);
      writeFileSync(file, Buffer.from(png.split(",")[1], "base64"));
      console.log("saved", file);
    }
    for (const id of apps) {
      await page.setViewportSize({ width: 1280, height: 720 });
      await page.goto(`http://127.0.0.1:${PORT}/`);
      await page.evaluate(() => localStorage.clear());
      await page.goto(`http://127.0.0.1:${PORT}/`);
      await page.waitForFunction(() => !!(window as unknown as { __mabear?: unknown }).__mabear, null, { timeout: 60_000 });
      await page.getByTestId(`chip-${id}`).click();
      await page.waitForTimeout(4000);
      await page.getByTestId("play-all").click();
      for (let i = 0; i < 6; i++) {
        await page.waitForTimeout(i === 0 ? 1500 : 3500);
        const file = `${outDir}/pass${pass}-app-${id}-${i}.png`;
        await page.getByTestId("stage-canvas").screenshot({ path: file });
        console.log("saved", file);
      }
      const st = await page.evaluate(() => (window as unknown as { __mabear: { stats(): unknown } }).__mabear.stats());
      console.log("stats", JSON.stringify(st));
      await page.getByTestId("pause").click().catch(() => undefined);
      await page.addStyleTag({ content: ".tap-hint { display: none !important; }" });
      for (const [who, ang] of [["masha", 0.35], ["bear", -0.35]] as const) {
        await page.evaluate(([w, a]) => (window as unknown as { __mabear: { closeup(w: string, a: number): void } }).__mabear.closeup(w, a), [who, ang] as const);
        await page.waitForTimeout(1500);
        const file = `${outDir}/pass${pass}-app-${id}-closeup-${who}.png`;
        await page.getByTestId("stage-canvas").screenshot({ path: file });
        console.log("saved", file);
      }
    }
    for (const c of motions.length || apps.length || stages.length ? [] : chars) {
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
