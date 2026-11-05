// E2E (spec §13): app against the real Worker (wrangler dev) + mock director.
import { expect, test, type Page } from "@playwright/test";
import { E2E_PASSWORD } from "../../playwright.config";

const SHOTS = "docs/screenshots";

interface SegLike {
  segment: {
    dialogue: { actor: string; text: string }[];
    ambience: { layers: string[] }[];
    music: { mood: string }[];
  };
}

async function login(page: Page) {
  const res = await page.request.post("/login", { form: { password: E2E_PASSWORD }, maxRedirects: 0 });
  expect([200, 302, 303]).toContain(res.status());
}

// The 3D stage takes a while to boot under headless SwiftShader (and other suites may share the CPU), so allow
// more than the config's 90 s per test; the FPS / draw-call assertions in test 8 still guard performance.
test.describe.configure({ timeout: 180_000 });

// Each test gets a fresh browser context, so localStorage already starts empty: one navigation is enough
// (a second page load would boot the 3D stage twice).
async function open(page: Page, query = "") {
  await login(page);
  await page.goto(`/${query}`);
  await expect(page.getByTestId("stage-canvas")).toBeVisible();
  await page.waitForFunction(() => !!window.__mabear, null, { timeout: 60_000 });
}

/** Pixel variance of the canvas from a real screenshot (decoded in the page via a 2D canvas). */
async function canvasVariance(page: Page): Promise<number> {
  const png = await page.getByTestId("stage-canvas").screenshot();
  const dataUrl = `data:image/png;base64,${png.toString("base64")}`;
  return page.evaluate(async (src) => {
    const img = new Image();
    img.src = src;
    await img.decode();
    const c = document.createElement("canvas");
    c.width = img.width;
    c.height = img.height;
    const ctx = c.getContext("2d")!;
    ctx.drawImage(img, 0, 0);
    const d = ctx.getImageData(0, 0, c.width, c.height).data;
    let sum = 0;
    let sum2 = 0;
    let n = 0;
    for (let i = 0; i < d.length; i += 16) {
      const l = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
      sum += l;
      sum2 += l * l;
      n++;
    }
    const mean = sum / n;
    return sum2 / n - mean * mean;
  }, dataUrl);
}

async function allSettled(page: Page) {
  await expect
    .poll(async () => {
      const st = await page.getByTestId("paragraph-card").evaluateAll((els) => els.map((e) => e.getAttribute("data-status")));
      return st.length > 0 && st.every((s) => s === "ready" || s === "adjusted");
    }, { timeout: 30_000 })
    .toBe(true);
}

async function segments(page: Page): Promise<SegLike[]> {
  return page.evaluate(() => (window.__mabear!.timeline() as { segments: SegLike[] }).segments);
}

async function typeParagraph(page: Page, text: string) {
  await page.getByTestId("add-paragraph").click();
  const ta = page.getByTestId("paragraph-text").last();
  await ta.fill(text);
  await ta.press("Control+Enter");
}

test("1. app loads and the canvas renders a non-blank frame", async ({ page }) => {
  await open(page);
  await page.waitForTimeout(1500);
  const v = await canvasVariance(page);
  expect(v).toBeGreaterThan(50);
});

test("2. Pancake morning example: all ready, Play all advances the playhead and highlights the active card", async ({ page }) => {
  await open(page);
  await page.getByTestId("chip-pancake_morning").click();
  await expect.poll(async () => page.getByTestId("paragraph-card").count()).toBeGreaterThanOrEqual(3);
  await allSettled(page);
  await page.getByTestId("play-all").click();
  await expect.poll(async () => Number(await page.getByTestId("playhead").getAttribute("data-t")), { timeout: 15_000 }).toBeGreaterThan(0.5);
  await expect(page.locator('[data-testid="paragraph-card"][data-active="1"]')).toHaveCount(1);
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${SHOTS}/player.png` });
});

test("3. typing a new 2-sentence paragraph reaches ready and grows the timeline", async ({ page }) => {
  await open(page);
  await page.getByTestId("chip-bears_nap").click();
  await allSettled(page);
  const before = Number(await page.getByTestId("timeline").getAttribute("data-duration"));
  await typeParagraph(page, "Masha runs to the swing. She swings and laughs.");
  await allSettled(page);
  await expect.poll(async () => Number(await page.getByTestId("timeline").getAttribute("data-duration"))).toBeGreaterThan(before);
});

test("4. editing paragraph 2 makes exactly one director request; other cards keep their versions", async ({ page }) => {
  await open(page);
  await page.getByTestId("chip-fishing_trip").click();
  await allSettled(page);
  const versionsBefore = await page.getByTestId("paragraph-card").evaluateAll((els) => els.map((e) => e.getAttribute("data-version")));
  let calls = 0;
  await page.route("**/api/direct", async (route) => {
    calls++;
    await route.continue();
  });
  const ta = page.getByTestId("paragraph-text").nth(1);
  await ta.fill("Masha jumps on the pier and waves at Bear.");
  await ta.press("Control+Enter");
  await allSettled(page);
  await page.waitForTimeout(1000);
  expect(calls).toBe(1);
  const versionsAfter = await page.getByTestId("paragraph-card").evaluateAll((els) => els.map((e) => e.getAttribute("data-version")));
  expect(versionsAfter[1]).toBe("2");
  versionsAfter.forEach((v, i) => {
    if (i !== 1) expect(v).toBe(versionsBefore[i]);
  });
});

test("5. canon: Bear says thank you → no Bear dialogue and an adjusted chip", async ({ page }) => {
  await open(page);
  await typeParagraph(page, "Bear says thank you to Masha.");
  await expect(page.getByTestId("paragraph-card").first()).toHaveAttribute("data-status", "adjusted", { timeout: 30_000 });
  const segs = await segments(page);
  expect(segs.length).toBe(1);
  expect(segs[0].segment.dialogue.filter((d) => d.actor === "bear")).toHaveLength(0);
  // D4, second half: a weapon is swapped for something safe before anything renders → adjusted as well
  await typeParagraph(page, "Masha grabs a knife.");
  await expect(page.getByTestId("paragraph-card").nth(1)).toHaveAttribute("data-status", "adjusted", { timeout: 30_000 });
  const rules = await page.evaluate(() => (JSON.parse(localStorage.getItem("mabear.log") ?? "[]") as { ruleHits: { rule: string }[] }[]).flatMap((e) => e.ruleHits.map((h) => h.rule)));
  expect(rules).toContain("bear_silent");
  expect(rules).toContain("no_weapons");
});

test("6. EN → RU toggle switches UI strings and a RU example loads", async ({ page }) => {
  await open(page);
  await expect(page.getByTestId("add-paragraph")).toContainText("Add paragraph");
  await page.getByTestId("lang-ru").click();
  await expect(page.getByTestId("add-paragraph")).toContainText("Добавить абзац");
  await expect(page.getByTestId("examples")).toContainText("Примеры");
  await expect(page.getByTestId("new-story")).toContainText("Новая");
  await page.getByTestId("chip-pancake_morning").click();
  await allSettled(page);
  const text = await page.getByTestId("paragraph-text").first().inputValue();
  expect(text).toMatch(/[А-Яа-яЁё]/);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${SHOTS}/ru-mode.png` });
});

test("7. Behind the scenes: shown only with ?pitch=1; plan size, cost, FPS, economics; remix makes no director call", async ({ page }) => {
  await login(page);
  await page.goto("/");
  await expect(page.getByTestId("add-paragraph")).toBeVisible();
  await expect(page.getByTestId("behind-the-scenes")).toHaveCount(0);
  await open(page, "?pitch=1");
  await expect(page.getByTestId("behind-the-scenes")).toBeVisible();
  await page.getByTestId("chip-pancake_morning").click();
  await allSettled(page);
  for (const id of ["plan-size", "cost", "fps", "economics", "data-view", "system-layers"]) await expect(page.getByTestId(id)).toBeVisible();
  let calls = 0;
  await page.route("**/api/direct", async (route) => {
    calls++;
    await route.continue();
  });
  await page.getByTestId("remix-camera").first().click();
  await expect(page.getByTestId("remixed")).toBeVisible();
  await page.waitForTimeout(800);
  expect(calls).toBe(0);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${SHOTS}/behind-the-scenes.png` });
});

test("7b. sound: rain + spooky music compile; playback schedules dialogue, foley and music", async ({ page }) => {
  await open(page);
  await typeParagraph(page, 'It starts to rain. Spooky music. Masha runs home shouting "Bear!"');
  await allSettled(page);
  const segs = await segments(page);
  const seg = segs[segs.length - 1].segment;
  expect(seg.ambience.some((a) => a.layers.includes("rain"))).toBe(true);
  expect(seg.music.some((m) => m.mood === "spooky")).toBe(true);
  await page.getByTestId("play-all").click();
  await expect
    .poll(async () => page.evaluate(() => (window as unknown as { __mabearAudio?: { scheduled: Record<string, number> } }).__mabearAudio?.scheduled ?? null), { timeout: 15_000 })
    .toMatchObject({ dialogue: expect.any(Number) });
  await expect
    .poll(async () => {
      const s = await page.evaluate(() => (window as unknown as { __mabearAudio?: { scheduled: Record<string, number> } }).__mabearAudio?.scheduled);
      return !!s && s.dialogue > 0 && s.foley > 0 && s.music > 0;
    }, { timeout: 15_000 })
    .toBe(true);
});

test("8. close-up screenshots + performance (FPS > 10 headless, draw calls < 200)", async ({ page }) => {
  await open(page);
  await page.getByTestId("chip-bears_nap").click();
  await allSettled(page);
  await page.getByTestId("play-all").click();
  const fpsSamples: number[] = [];
  for (let i = 0; i < 10; i++) {
    await page.waitForTimeout(1000);
    const st = await page.evaluate(() => window.__mabear!.stats());
    if (st) fpsSamples.push(st.fps);
  }
  const avg = fpsSamples.reduce((a, b) => a + b, 0) / Math.max(1, fpsSamples.length);
  const stats = await page.evaluate(() => window.__mabear!.stats());
  console.log(`[perf] average FPS over 10 s playback (headless SwiftShader): ${avg.toFixed(1)}; draw calls: ${stats?.drawCalls}`);
  expect(avg).toBeGreaterThan(10);
  expect(stats!.drawCalls).toBeLessThan(200);
  await page.getByTestId("pause").click().catch(() => undefined);
  await page.getByTestId("new-story").click();
  await page.waitForTimeout(500);
  await page.evaluate(() => window.__mabear!.closeup("masha", 0.35));
  await page.waitForTimeout(1200);
  await page.getByTestId("stage-canvas").screenshot({ path: `${SHOTS}/masha-closeup.png` });
  await page.evaluate(() => window.__mabear!.closeup("bear", -0.35));
  await page.waitForTimeout(1200);
  await page.getByTestId("stage-canvas").screenshot({ path: `${SHOTS}/bear-closeup.png` });
  await page.evaluate(() => window.__mabear!.closeup(null));
});

test("9. tap a character after the story → it reacts locally (no director call)", async ({ page }) => {
  await open(page);
  let calls = 0;
  await page.route("**/api/direct", async (route) => {
    calls++;
    await route.continue();
  });
  await page.waitForTimeout(1000);
  const uv = await page.evaluate(() => window.__mabear!.screenOf("masha"));
  expect(uv).not.toBeNull();
  const box = (await page.getByTestId("stage-canvas").boundingBox())!;
  await page.mouse.click(box.x + uv![0] * box.width, box.y + uv![1] * box.height);
  await expect.poll(async () => page.evaluate(() => window.__mabear!.playing()), { timeout: 10_000 }).toBe(true);
  expect(calls).toBe(0);
});
