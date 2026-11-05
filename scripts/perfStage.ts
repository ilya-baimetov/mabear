// Headless stage performance probe (A5). Usage: npx tsx scripts/perfStage.ts [--query "post=0"] [--seconds 8]
// Renders tools/stage.html?anim=1 at 1280×720 in headless Chromium (SwiftShader WebGL), lets adaptive resolution
// settle, then logs mean FPS, draw calls (incl. shadow + post passes), triangles and the resolution scale.
// Runs with adaptive resolution ON (as in the app) and OFF (fixed full resolution) for comparison.
import { chromium } from "@playwright/test";
import { ensureServer } from "./envShots";

const args = process.argv.slice(2);
const qi = args.indexOf("--query");
const extra = qi >= 0 ? `&${args[qi + 1]}` : "";
const si = args.indexOf("--seconds");
const seconds = si >= 0 ? Number(args[si + 1]) : 8;
const cams = args.indexOf("--cams") >= 0 ? args[args.indexOf("--cams") + 1].split(",") : ["wide", "yard"];

type Stats = { fps: number; drawCalls: number; triangles: number };
type W = {
  __ready?: boolean;
  __stage?: { stats(): Stats; resolutionScale(): number; setAdaptive(on: boolean): void; assetsReady: Promise<void> };
};

async function main(): Promise<void> {
  const server = await ensureServer();
  const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
  try {
    for (const cam of cams) {
      for (const adaptive of [true, false]) {
        for (let attempt = 0; attempt < 3; attempt++) {
          // vite may full-reload the page when other files change mid-run: retry the measurement
          const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
          page.on("pageerror", (e) => console.error("pageerror:", e.message));
          try {
            await page.goto(`http://127.0.0.1:5181/tools/stage.html?anim=1&cam=${cam}${extra}`, { timeout: 120_000 });
            await page.waitForFunction(() => (window as unknown as W).__ready === true, null, { timeout: 180_000 });
            await page.evaluate(async (a) => {
              const st = (window as unknown as W).__stage!;
              await st.assetsReady;
              st.setAdaptive(a);
            }, adaptive);
            await page.waitForTimeout(3000); // settle (adaptive steps every 1.5 s)
            const samples: Stats[] = [];
            const t0 = Date.now();
            while (Date.now() - t0 < seconds * 1000) {
              await page.waitForTimeout(500);
              samples.push(await page.evaluate(() => (window as unknown as W).__stage!.stats()));
            }
            const scale = await page.evaluate(() => (window as unknown as W).__stage!.resolutionScale());
            // GPU-inclusive ms/frame (gl.finish) — not capped by vsync like the rAF FPS
            const ms = await page.evaluate(() => {
              const b = (window as unknown as { __bench?: (n: number) => number }).__bench;
              return b ? b(20) : NaN;
            });
            const fps = samples.reduce((s, x) => s + x.fps, 0) / samples.length;
            const last = samples[samples.length - 1];
            console.log(
              `[perf] cam=${cam} adaptive=${adaptive ? "on " : "off"} fps=${fps.toFixed(1)} drawCalls=${last.drawCalls} tris=${(last.triangles / 1000).toFixed(0)}k scale=${scale.toFixed(2)} bench=${ms.toFixed(1)}ms/frame${extra ? " " + extra : ""}`,
            );
            await page.close();
            break;
          } catch (e) {
            console.warn(`[perf] retry (${(e as Error).message.split("\n")[0]})`);
            await page.close().catch(() => undefined);
          }
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

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
