import {chromium} from '@playwright/test';
import {writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const browser = await chromium.launch({channel: 'chrome'});
const folder = 'docs/interior-reference';
const report = {errors: [], views: [], checks: []};
try {
  const page = await browser.newPage({viewport: {width: 1600, height: 1050}});
  page.on('pageerror', error => report.errors.push(error.message));
  await page.goto(pathToFileURL(resolve(folder, 'blockout.html')).href);
  await page.waitForFunction(() => window.__interiorBlockout);
  for (const view of ['connection', 'kitchen', 'corner', 'opposite', 'architecture', 'reveal', 'plan']) {
    await page.locator(`[data-view="${view}"]`).click();
    await page.waitForTimeout(300);
    const data = await page.evaluate(() => ({
      view: window.__interiorBlockout.view,
      referenceLoaded: [...document.querySelectorAll('img')].every(img => img.complete && img.naturalWidth > 0),
      horizontalOverflow: document.documentElement.scrollWidth > innerWidth,
      paneHeights: [...document.querySelectorAll('.panes figure')].map(figure => figure.clientHeight),
      png: window.__interiorBlockout.snapshot(),
    }));
    await writeFile(`${folder}/blockout-${view}.png`, Buffer.from(data.png.split(',')[1], 'base64'));
    delete data.png; report.views.push(data);
    await page.screenshot({path: `${folder}/blockout-${view}-comparison.png`, fullPage: true});
    await page.locator('.panes').screenshot({path: `${folder}/shapes-${view}-side-by-side.png`});
  }
  await page.locator('[data-view="connection"]').click();
  const referencePosition = await page.evaluate(() => window.__interiorBlockout.camera.position.toArray());
  await page.locator('#camera-mode').selectOption('overview');
  const overviewPosition = await page.evaluate(() => window.__interiorBlockout.camera.position.toArray());
  report.checks.push({name: 'overview changes camera', passed: referencePosition.some((v, i) => Math.abs(v - overviewPosition[i]) > .1)});
  for (const view of ['connection', 'kitchen', 'opposite', 'architecture']) {
    await page.locator(`[data-view="${view}"]`).click();
    await page.locator('.panes').screenshot({path: `${folder}/shapes-${view}-overview.png`});
  }
  await page.locator('#camera-mode').selectOption('reference');
  await page.locator('[data-view="corner"]').click();
  const geometry = await page.evaluate(() => {
    let meshes = 0, mapped = 0, nonfinite = 0;
    window.__interiorBlockout.scene.traverse(o => {
      for (const value of [...o.position.toArray(),...o.scale.toArray(),...o.quaternion.toArray()]) if (!Number.isFinite(value)) nonfinite++;
      if (!o.isMesh) return; meshes++;
      for (const mat of Array.isArray(o.material) ? o.material : [o.material]) if (mat.map || mat.normalMap || mat.roughnessMap || mat.bumpMap) mapped++;
      const pos = o.geometry.getAttribute('position'); for (const value of pos.array) if (!Number.isFinite(value)) nonfinite++;
    });
    return {meshes, mapped, nonfinite};
  });
  report.checks.push({name: 'finite geometry and no texture maps', passed: geometry.meshes > 200 && geometry.mapped === 0 && geometry.nonfinite === 0, ...geometry});
  const initialCamera = await page.evaluate(() => window.__interiorBlockout.camera.position.toArray());
  const bounds = await page.locator('canvas').boundingBox();
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  await page.mouse.down(); await page.mouse.move(bounds.x + bounds.width / 2 + 80, bounds.y + bounds.height / 2 + 30, {steps: 8}); await page.mouse.up();
  await page.waitForTimeout(800);
  const movedCamera = await page.evaluate(() => window.__interiorBlockout.camera.position.toArray());
  await page.locator('#reset').click(); await page.waitForTimeout(700);
  const resetCamera = await page.evaluate(() => window.__interiorBlockout.camera.position.toArray());
  report.checks.push({name: 'orbit changes camera', passed: initialCamera.some((v, i) => Math.abs(v - movedCamera[i]) > .05)});
  report.checks.push({name: 'reset restores camera', passed: initialCamera.every((v, i) => Math.abs(v - resetCamera[i]) < .01)});
  await page.locator('#scale').check();
  const shownFigures = await page.evaluate(() => window.__interiorBlockout.scene.children[0].children.filter(o => o.isGroup && o.children.some(c => c.geometry?.type === 'SphereGeometry')).some(o => o.visible));
  await page.locator('#scale').uncheck();
  const noFigures = await page.evaluate(() => window.__interiorBlockout.scene.children[0].children.filter(o => o.isGroup && o.children.some(c => c.geometry?.type === 'SphereGeometry')).every(o => !o.visible));
  report.checks.push({name: 'scale figure toggle', passed: shownFigures && noFigures});
  await page.setViewportSize({width: 390, height: 844});
  await page.locator('[data-view="plan"]').click(); await page.waitForTimeout(300);
  report.checks.push({name: 'mobile has no horizontal overflow', passed: await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)});
  await page.screenshot({path: `${folder}/blockout-mobile.png`, fullPage: true});
  await writeFile(`${folder}/blockout-verification.json`, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
  if (report.errors.length || report.views.some(v => !v.referenceLoaded || v.horizontalOverflow) || report.checks.some(c => !c.passed)) process.exitCode = 1;
} finally {await browser.close();}
