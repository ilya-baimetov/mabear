import { expect, test } from "@playwright/test";
import { writeFileSync } from "node:fs";
import { E2E_PASSWORD } from "../../playwright.config";
import type { ActorId } from "../../src/shared/schema";

const GENERATED_CAST: ActorId[] = ["masha", "bear", "lady_bear", "hare", "rosie", "squirrel", "rival_bear"];

test("generated cast and garden load; whole-story playback, seeking and character close-ups stay valid", async ({ page }) => {
  test.setTimeout(180_000);
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  const login = await page.request.post("/login", { form: { password: E2E_PASSWORD }, maxRedirects: 0 });
  expect([200, 302, 303]).toContain(login.status());
  await page.goto("/");
  await expect(page.getByTestId("moment-text")).toBeVisible();
  await expect(page.locator(".stage-loading")).toHaveCount(0, { timeout: 90_000 });
  await expect(page.locator(".stage-error")).toHaveCount(0);
  await page.waitForFunction(() => !!window.__mabear);

  const assets = await page.evaluate(() => window.__mabear!.assets()) as { id: string; ok: boolean }[];
  for (const id of [...GENERATED_CAST, "set:house", "set:beehive", "prop:carrot"]) expect(assets.find(asset => asset.id === id), id).toMatchObject({ ok: true });
  const rigs = await page.evaluate(() => window.__mabear!.rigs()) as Record<string, { name: string; generated?: { dressVertices: number; facialRig: boolean; calibrationError: number; mapping: Record<string, string> } }>;
  for (const id of GENERATED_CAST) {
    expect(rigs[id].name).toContain(":generated");
    expect(Object.keys(rigs[id].generated!.mapping).length).toBeGreaterThan(20);
    expect(rigs[id].generated!.calibrationError, id).toBeLessThan(.002);
  }
  // Main-game Masha stays on the shipped rig until the separate candidate is accepted.
  expect(rigs.masha.generated!.dressVertices).toBeGreaterThan(100);
  expect(rigs.masha.generated!.facialRig).toBe(true);

  await page.getByTestId("examples").click();
  await page.getByTestId("example-garden_party").click();
  await expect.poll(async () => {
    const statuses = await page.getByTestId("moment-card").evaluateAll(els => els.map(el => el.getAttribute("data-status")));
    return statuses.length > 1 && statuses.every(status => status === "ready" || status === "adjusted");
  }).toBe(true);
  const timeline = await page.evaluate(() => window.__mabear!.timeline()) as {
    duration: number;
    segments: { segment: { actorClips: Record<string, { verb: string }[]> } }[];
  };
  for (const id of ["lady_bear", "hare", "rosie", "squirrel", "rival_bear"]) expect(timeline.segments.some(seg => seg.segment.actorClips[id].some(clip => clip.verb !== "idle")), id).toBe(true);
  await page.getByTestId("play-all").click();
  await expect.poll(() => page.evaluate(() => window.__mabear!.t())).toBeGreaterThan(2);
  await page.getByTestId("pause").click();
  const progress = page.getByRole("slider", { name: "Story progress", exact: true });
  await progress.press("End");
  expect(await page.evaluate(() => window.__mabear!.t())).toBeCloseTo(timeline.duration, 2);
  await progress.press("Home");
  expect(await page.evaluate(() => window.__mabear!.t())).toBe(0);
  const box = (await progress.boundingBox())!;
  await progress.click({ position: { x: box.width * .63, y: box.height / 2 } });
  expect(Math.abs(await page.evaluate(() => window.__mabear!.t()) - timeline.duration * .63)).toBeLessThan(.2);

  const renderContext = await page.getByTestId("stage-canvas").evaluate(el => {
    const canvas = el as HTMLCanvasElement, rect = canvas.getBoundingClientRect();
    return { css: [rect.width, rect.height], internal: [canvas.width, canvas.height], devicePixelRatio, quality: window.__mabear!.quality() };
  });
  console.log(`[render context] ${JSON.stringify(renderContext)}`);

  // The public authoring UI no longer has an exploratory cast deck. The debug
  // camera applies its override in Player's animation frame. Wait for that
  // update before reading pixels, rather than snapshotting the previous camera.
  let previousStill: string | null = null;
  for (const id of GENERATED_CAST) {
    const still = await page.evaluate(async actor => {
      window.__mabear!.closeup(actor);
      await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
      return window.__mabear!.snapshot();
    }, id);
    expect(still, id).toMatch(/^data:image\/png;base64,/);
    expect(still!.length, id).toBeGreaterThan(10_000);
    expect(still, `${id} close-up changes the render`).not.toBe(previousStill);
    writeFileSync(test.info().outputPath(`generated-${id}-closeup.png`), Buffer.from(still!.split(",")[1], "base64"));
    previousStill = still;
  }
  await page.evaluate(async () => {
    window.__mabear!.closeup(null);
    await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    window.__mabear!.freeze(true);
  });
  const data = await page.evaluate(() => window.__mabear!.snapshot());
  expect(data!.length).toBeGreaterThan(10_000);
  writeFileSync(test.info().outputPath("generated-cast-yard.png"), Buffer.from(data!.split(",")[1], "base64"));
  expect(errors).toEqual([]);
});
