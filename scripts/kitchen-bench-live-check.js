// Authenticated production verification. Derived from the actual editor check.
// Copy only game-origin cookies in memory into an isolated context; never save credentials.
// All API generation is blocked. Expected bundle hashes come from the release build.
async (originalPage) => {
 const origin='https://mabear-storybook.ilya-baimetov.workers.dev';
 const output='/Users/ilya.baimetov/Projects/mabear/codex/docs/kitchen-bench/deployment';
 const expectedAssets={
  "/assets/BufferGeometryUtils-DGi_wMKb.js": "d744f13f1f123fede49a5f81d6c6a47e306342304369dd8469c1cba82a1cae2d",
  "/assets/audio-CIcx__7y.js": "49c9885b6c74fb6114de24e325db5b7d961486946943b25c1abcccbc94377dd0",
  "/assets/bearsYard-B-CJzI0O.js": "7706473951082ca0d9a274d732b602cdf2c59332d82ee0a8c16c74b626a2ce76",
  "/assets/bus-C0YitvGm.js": "6b1b375c8e004d2bfc17b5e72c26218f89829f5f8bc29214997b0caee1ee0839",
  "/assets/characters-BpTjwKz1.js": "7f9f40a4e99789880bcffeed8a9f2caf2ca9f4877bb0bccd7fa66a88bb839c87",
  "/assets/common-BKs9B5By.js": "19c507eb2aa23fa823ee274b8ee674893a123db9a5f44b64c1545eee66db4bd2",
  "/assets/emotion-C3AkYVcu.js": "905e41723ed8797209c3f64a23716daa81aa6920187a6231ac04bd234056b308",
  "/assets/evaluate-rJSy-D10.js": "b3fe330287b7cc33e91a84c27ed78c911d1b8c9accb8176b370d54c8a86a6e27",
  "/assets/face-TzEvKFqj.js": "cf6154796ee7815c7d7a53e70e4217f19f675531a7823b68d62fa6ca99e02874",
  "/assets/generated-BvJnbCYW.js": "d8d4d2527216f1477ff335cf21043da962e681bf4ac053fe79595aa150f91c45",
  "/assets/kitchenContainers-uc_nahWc.js": "a992b516271b26da4af371342f085a754b173a1a2ce0ed96c95d0022dd3694e4",
  "/assets/meshopt_decoder.module-DXTYc6wn.js": "6bf68170d437477fb3411dfb24339df33257d69a4322c3907e14af33cff083c7",
  "/assets/pick-CDJR9fZN.js": "6116d98e611669fd073b5c0a954b3104ef910076f9663d1b8f1f321ce3dfb63d",
  "/assets/player-DjskxNVn.js": "bb4271c0efcb659c8bf7fadd7fbe1ad72554bf78138dd59cbcc830c84bb768e4",
  "/assets/preload-helper-C3kyDq16.js": "c254f8c75265b04b5bfaa479cfcd720cf9b77ae61b00f9b7db525b9c71524da1",
  "/assets/replayWorker-BZcvSGew.js": "19ebb77f7fd1e932f3b6b6f041bafb6d9bc95422cc8df63066f9daeb25d97fdb",
  "/assets/rolldown-runtime-4tVxZq34.js": "e1a1c25cf197ccd96571062973f07d34fb794a4745cd7284f8f64c63be00c578",
  "/assets/set-DocIiFye.js": "5e58d7bdbb1370ba550e8697b14c8c3ef2b6ea025e54e44f7ea3d949342c5c8d",
  "/assets/sourceContacts-Dgkr0H5h.js": "8af1be84c375e1f0bfa7a2fe9beb08f66fd0af1bb786c14fa9f5aaba9f209fc8",
  "/assets/stage-pSTY-gaj.js": "f10c60fed22d8dd019725565505efa4787e5aa3bc821c5c69f8423deee2c3898",
  "/assets/stageReplay-DG7B520d.js": "a742a49cad888f48a8fb6ab1df07a2e235c4464410ba6cea499077093dce85ac",
  "/assets/studio-BPo7yYgf.js": "7d360881d824b6f6338053163ff13c9e4508e7d804a65974f512290e76de73b4",
  "/assets/three.core-Dw9ZaBbX.js": "829bafe2f5646818683fd6e94cddc430047a7804a98076bf80af731b8cf68950",
  "/assets/wolf-CmIDi5EC.js": "78b69b74bdaef4e62a2c26e5ec5e0f8c5bfe417d4fcabbc08a65b0b5c6fb53e1"
};
 const KITCHEN_TEXTS=['Masha picks carrot number 2 from the garden.','Masha carries carrot number 2 into the kitchen.','Masha puts carrot number 2 in the bowl.','Bear takes carrot number 2 from the bowl and puts it into the pot.'];
 const BENCH_TEXTS=['Masha takes the ball and puts it on the bench.','Masha nudges the ball off the bench and waits.','Masha walks to the clearing, waits, and picks up the ball.'];
 const proof={checkedAt:new Date().toISOString(),url:origin,expectedSourceFingerprint:"6b059a3ed328acb504fc5d48d2729ddcbaa7ae2846857d2907ddf27599bf2fea",entryVia:'Authenticated live full-story editor; API calls blocked',paidApiCalls:0,isolation:'Separate context; game-origin cookies copied only in memory; user saved stories untouched'},errors=[],requests=[],blocked=[],failedAssets=[];
 if(new URL(originalPage.url()).origin!==origin)throw Error('Select the authenticated game tab first');
 const browser=originalPage.context().browser();
 const context=await browser.newContext({viewport:{width:1440,height:1000},deviceScaleFactor:1});
 try{
  await context.addCookies(await originalPage.context().cookies(origin));
  const page=await context.newPage();
  page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>requests.push(r.url()));page.on('response',r=>{if(r.status()>=400&&!r.url().includes('/api/'))failedAssets.push({url:r.url(),status:r.status()});});
  await page.addInitScript(()=>{localStorage.setItem('mabear.lang','en');globalThis.__name=x=>x;});
  await context.route('**/api/**',r=>{blocked.push(r.request().url());return r.fulfill({status:503,contentType:'application/json',body:'{"error":"Release verification; paid services disabled"}'});});
  const response=await page.goto(origin);
  if(response.status()!==200||page.url().includes('/login'))throw Error('Authenticated app gate failed');
  await page.waitForFunction(()=>!!window.__mabear?.objects,null,{timeout:180000});await page.locator('.stage-loading').waitFor({state:'detached',timeout:180000});await page.getByTestId('mute').click();
const ready = () => page.waitForFunction(() => !window.__mabear.preparing(), null, { timeout: 6e4 });
const snapshot = () => page.evaluate(() => ({ t: window.__mabear.t(), playing: window.__mabear.playing(), objects: window.__mabear.objects(), physics: window.__mabear.physics() }));
const pause = async () => {
  if (await page.getByTestId("pause").isVisible()) await page.getByTestId("pause").click();
};
async function load(id) {
  await pause();
  await page.getByTestId("full-story").click();
  await page.getByTestId("full-story-text").fill((id === "kitchen" ? KITCHEN_TEXTS : BENCH_TEXTS).join("\n\n"));
  await page.getByTestId("apply-full-story").click();
  await page.getByTestId("play-all").click();
  await page.waitForFunction((n) => window.__mabear.segments() === n, id === "kitchen" ? 4 : 3, { timeout: 9e4 });
  await ready();
  await pause();
  await page.getByTestId("scope-story").click();
  return page.evaluate(() => window.__mabear.timeline());
}
async function seek(t) {
  await pause();
  await ready();
  const d = await page.evaluate(() => window.__mabear.timeline().duration), slider = page.getByRole("slider", { name: "Story progress", exact: true }), box = await slider.boundingBox();
  await slider.click({ position: { x: Math.max(0.1, Math.min(box.width - 0.1, box.width * t / d)), y: box.height / 2 } });
  await page.waitForTimeout(120);
  return snapshot();
}
const clips = (tl2, actor = "masha") => tl2.segments.flatMap(({ offset, segment }) => segment.actorClips[actor].map((c) => ({ ...c, time: offset + c.start })));
const equal = (a, b) => JSON.stringify(a.objects) === JSON.stringify(b.objects);
async function transport(t) {
  await seek(t);
  await page.getByTestId("play").click();
  await page.waitForFunction((t2) => window.__mabear.t() > t2 + 0.15, t);
  await pause();
  const paused = await snapshot();
  await page.waitForTimeout(300);
  const held = await snapshot();
  if (!equal(paused, held) || paused.t !== held.t) throw Error("Pause changed visible object state");
  await page.getByTestId("play").click();
  await page.waitForFunction((t2) => window.__mabear.t() > t2 + 0.15, paused.t);
  await pause();
  return { paused, held, resumed: await snapshot() };
}
async function edit(index, text) {
  await pause();
  await page.getByTestId("moment-card").nth(index).click();
  await page.getByTestId("moment-text").fill(text);
  const n = await page.evaluate(() => window.__mabear.compiles());
  await page.getByTestId("preview-moment").click();
  await page.waitForFunction((n2) => window.__mabear.compiles() > n2, n, { timeout: 45e3 });
  await ready();
  await pause();
  await page.getByTestId("scope-story").click();
}
let tl = await load("bench");
const bc = clips(tl), put = bc.find((c) => c.verb === "put_down"), nudge = bc.find((c) => c.verb === "nudge"), take = bc.filter((c) => c.verb === "take").at(-1);
if (!put || !nudge || !take) throw Error("Main editor did not compile bench actions");
const seat = await seek(put.time + put.dur + 0.1);
if (seat.physics.reason || !seat.physics.ball) throw Error("Bench story failed to retain physics");
const rolling = await transport(nudge.time + nudge.dur * 0.55), picked = await seek(take.time + take.dur * 0.9);
if (picked.objects.ball.attachedTo !== "masha") throw Error("Final ball not held");
const before = await seek(nudge.time - 0.1), again = await seek(take.time + take.dur * 0.9);
if (!equal(picked, again)) throw Error("Backward/forward seek changed bench pickup");
await page.screenshot({ path: `${output}/bench-editor.png`, fullPage: true });
await page.getByTestId("replay").click();
await page.waitForFunction(() => window.__mabear.t() < 1);
await pause();
const replay = await snapshot();
if (replay.physics.ball) throw Error("Replay retained future loose ball");
await edit(2, "Masha walks to the clearing and waves.");
const edited = await seek(await page.evaluate(() => window.__mabear.timeline().duration) - 0.1);
if (edited.objects.ball.attachedTo || !edited.physics.ball) throw Error("Deleting retrieval did not leave physical ball on ground");
proof.bench = { seat, rolling, picked, before, again, replay, edited };
tl = await load("kitchen");
const mc = clips(tl), bear = clips(tl, "bear"), deposit = mc.find((c) => c.verb === "put_down"), retrieve = bear.find((c) => c.verb === "take"), pot = bear.find((c) => c.verb === "put_down");
if (!deposit || !retrieve || !pot) throw Error("Kitchen story missing transfers");
const initial = await seek(0.01), bowl = await seek(deposit.time + deposit.dur + 0.1), retrieved = await seek(retrieve.time + retrieve.dur * 0.9), cooked = await seek(pot.time + pot.dur * 0.9);
if (bowl.objects.carrots.carrot_2.attachedTo || retrieved.objects.carrots.carrot_2.attachedTo !== "bear" || cooked.objects.carrots.carrot_2.attachedTo) throw Error("Kitchen ownership chain broken");
const untouched = (s) => Object.fromEntries(Object.entries(s.objects.carrots).filter(([id]) => id !== "carrot_2"));
if (JSON.stringify(untouched(initial)) !== JSON.stringify(untouched(cooked))) throw Error("Moving carrot2 changed another carrot");
const kitchenTransport = await transport(retrieve.time + 0.1);
await seek(deposit.time - 0.1);
const cookedAgain = await seek(pot.time + pot.dur * 0.9);
if (!equal(cooked, cookedAgain)) throw Error("Kitchen seek changed final exact pose");
await page.screenshot({ path: `${output}/kitchen-editor.png`, fullPage: true });
await page.getByTestId("moment-card").nth(3).click();
await page.getByTestId("request-remove-moment").click();
await page.getByTestId("remove-moment").click();
await page.waitForFunction(() => window.__mabear.segments() === 3);
await ready();
await page.getByTestId("scope-story").click();
const deleted = await seek(await page.evaluate(() => window.__mabear.timeline().duration) - 0.1);
if (JSON.stringify(deleted.objects.carrots.carrot_2.worldPosition) !== JSON.stringify(bowl.objects.carrots.carrot_2.worldPosition)) throw Error("Removing Bear scene did not restore bowl position");
await page.reload();
await page.waitForFunction(() => !!window.__mabear?.objects, null, { timeout: 18e4 });
await page.locator(".stage-loading").waitFor({ state: "detached", timeout: 18e4 });
await ready();
await page.getByTestId("scope-story").click();
const reloaded = await seek(await page.evaluate(() => window.__mabear.timeline().duration) - 0.1);
if (JSON.stringify(reloaded.objects.carrots.carrot_2.worldPosition) !== JSON.stringify(deleted.objects.carrots.carrot_2.worldPosition)) throw Error("Reload changed bowl state");
proof.kitchen = { initial, bowl, retrieved, cooked, kitchenTransport, cookedAgain, deleted, reloaded };

  proof.loadedJavaScript=[...new Set(requests.filter(u=>new URL(u).pathname.endsWith('.js')).map(u=>new URL(u).pathname))].sort();
  for(const p of Object.keys(expectedAssets))if(!proof.loadedJavaScript.includes(p))throw Error('Expected release bundle not loaded: '+p);
  proof.bundleHashes=await page.evaluate(async paths=>{const result={};for(const p of paths){const r=await fetch(p,{cache:'no-store'});if(!r.ok)throw Error('Bundle HTTP '+r.status);result[p]=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await r.arrayBuffer())),b=>b.toString(16).padStart(2,'0')).join('');}return result;},Object.keys(expectedAssets));
  if(JSON.stringify(proof.bundleHashes)!==JSON.stringify(expectedAssets))throw Error('Live bundle bytes differ from the release build');
  proof.renderer=await page.evaluate(()=>{const gl=document.querySelector('canvas')?.getContext('webgl2'),ext=gl?.getExtension('WEBGL_debug_renderer_info');return gl?String(gl.getParameter(ext?ext.UNMASKED_RENDERER_WEBGL:gl.RENDERER)):null;});
  if(!proof.renderer||/swiftshader|software|llvmpipe/i.test(proof.renderer))throw Error('Native renderer required');
  if(errors.length||failedAssets.length)throw Error('Live app has page or asset errors');
  proof.result='passed';
 }catch(error){proof.result='failed';proof.failure=String(error);}
 finally{proof.errors=errors;proof.failedAssets=failedAssets;proof.blockedApiRequests=blocked;await context.close();}
 return proof;
}
