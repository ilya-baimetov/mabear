import { expect, test } from "@playwright/test";
import { login } from "./login";

test("short desktop and tablet layouts keep writing and playback controls usable", async ({ page }) => {
  test.setTimeout(90_000);
  await login(page);
  await page.goto("/");
  await expect(page.locator(".stage-loading")).toHaveCount(0, { timeout: 90_000 });
  await page.getByTestId("examples").click();
  await page.getByTestId("example-cozy_evening").click();

  for (const [width, height] of [[1440, 860], [1440, 800], [1280, 720], [1024, 768], [901, 720], [900, 844], [801, 844], [390, 844], [320, 740]]) {
    await page.setViewportSize({ width, height });
    for (const moment of [0, 1]) {
      await page.getByTestId("moment-card").nth(moment).click();
      // Selecting a card may scroll the document, but must not require finding
      // and scrolling an invisible inner editor merely to discover the writing.
      const geometry = await page.evaluate(() => {
        const input = document.querySelector<HTMLTextAreaElement>('[data-testid="moment-text"]')!;
        const scroll = document.querySelector('.moment-editor-scroll')!;
        const i = input.getBoundingClientRect(), s = scroll.getBoundingClientRect();
        const stage = document.querySelector('[data-testid="stage"]')!.getBoundingClientRect();
        const transport = document.querySelector('.moment-transport')!;
        const t = transport.getBoundingClientRect();
        return {
          width: document.documentElement.scrollWidth,
          visibleWriting: Math.max(0, Math.min(i.bottom, s.bottom) - Math.max(i.top, s.top)),
          canvasOverlap: getComputedStyle(transport).position === 'fixed' ? 0 : Math.max(0, stage.bottom - t.top),
        };
      });
      expect(geometry.width, `${width}x${height}: horizontal overflow`).toBe(width);
      expect(geometry.visibleWriting, `${width}x${height}, moment ${moment + 1}: writing hidden`).toBeGreaterThanOrEqual(75);
      expect(geometry.canvasOverlap, `${width}x${height}: controls overlap canvas`).toBeLessThanOrEqual(1);
    }
    await page.getByTestId("play").scrollIntoViewIfNeeded();
    expect(await page.getByTestId("play").evaluate(button => {
      const r = button.getBoundingClientRect();
      return button.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2));
    }), `${width}x${height}: Play must receive clicks`).toBe(true);
  }

  await page.getByTestId("lang-ru").click();
  const scope = await page.getByTestId("scope-moment").boundingBox();
  expect(scope!.x).toBeGreaterThanOrEqual(0);
  expect(scope!.x + scope!.width).toBeLessThanOrEqual(320);
});
