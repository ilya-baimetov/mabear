import { expect, test } from "@playwright/test";
import { login } from "./login";
import { mkdirSync } from "node:fs";

test("short desktop and tablet layouts keep writing and playback controls usable", async ({ page }) => {
  test.setTimeout(180_000);
  await login(page);
  await page.goto("/");
  await expect(page.locator(".stage-loading")).toHaveCount(0, { timeout: 90_000 });
  await page.getByTestId("examples").click();
  await page.getByTestId("example-cozy_evening").click();

  for (const [width, height] of [[1440, 860], [1440, 650], [1440, 800], [1280, 720], [1024, 768], [901, 720], [900, 844], [801, 844], [390, 844], [320, 740]]) {
    await page.setViewportSize({ width, height });
    for (const moment of [0, 1]) {
      await page.getByTestId("moment-card").nth(moment).click();
      // Selecting a card may scroll the document, but must not require finding
      // and scrolling an invisible inner editor merely to discover the writing.
      const geometry = await page.evaluate(() => {
        const input = document.querySelector<HTMLTextAreaElement>('[data-testid="moment-text"]')!;
        const scroll = document.querySelector('.scene-writing-area')!;
        const i = input.getBoundingClientRect(), s = scroll.getBoundingClientRect();
        const stage = document.querySelector('[data-testid="stage"]')!.getBoundingClientRect();
        const transport = document.querySelector('.moment-transport')!;
        const t = transport.getBoundingClientRect();
        const editor = document.querySelector('.moment-workbench')!.getBoundingClientRect();
        const viewer = document.querySelector('.stage-col')!.getBoundingClientRect();
        const storyboard = document.querySelector('.moment-sequence')!.getBoundingClientRect();
        return {
          width: document.documentElement.scrollWidth,
          visibleWriting: Math.max(0, Math.min(i.bottom, s.bottom) - Math.max(i.top, s.top)),
          canvasOverlap: getComputedStyle(transport).position === 'fixed' ? 0 : Math.max(0, stage.bottom - t.top),
          writingHeight: i.height, resize: getComputedStyle(input).resize,
          editorTop: editor.top, editorBottom: editor.bottom, editorLeft: editor.left, editorWidth: editor.width,
          viewerTop: viewer.top, viewerLeft: viewer.left, viewerRight: viewer.right,
          boardBottom: storyboard.bottom, boardLeft: storyboard.left, boardRight: storyboard.right, boardHeight: storyboard.height,
        };
      });
      expect(geometry.width, `${width}x${height}: horizontal overflow`).toBe(width);
      expect(geometry.visibleWriting, `${width}x${height}, moment ${moment + 1}: writing hidden`).toBeGreaterThanOrEqual(75);
      expect(geometry.canvasOverlap, `${width}x${height}: controls overlap canvas`).toBeLessThanOrEqual(1);
      expect(geometry.resize).toBe("none");
      expect(geometry.writingHeight, `${width}x${height}: generous scene field`).toBeGreaterThanOrEqual(220);
      if (width > 900) {
        expect(Math.abs(geometry.editorTop-geometry.viewerTop)).toBeLessThan(2);
        expect(Math.abs(geometry.editorBottom-geometry.boardBottom)).toBeLessThan(2);
        expect(Math.abs(geometry.boardLeft-geometry.viewerLeft)).toBeLessThan(2);
        expect(Math.abs(geometry.boardRight-geometry.viewerRight)).toBeLessThan(2);
        expect(geometry.editorLeft).toBeGreaterThan(geometry.viewerRight);
        expect(geometry.boardHeight).toBeLessThan(190);
        expect(geometry.editorWidth/width).toBeGreaterThan(.28);
        expect(geometry.editorWidth/width).toBeLessThan(.4);
      }
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
  mkdirSync('docs/vertical-studio',{recursive:true});
  await page.setViewportSize({width:1440,height:860});
  await page.evaluate(()=>window.scrollTo(0,0));
  await page.screenshot({path:'docs/vertical-studio/desktop-ru.png'});
  await page.getByTestId('direction-tools').click();
  await expect(page.locator('[data-testid^="insert-cast-"]')).toHaveCount(9);
  await page.getByTestId('place-tools').click();
  await expect(page.locator('[data-testid^="insert-place-"]')).toHaveCount(19);
  await expect(page.locator('[data-testid^="insert-cast-"]')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('place-tools')).toBeFocused();
  await expect(page.getByTestId('scene-toolbar-panel')).toHaveCount(0);
  const originalText = await page.getByTestId('moment-text').inputValue();
  await page.getByTestId('moment-text').fill('');
  await page.getByTestId('direction-tools').click();
  await page.getByTestId('insert-cast-rival_bear').click();
  await expect(page.getByTestId('moment-text')).toHaveValue('Медведь-спортсмен');
  await page.getByTestId('place-tools').click();
  await page.getByTestId('insert-place-van').click();
  await expect(page.getByTestId('moment-text')).toHaveValue('Медведь-спортсмен скорая помощь');
  await page.getByTestId('moment-text').click();
  await expect(page.getByTestId('scene-toolbar-panel')).toHaveCount(0);
  const atLimit = 'x'.repeat(590) + ' KEEP TAIL';
  await page.getByTestId('moment-text').fill(atLimit);
  await page.getByTestId('moment-text').evaluate(el => (el as HTMLTextAreaElement).setSelectionRange(4, 4));
  await page.getByTestId('direction-tools').click();
  await page.getByTestId('insert-cast-rival_bear').click();
  await expect(page.getByTestId('moment-text')).toHaveValue(atLimit);
  await expect(page.getByTestId('insertion-limit-note')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.getByTestId('moment-text').fill('Маша.\n'.repeat(80));
  const toolbarBefore = await page.locator('.scene-toolbar').boundingBox();
  const scroll = await page.getByTestId('moment-text').evaluate(el => {
    const input = el as HTMLTextAreaElement;
    input.scrollTop = input.scrollHeight;
    return { top: input.scrollTop, height: input.clientHeight, full: input.scrollHeight };
  });
  expect(scroll.top).toBeGreaterThan(0);
  expect(scroll.full).toBeGreaterThan(scroll.height);
  expect(await page.locator('.scene-toolbar').boundingBox()).toEqual(toolbarBefore);
  await page.getByTestId('moment-text').fill(originalText);
  await page.getByTestId('moment-card').nth(1).click();
  await page.getByTestId('scene-options').click();
  await expect(page.getByTestId('move-moment-earlier')).toBeEnabled();
  await page.getByTestId('move-moment-earlier').click();
  await expect(page.getByTestId('order-change-note')).toBeVisible();
});
