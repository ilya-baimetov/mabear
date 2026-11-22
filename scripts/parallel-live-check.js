// Run through Playwright MCP browser_run_code_unsafe after deployment.
// The original authenticated tab is only read for game-origin cookies. Cookies
// remain in memory; a new browser context owns all test stories and API blocks.
// The caller persists the returned proof as JSON; this callback saves only its
// screenshot through Playwright and does not require Node filesystem imports.
async (originalPage) => {
  const origin = 'https://mabear-storybook.ilya-baimetov.workers.dev';
  const output = '/Users/ilya.baimetov/Projects/mabear/codex/docs/parallel-interactions/deployment';
  const expectedAssets = {
    '/assets/studio-CXr0x0iL.js': '6a80fcff0266a0de2504b66294be5c2241cd6b883505044973d41ce6fb88f14a',
    '/assets/stageReplay-CanVHGks.js': '87cfcd2c71dd909aeccc6de9a2c7d90dd2f2f4bdf58562a7fcb58852b849b8f3',
  };
  const proof = {
    checkedAt: new Date().toISOString(), url: origin,
    expectedReleaseSourceCommit: 'f1a184807857279e285e1b640c74a46f3c5fc8aa',
    expectedDeploymentVersion: '258bc27c-fdfd-4feb-92e2-a7514af8094c',
    expectedSourceFingerprint: '3d10dddc3e0be55fb5ea1c5262e70e6bb962606867671021f34bdfac35cd3a08',
    isolation: 'New browser context; only game-origin cookies copied in memory; no user localStorage imported or modified',
    entryVia: 'Live deployed application, full story editor, deterministic offline director; all API calls blocked',
    paidApiCalls: 0,
  };
  const check = (condition, message) => { if (!condition) throw Error(message); };
  const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const browser = originalPage.context().browser();
  check(browser, 'Browser context cannot create an isolated verification context');
  check(new URL(originalPage.url()).origin === origin, 'Current tab must be the authenticated game');
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
  try {
    await context.addCookies(await originalPage.context().cookies(origin));
    const page = await context.newPage(), errors = [], requests = [], blockedApis = [], failedAssets = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('request', r => requests.push(r.url()));
    page.on('response', r => { if (r.status() >= 400 && !r.url().includes('/api/')) failedAssets.push({ url: r.url(), status: r.status() }); });
    await page.addInitScript(() => { localStorage.setItem('mabear.lang', 'en'); globalThis.__name = x => x; });
    await context.route('**/api/**', r => { blockedApis.push(r.request().url()); return r.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"Live release verification; external services disabled"}' }); });
    const response = await page.goto(origin);
    check(response?.status() === 200 && !page.url().includes('/login'), 'Live isolated context did not pass the existing authentication gate');
    await page.waitForFunction(() => !!window.__mabear?.objects, null, { timeout: 180000 });
    await page.locator('.stage-loading').waitFor({ state: 'detached', timeout: 180000 });
    await page.getByTestId('mute').click();
    const snapshot = () => page.evaluate(() => ({ t: window.__mabear.t(), playing: window.__mabear.playing(), objects: window.__mabear.objects(), physics: window.__mabear.physics() }));
    async function pause() { if (await page.getByTestId('pause').isVisible()) await page.getByTestId('pause').click(); }
    async function load(texts) {
      await pause(); await page.getByTestId('full-story').click();
      await page.getByTestId('full-story-text').fill(texts.join('\n\n'));
      await page.getByTestId('apply-full-story').click(); await page.getByTestId('play-all').click();
      await page.waitForFunction(n => window.__mabear.segments() === n, texts.length, { timeout: 90000 });
      await pause(); return page.evaluate(() => window.__mabear.timeline());
    }
    async function seek(t) {
      await pause(); const duration = await page.evaluate(() => window.__mabear.timeline().duration);
      const slider = page.getByRole('slider', { name: 'Story progress', exact: true }), box = await slider.boundingBox();
      await slider.click({ position: { x: Math.max(.1, Math.min(box.width - .1, box.width * t / duration)), y: box.height / 2 } });
      await page.waitForTimeout(150); return snapshot();
    }
    const clips = timeline => timeline.segments.flatMap(({ offset, segment }) => segment.actorClips.masha.map(c => ({ ...c, time: offset + c.start })));
    const ballTimeline = await load(['Masha takes the ball and walks to the bench.', 'Masha drops the ball. Masha waits. Masha walks to the clearing. Masha waits. Masha picks up the ball. Masha waves.']);
    const ballClips = clips(ballTimeline), drop = ballClips.find(c => c.verb === 'drop' && c.params.item === 'ball');
    const take = ballClips.find(c => c.verb === 'take' && c.params.item === 'ball' && c.time > drop?.time);
    check(drop && take, 'Live parser did not compile the ball continuity story');
    const release = drop.time + drop.dur * .5;
    await seek(release + .1); await page.getByTestId('play').click();
    await page.waitForFunction(t => window.__mabear.t() > t + .15, release + .1); await pause();
    const paused = await snapshot(); await page.waitForTimeout(300); const held = await snapshot();
    check(paused.t === held.t && equal(paused.objects, held.objects), 'Live paused story changed');
    await page.getByTestId('play').click(); await page.waitForFunction(t => window.__mabear.t() > t + .15, paused.t); await pause();
    const resumed = await snapshot(); check(resumed.t > paused.t, 'Live resume restarted the story');
    const loose = await seek(Math.min(take.time - .15, release + 4));
    check(loose.physics?.continuity && loose.physics.reason === null && loose.physics.ball && loose.physics.sleeping, 'Live ball did not physically settle');
    check(loose.physics.routes.some(r => r.path.length > 2), 'Live story has no obstacle detour');
    check(Math.hypot(...loose.physics.pickups[0].position.map((x, i) => x - loose.physics.ball.pos[i])) < .001, 'Live pickup missed the actual landing position');
    const picked = await seek(take.time + take.dur * .9); check(picked.objects.ball.attachedTo === 'masha', 'Live ball acquisition failed');
    const backward = await seek(release - .15), again = await seek(take.time + take.dur * .9);
    check(backward.physics.ball === null && equal(again.objects, picked.objects), 'Live backward/forward ball seeking changed results');
    proof.ball = { duration: ballTimeline.duration, release, paused, held, resumed, loose, picked, backward, again };
    const carrotTimeline = await load(['Masha picks carrot number 2 from the garden.', 'Masha walks to the bench and puts carrot number 2 on the bench.', 'Masha walks to the clearing.', 'Masha picks carrot number 2 from the bench. Masha waves.']);
    const carrotClips = clips(carrotTimeline), takes = carrotClips.filter(c => c.verb === 'take' && c.params.item === 'carrot_2'), put = carrotClips.find(c => c.verb === 'put_down' && c.params.item === 'carrot_2');
    check(takes.length === 2 && put, 'Live parser lost carrot identity or placement');
    const start = await seek(.01), first = await seek(takes[0].time + takes[0].dur * .9);
    const unaffected = s => Object.entries(s.objects.carrots).filter(([id]) => id !== 'carrot_2');
    check(Object.keys(start.objects.carrots).length === 9 && first.objects.carrots.carrot_2.attachedTo === 'masha', 'Live selected carrot acquisition failed');
    check(equal(unaffected(start), unaffected(first)), 'Live harvesting changed an untouched carrot');
    const placed = await seek(put.time + put.dur + .15), retrieved = await seek(takes[1].time + takes[1].dur * .9);
    check(placed.objects.carrots.carrot_2.attachedTo === null && retrieved.objects.carrots.carrot_2.attachedTo === 'masha', 'Live carrot placement/retrieval failed');
    const carrotBack = await seek(takes[0].time - .1), carrotAgain = await seek(takes[1].time + takes[1].dur * .9);
    check(carrotBack.objects.carrots.carrot_2.attachedTo === null && equal(carrotAgain.objects, retrieved.objects), 'Live carrot seeking changed results');
    check(equal(unaffected(start), unaffected(retrieved)), 'Live retrieval changed another carrot');
    proof.carrots = { duration: carrotTimeline.duration, start, first, placed, retrieved, backward: carrotBack, again: carrotAgain };
    proof.loadedJavaScript = [...new Set(requests.filter(u => new URL(u).pathname.endsWith('.js')).map(u => new URL(u).pathname))].sort();
    for (const path of Object.keys(expectedAssets)) check(proof.loadedJavaScript.includes(path), `Live release did not load expected bundle ${path}`);
    proof.bundleHashes = await page.evaluate(async paths => {
      const result = {};
      for (const path of paths) {
        const r = await fetch(path); if (!r.ok) throw Error(`Bundle verification HTTP ${r.status}`);
        const digest = await crypto.subtle.digest('SHA-256', await r.arrayBuffer());
        result[path] = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
      }
      return result;
    }, Object.keys(expectedAssets));
    check(equal(proof.bundleHashes, expectedAssets), 'Live bundle bytes differ from the reviewed production build');
    proof.renderer = await page.evaluate(() => { const gl = document.querySelector('canvas')?.getContext('webgl2'), ext = gl?.getExtension('WEBGL_debug_renderer_info'); return gl ? String(gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER)) : null; });
    proof.errors = errors; proof.failedAssets = failedAssets; proof.blockedApis = blockedApis;
    check(errors.length === 0 && failedAssets.length === 0, 'Live application had page or asset errors');
    check(typeof proof.renderer === 'string' && !/swiftshader|software|llvmpipe/i.test(proof.renderer), 'Live verification requires native rendering');
    await page.screenshot({ path: output + '/live-browser.png', fullPage: true });
    proof.result = 'passed';
  } catch (error) {
    proof.result = 'failed'; proof.failure = String(error);
  } finally {
    await context.close();
  }
  return proof;
}
