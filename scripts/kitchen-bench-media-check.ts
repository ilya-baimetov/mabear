import { chromium } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
import { sourceFingerprint } from './parallel-interactions-utils';

const source = await sourceFingerprint();
const captured = JSON.parse(await readFile('docs/kitchen-bench/after/proof.json', 'utf8'));
if (!captured.stable || captured.source !== source || captured.errors.length) {
  throw Error('Recordings must match the frozen, error-free runtime source');
}
const browser = await chromium.launch({ channel: 'chrome', headless: false });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await page.addInitScript('globalThis.__name=x=>x');
  await page.goto('http://127.0.0.1:8821/docs/kitchen-bench/');
  const results = [];
  for (const id of ['kitchen', 'bench']) {
    const video = page.locator(`video[src="${id}-before-after.mp4"]`);
    await video.evaluate((v: HTMLVideoElement) => { v.muted = true; v.load(); });
    await page.waitForFunction(id => {
      const v = document.querySelector(`video[src="${id}-before-after.mp4"]`) as HTMLVideoElement;
      return v.readyState >= 2 && Number.isFinite(v.duration);
    }, id);
    const info = await video.evaluate((v: HTMLVideoElement) => ({
      duration: v.duration, width: v.videoWidth, height: v.videoHeight,
    }));
    await video.evaluate(async (v: HTMLVideoElement) => {
      v.playbackRate = 4; v.currentTime = 0; await v.play();
    });
    await page.waitForFunction(id =>
      (document.querySelector(`video[src="${id}-before-after.mp4"]`) as HTMLVideoElement).ended,
    id, { timeout: 120000 });
    const ended = await video.evaluate((v: HTMLVideoElement) => ({
      t: v.currentTime, error: v.error?.message ?? null,
      decoded: v.getVideoPlaybackQuality().totalVideoFrames,
    }));
    await video.evaluate((v: HTMLVideoElement) => { v.currentTime = v.duration * .5; });
    await page.waitForTimeout(300);
    await video.screenshot({ path: `docs/kitchen-bench/${id}-media-proof.png` });
    results.push({ id, ...info, ...ended });
    if (ended.error || !ended.decoded || !info.width || Math.abs(ended.t - info.duration) > .05) {
      throw Error(`Incomplete playback: ${JSON.stringify(results.at(-1))}`);
    }
  }
  const sheets = [];
  for (const id of ['kitchen', 'bench']) {
    // Decode the actual exported video, including short transition shots. Native
    // stills alone previously missed a 250 ms camera gap behind the kitchen wall.
    const decoded = await page.evaluate(async id => {
      const proof = await (await fetch('/docs/kitchen-bench/after/proof.json')).json();
      const r = proof.recordings.find((x: any) => x.id === id);
      const v = document.createElement('video'); v.muted = true;
      v.src = `/docs/kitchen-bench/after/${id}.mp4`;
      await new Promise<void>((resolve, reject) => {
        v.addEventListener('loadeddata', () => resolve(), { once: true });
        v.addEventListener('error', () => reject(Error('Could not decode raw recording')), { once: true });
      });
      const actionTimes = r.timeline.segments.flatMap((e: any) => ['masha', 'bear'].flatMap(actor =>
        e.segment.actorClips[actor].filter((c: any) => !c.params.ambient)
          .map((c: any) => e.offset + c.start + c.dur * .55)));
      const cameraTimes = r.timeline.segments.flatMap((e: any) => e.segment.camera
        .filter((c: any) => c.dur > .01).map((c: any) => e.offset + c.start + c.dur * .5));
      const sets = [
        { name: `${id}-contact-sheet`, times: actionTimes },
        { name: `${id}-camera-sheet`, times: cameraTimes },
        ...(id === 'kitchen' ? [{ name: 'kitchen-final-sequence', times: Array.from(
          { length: 32 }, (_, i) => Math.max(0, r.duration - 8) + i * .25) }] : []),
      ];
      const outputs = [];
      for (const set of sets) {
        const c = document.createElement('canvas'); c.width = 1920;
        c.height = Math.ceil(set.times.length / 4) * 312;
        const ctx = c.getContext('2d')!; ctx.fillStyle = '#14201a'; ctx.fillRect(0, 0, c.width, c.height);
        for (const [i, rawTime] of set.times.entries()) {
          const t = Math.min(v.duration - .02, Math.max(.001, rawTime as number));
          await new Promise<void>(resolve => {
            v.addEventListener('seeked', () => resolve(), { once: true }); v.currentTime = t;
          });
          const x = (i % 4) * 480, y = Math.floor(i / 4) * 312;
          ctx.drawImage(v, x, y, 480, 288);
          ctx.fillStyle = '#ffffff'; ctx.font = '16px system-ui';
          ctx.fillText(`${id} · ${t.toFixed(3)} s`, x + 8, y + 307);
        }
        outputs.push({ name: set.name, times: set.times, png: c.toDataURL() });
      }
      return outputs;
    }, id);
    for (const { name, times, png } of decoded) {
      await writeFile(`docs/kitchen-bench/${name}.png`, Buffer.from(png.split(',')[1], 'base64'));
      sheets.push({ name, times });
    }
  }
  const stable = source === await sourceFingerprint();
  await writeFile('docs/kitchen-bench/media-playback.json', JSON.stringify({
    source, stable, capturedAt: new Date().toISOString(), results, sheets,
  }, null, 2));
  if (!stable) throw Error('Runtime source changed during media review');
  console.log(JSON.stringify({ source, stable, results }));
} finally { await browser.close(); }
