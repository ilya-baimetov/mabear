// Real Worker + mock director regression coverage for the moment authoring UI.
import { expect, test, type Page } from "@playwright/test";
import { writeFileSync } from "node:fs";
import { login } from "./login";

interface SegLike {
  offset: number;
  segment: {
    duration: number;
    dialogue: { actor: string; text: string }[];
    ambience: { layers: string[] }[];
    music: { mood: string }[];
  };
}

test.describe.configure({ timeout: 180_000 });

async function open(page: Page, query = "") {
  await login(page);
  await page.goto(`/${query}`);
  await expect(page.getByTestId("moment-text")).toBeVisible();
  await expect(page.getByTestId("stage-canvas")).toBeVisible();
  await expect(page.locator(".stage-loading")).toHaveCount(0, { timeout: 90_000 });
  await expect(page.locator(".stage-error")).toHaveCount(0);
  await page.waitForFunction(() => !!window.__mabear, null, { timeout: 60_000 });
}

async function allSettled(page: Page) {
  await expect.poll(async () => {
    const states = await page.getByTestId("moment-card").evaluateAll(els => els.map(el => el.getAttribute("data-status")));
    return states.length > 0 && states.every(status => status === "ready" || status === "adjusted");
  }, { timeout: 30_000 }).toBe(true);
}

async function loadExample(page: Page, id: string) {
  await page.getByTestId("examples").click();
  await page.getByTestId(`example-${id}`).click();
  await allSettled(page);
}

async function segments(page: Page): Promise<SegLike[]> {
  return page.evaluate(() => (window.__mabear!.timeline() as { segments: SegLike[] }).segments);
}

async function totalDuration(page: Page) {
  return page.evaluate(() => (window.__mabear!.timeline() as { duration: number }).duration);
}

async function stopIfPlaying(page: Page) {
  if (await page.getByTestId("pause").isVisible()) await page.getByTestId("pause").click();
  await expect.poll(() => page.evaluate(() => window.__mabear!.playing())).toBe(false);
}

/** Reuse the initial blank moment; otherwise append explicitly after the last one. */
async function typeMoment(page: Page, value: string) {
  await page.getByTestId("moment-card").last().click();
  if ((await page.getByTestId("moment-text").inputValue()).trim()) await page.getByTestId("add-next-moment").click();
  await page.getByTestId("moment-text").fill(value);
  await page.getByTestId("preview-moment").click();
}

/** Pixel variance comes from a screenshot of the actual WebGL canvas. */
async function canvasVariance(page: Page): Promise<number> {
  const png = await page.getByTestId("stage-canvas").screenshot();
  return page.evaluate(async src => {
    const img = new Image(); img.src = src; await img.decode();
    const c = document.createElement("canvas"); c.width = img.width; c.height = img.height;
    const ctx = c.getContext("2d")!; ctx.drawImage(img, 0, 0);
    const d = ctx.getImageData(0, 0, c.width, c.height).data;
    let sum = 0, sum2 = 0, n = 0;
    for (let i = 0; i < d.length; i += 16) {
      const l = .299 * d[i] + .587 * d[i + 1] + .114 * d[i + 2];
      sum += l; sum2 += l * l; n++;
    }
    return sum2 / n - (sum / n) ** 2;
  }, `data:image/png;base64,${png.toString("base64")}`);
}

/** Read the real render in one task; artifacts belong to this test run. */
async function still(page: Page, name: string) {
  const url = await page.evaluate(() => window.__mabear!.snapshot());
  expect(url).toMatch(/^data:image\/png;base64,/);
  writeFileSync(test.info().outputPath(name), Buffer.from(url!.split(",")[1], "base64"));
}

test("1. authentication protects the app; a signed-in canvas renders a non-blank frame", async ({ page }) => {
  const deniedPage = await page.request.get("/", { maxRedirects: 0 });
  expect(deniedPage.status()).toBe(302);
  expect(deniedPage.headers().location).toContain("/login");
  const deniedDirector = await page.request.post("/api/direct", { data: { paragraph: "Masha waves." } });
  expect(deniedDirector.status()).toBe(401);
  await open(page);
  await page.waitForTimeout(1500);
  expect(await canvasVariance(page)).toBeGreaterThan(50);
});

test("2. Pancake morning: whole-story playback advances and marks the actual active moment", async ({ page }) => {
  await open(page);
  await loadExample(page, "pancake_morning");
  expect(await page.getByTestId("moment-card").count()).toBeGreaterThanOrEqual(3);
  await page.getByTestId("play-all").click();
  await expect(page.getByTestId("timeline")).toHaveAttribute("data-scope", "story");
  await expect.poll(() => page.evaluate(() => window.__mabear!.t()), { timeout: 15_000 }).toBeGreaterThan(.5);
  await expect(page.locator('[data-testid="moment-card"][data-active="1"]')).toHaveCount(1);
  await expect.poll(() => page.evaluate(() => {
    const t = window.__mabear!.t();
    const engineActive = (window.__mabear!.timeline() as { segments: SegLike[] }).segments.findIndex(seg => t >= seg.offset && t < seg.offset + seg.segment.duration);
    const active = [...document.querySelectorAll('[data-testid="moment-card"]')].findIndex(el => el.getAttribute("data-active") === "1");
    return active >= 0 && active === engineActive;
  })).toBe(true);
  await page.screenshot({ path: test.info().outputPath("player.png") });
});

test("3. adding a two-sentence moment reaches ready and grows the compiled story", async ({ page }) => {
  await open(page);
  await loadExample(page, "bears_nap");
  const before = await totalDuration(page), count = await page.getByTestId("moment-card").count();
  await typeMoment(page, "Masha runs to the swing. She swings and laughs.");
  await allSettled(page);
  await stopIfPlaying(page);
  await expect(page.getByTestId("moment-card")).toHaveCount(count + 1);
  expect(await totalDuration(page)).toBeGreaterThan(before);
});

test("4. revising moment 2 makes one director request and preserves other versions", async ({ page }) => {
  await open(page);
  await loadExample(page, "fishing_trip");
  const versionsBefore = await page.getByTestId("moment-card").evaluateAll(els => els.map(el => el.getAttribute("data-version")));
  expect(versionsBefore.every(v => v === "1")).toBe(true);
  let calls = 0;
  await page.route("**/api/direct", async route => { calls++; await route.continue(); });
  await page.getByTestId("moment-card").nth(1).click();
  await page.getByTestId("moment-text").fill("Masha jumps on the pier and waves at Bear.");
  await page.getByTestId("story-title").click();
  await page.waitForTimeout(2000);
  expect(calls).toBe(0);
  await expect(page.getByTestId("moment-card").nth(1)).toHaveAttribute("data-status", "draft");
  await page.getByTestId("preview-moment").click();
  await allSettled(page);
  await page.waitForTimeout(1000);
  expect(calls).toBe(1);
  const versionsAfter = await page.getByTestId("moment-card").evaluateAll(els => els.map(el => el.getAttribute("data-version")));
  expect(versionsAfter[1]).toBe("2");
  versionsAfter.forEach((version, i) => { if (i !== 1) expect(version).toBe(versionsBefore[i]); });
});

test("5. canon adjustments keep Bear silent and replace weapons before rendering", async ({ page }) => {
  await open(page);
  await typeMoment(page, "Bear says thank you to Masha.");
  await expect(page.getByTestId("moment-card").first()).toHaveAttribute("data-status", "adjusted", { timeout: 30_000 });
  const segs = await segments(page);
  expect(segs).toHaveLength(1);
  expect(segs[0].segment.dialogue.filter(d => d.actor === "bear")).toHaveLength(0);
  const adjustment = page.locator(".moment-adjustments");
  await expect(adjustment.locator("p").first()).toBeHidden();
  await adjustment.locator("summary").click();
  await expect(adjustment.locator("p").first()).toBeVisible();
  await stopIfPlaying(page);
  await typeMoment(page, "Masha grabs a knife.");
  await expect(page.getByTestId("moment-card").nth(1)).toHaveAttribute("data-status", "adjusted", { timeout: 30_000 });
  await stopIfPlaying(page);
  const rules = await page.evaluate(() => (JSON.parse(localStorage.getItem("mabear.log") ?? "[]") as { ruleHits: { rule: string }[] }[]).flatMap(e => e.ruleHits.map(hit => hit.rule)));
  expect(rules).toContain("bear_silent");
  expect(rules).toContain("no_weapons");
});

test("6. EN → RU switches the moment UI and loads a Russian story", async ({ page }) => {
  await open(page);
  await expect(page.getByTestId("add-next-moment")).toContainText("What happens next?");
  await page.getByTestId("lang-ru").click();
  await expect(page.getByTestId("add-next-moment")).toContainText("Что будет дальше?");
  await expect(page.getByTestId("examples")).toContainText("Примеры");
  await expect(page.getByTestId("new-story")).toContainText("Новая");
  await loadExample(page, "pancake_morning");
  expect(await page.getByTestId("moment-text").inputValue()).toMatch(/[А-Яа-яЁё]/);
  await page.screenshot({ path: test.info().outputPath("ru-mode.png") });
});

test("7. pitch tools expose plan/cost/FPS/economics; a selected-moment remix makes no director call", async ({ page }) => {
  await open(page);
  await expect(page.getByTestId("behind-the-scenes")).toHaveCount(0);
  await open(page, "?pitch=1");
  await expect(page.getByTestId("behind-the-scenes")).toBeVisible();
  await loadExample(page, "pancake_morning");
  for (const id of ["plan-size", "cost", "fps", "economics", "data-view", "system-layers"]) await expect(page.getByTestId(id)).toBeVisible();
  let calls = 0;
  await page.route("**/api/direct", async route => { calls++; await route.continue(); });
  await page.getByTestId("polish-moment").click();
  await page.getByTestId("remix-camera").click();
  await expect(page.getByTestId("remixed")).toBeVisible();
  await page.waitForTimeout(800);
  expect(calls).toBe(0);
  await expect(page.getByTestId("timeline")).toHaveAttribute("data-scope", "moment");
  await page.screenshot({ path: test.info().outputPath("behind-the-scenes.png") });
});

test("7b. rain and spooky music compile; playback schedules dialogue, foley and music", async ({ page }) => {
  await open(page);
  // This local Worker intentionally has no paid voice provider. Use a baked
  // selected-voice line; runtime generation is covered by the speech Worker tests.
  await typeMoment(page, 'It starts to rain. Spooky music. Masha runs home shouting "Bear, wait for me!"');
  await allSettled(page);
  const segs = await segments(page), seg = segs[segs.length - 1].segment;
  expect(seg.ambience.some(a => a.layers.includes("rain"))).toBe(true);
  expect(seg.music.some(m => m.mood === "spooky")).toBe(true);
  if (!(await page.evaluate(() => window.__mabear!.playing()))) await page.getByTestId("preview-moment").click();
  await expect.poll(async () => {
    const scheduled = await page.evaluate(() => (window as unknown as { __mabearAudio?: { scheduled: Record<string, number> } }).__mabearAudio?.scheduled);
    return !!scheduled && scheduled.dialogue > 0 && scheduled.foley > 0 && scheduled.music > 0;
  }, { timeout: 15_000 }).toBe(true);
});

test("8. real character close-ups render; playback loop stays active and draw calls remain below 200", async ({ page }) => {
  await open(page);
  await loadExample(page, "bears_nap");
  await page.getByTestId("play-all").click();
  const fpsSamples: number[] = [];
  for (let i = 0; i < 10; i++) {
    await page.waitForTimeout(1000);
    const stats = await page.evaluate(() => window.__mabear!.stats());
    if (stats) fpsSamples.push(stats.fps);
  }
  expect(fpsSamples).toHaveLength(10);
  const avg = fpsSamples.reduce((a, b) => a + b, 0) / fpsSamples.length;
  const stats = await page.evaluate(() => window.__mabear!.stats());
  // This is the requestAnimationFrame loop rate, not a GPU-drained throughput
  // measurement. See the paired scene benchmark for actual completed frames.
  console.log(`[render loop] average ticks/s over 10 s playback (${process.env.E2E_GPU === "hardware" ? "native GPU" : "SwiftShader"}): ${avg.toFixed(1)}; draw calls: ${stats?.drawCalls}`);
  expect(avg).toBeGreaterThan(10);
  expect(stats!.drawCalls).toBeLessThan(200);
  await stopIfPlaying(page);
  await page.getByTestId("new-story").click();
  await expect(page.getByTestId("moment-text")).toHaveValue("");
  await page.evaluate(() => window.__mabear!.closeup("masha", .35));
  await page.waitForTimeout(1200); await still(page, "masha-closeup.png");
  await page.evaluate(() => window.__mabear!.closeup("bear", -.35));
  await page.waitForTimeout(1200); await still(page, "bear-closeup.png");
  await page.evaluate(() => window.__mabear!.wide([8.6, 2.0, 3.2], [12.9, 1.05, -1.0], 40));
  await page.waitForTimeout(1200); await still(page, "wolves.png");
  await page.evaluate(() => window.__mabear!.closeup(null));
});

test("9. clicking a character while authoring never starts surprise playback or a director request", async ({ page }) => {
  await open(page);
  let calls = 0;
  await page.route("**/api/direct", async route => { calls++; await route.continue(); });
  const compiles = await page.evaluate(() => window.__mabear!.compiles());
  const uv = await page.evaluate(() => window.__mabear!.screenOf("masha"));
  expect(uv).not.toBeNull();
  for (const coordinate of uv!) { expect(coordinate).toBeGreaterThanOrEqual(0); expect(coordinate).toBeLessThanOrEqual(1); }
  const box = (await page.getByTestId("stage-canvas").boundingBox())!;
  await page.mouse.click(box.x + uv![0] * box.width, box.y + uv![1] * box.height);
  await page.waitForTimeout(1000);
  expect(await page.evaluate(() => window.__mabear!.playing())).toBe(false);
  expect(await page.evaluate(() => window.__mabear!.compiles())).toBe(compiles);
  expect(calls).toBe(0);
});

test("10. typing never directs or compiles; whole-story playback starts early, waits, and directs at most four dirty moments concurrently", async ({ page }) => {
  await open(page);
  let calls = 0, inflight = 0, maxInflight = 0;
  await page.route("**/api/direct", async route => {
    calls++; inflight++; maxInflight = Math.max(maxInflight, inflight);
    const body = JSON.parse(route.request().postData() ?? "{}") as { paragraph?: string };
    await new Promise(resolve => setTimeout(resolve, body.paragraph?.startsWith("Masha runs") ? 50 : 15_000));
    try { await route.continue(); } finally { inflight--; }
  });
  const compilesBefore = await page.evaluate(() => window.__mabear!.compiles());
  const texts = ["Masha runs to the swing.", "Bear walks to the garden.", "Masha jumps and laughs.", "Bear sits on the bench.", "Masha waves at Bear."];
  for (let i = 0; i < texts.length; i++) {
    if (i > 0) await page.getByTestId("add-next-moment").click();
    await page.getByTestId("moment-text").pressSequentially(texts[i], { delay: 5 });
  }
  await page.getByTestId("story-title").click();
  await page.waitForTimeout(2000);
  expect(calls).toBe(0);
  expect(await page.evaluate(() => window.__mabear!.compiles())).toBe(compilesBefore);
  expect(await page.evaluate(() => window.__mabear!.segments())).toBe(0);
  const statuses = await page.getByTestId("moment-card").evaluateAll(els => els.map(el => el.getAttribute("data-status")));
  expect(statuses).toEqual(Array(5).fill("draft"));
  await page.getByTestId("play-all").click();
  await expect.poll(() => page.evaluate(() => window.__mabear!.playing()), { timeout: 20_000 }).toBe(true);
  const directing = await page.getByTestId("moment-card").evaluateAll(els => els.filter(el => el.getAttribute("data-status") === "directing").length);
  expect(directing).toBeGreaterThan(0);
  await expect(page.getByTestId("getting-ready")).toBeVisible({ timeout: 20_000 });
  await expect.poll(async () => (await page.getByTestId("moment-card").evaluateAll(els => els.map(el => el.getAttribute("data-status")))).every(status => status === "ready"), { timeout: 60_000 }).toBe(true);
  await expect(page.getByTestId("getting-ready")).toHaveCount(0, { timeout: 10_000 });
  expect(calls).toBe(5); expect(maxInflight).toBe(4);
  expect(await page.evaluate(() => window.__mabear!.segments())).toBe(5);
  await stopIfPlaying(page);
  await page.getByTestId("play-all").click();
  await page.waitForTimeout(1000);
  expect(calls).toBe(5);
});

test("11. selecting moments edits without playback; explicit preview plays the selected moment", async ({ page }) => {
  await open(page);
  await loadExample(page, "pancake_morning");
  await page.getByTestId("moment-card").nth(1).click();
  const secondText = await page.getByTestId("moment-text").inputValue();
  await page.getByTestId("moment-card").nth(2).click();
  await page.getByTestId("moment-text").click();
  await page.waitForTimeout(1200);
  expect(await page.evaluate(() => window.__mabear!.playing())).toBe(false);
  await expect(page.getByTestId("moment-text")).toHaveCount(1);
  await page.getByTestId("moment-card").nth(1).click();
  await expect(page.getByTestId("moment-text")).toHaveValue(secondText);
  await page.getByTestId("preview-moment").click();
  await expect.poll(() => page.evaluate(() => window.__mabear!.playing()), { timeout: 10_000 }).toBe(true);
  await expect(page.locator('[data-testid="moment-card"][data-active="1"]')).toHaveCount(1);
  await expect(page.getByTestId("moment-card").nth(1)).toHaveAttribute("data-active", "1");
  await expect(page.getByTestId("moment-card").nth(1)).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("timeline")).toHaveAttribute("data-scope", "moment");
});

test("12. multiline editing stays in one moment; insertion, removal and keyboard preview are explicit", async ({ page }) => {
  await open(page);
  let calls = 0;
  await page.route("**/api/direct", async route => { calls++; await route.continue(); });
  const editor = page.getByTestId("moment-text");
  await editor.fill("Masha runs to the swing.");
  await editor.press("Enter"); await editor.pressSequentially("Bear naps.", { delay: 5 });
  await editor.press("Shift+Enter"); await editor.pressSequentially("He snores.", { delay: 5 });
  const direction = "Masha runs to the swing.\nBear naps.\nHe snores.";
  await expect(editor).toHaveValue(direction);
  await expect(page.getByTestId("moment-card")).toHaveCount(1);
  await page.getByTestId("story-title").click(); await page.waitForTimeout(2000);
  expect(calls).toBe(0); expect(await page.evaluate(() => window.__mabear!.segments())).toBe(0);
  await editor.press(process.platform === "darwin" ? "Meta+Enter" : "Control+Enter");
  await allSettled(page);
  await expect.poll(() => page.evaluate(() => window.__mabear!.playing())).toBe(true);
  expect(calls).toBe(1);
  await stopIfPlaying(page);
  await page.getByTestId("add-next-moment").click();
  await expect(page.getByTestId("moment-card")).toHaveCount(2);
  await expect(editor).toHaveValue("");
  await expect(page.getByTestId("add-next-moment")).toBeDisabled();
  await editor.press("Enter"); await editor.press("Backspace");
  await expect(editor).toHaveValue("");
  await expect(page.getByTestId("moment-card")).toHaveCount(2);
  await editor.fill("A temporary moment.");
  await page.getByRole("button", { name: "Scene options", exact: true }).click();
  await page.getByTestId("request-remove-moment").click();
  await page.getByTestId("keep-moment").click();
  await expect(page.getByTestId("moment-card")).toHaveCount(2);
  await expect(editor).toHaveValue("A temporary moment.");
  if (!(await page.getByTestId("request-remove-moment").isVisible())) await page.getByRole("button", { name: "Scene options", exact: true }).click();
  await page.getByTestId("request-remove-moment").click();
  await page.getByTestId("remove-moment").click();
  await expect(page.getByTestId("moment-card")).toHaveCount(1);
  await expect(editor).toHaveValue(direction);
  await expect(page.getByTestId("moment-card").first()).toHaveAttribute("data-version", "1");
  expect(calls).toBe(1);
});

test("fullscreen retains controls; keyboard seeks respect whole-story and selected-moment bounds", async ({ page }) => {
  await open(page);
  await loadExample(page, "bears_nap");
  await page.getByRole("button", { name: "Fullscreen", exact: true }).click();
  await expect.poll(() => page.evaluate(() => document.fullscreenElement?.classList.contains("stage-col"))).toBe(true);
  await expect(page.getByTestId("play")).toBeVisible();
  await page.getByTestId("play").click();
  await expect(page.getByTestId("pause")).toBeVisible();
  await stopIfPlaying(page);
  const story = page.getByRole("slider", { name: "Story progress", exact: true });
  await story.press("Home"); await story.press("ArrowLeft");
  await expect(story).toHaveAttribute("aria-valuenow", "0");
  await story.press("End"); await story.press("ArrowRight");
  expect(Number(await story.getAttribute("aria-valuenow"))).toBeCloseTo(Number(await story.getAttribute("aria-valuemax")), 6);
  await page.getByRole("button", { name: "Fullscreen", exact: true }).click();
  await expect.poll(() => page.evaluate(() => document.fullscreenElement === null)).toBe(true);
  await page.getByTestId("moment-card").nth(1).click();
  await page.getByTestId("scope-moment").click();
  const moment = page.getByRole("slider", { name: "Scene progress", exact: true });
  const expected = (await segments(page))[1];
  await moment.press("Home"); await moment.press("ArrowLeft");
  await expect(moment).toHaveAttribute("aria-valuenow", "0");
  expect(await page.evaluate(() => window.__mabear!.t())).toBeCloseTo(expected.offset, 2);
  await moment.press("End"); await moment.press("ArrowRight");
  expect(Number(await moment.getAttribute("aria-valuenow"))).toBeCloseTo(Number(await moment.getAttribute("aria-valuemax")), 6);
  expect(await page.evaluate(() => window.__mabear!.t())).toBeCloseTo(expected.offset + expected.segment.duration, 2);
  await expect(page.getByTestId("moment-card").nth(1)).toHaveAttribute("aria-pressed", "true");
});
