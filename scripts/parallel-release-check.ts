import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from '@playwright/test';
import {BALL_TEXTS,CARROT_TEXTS} from './parallel-interactions-fixtures';
import {CUPBOARD_TEXTS} from './cupboard-fixtures';
import {sourceFingerprint} from './parallel-interactions-utils';

// Production-bundle check: all story input and transport actions use the UI.
// Browser execution never imports development /src or /scripts modules.
const output='docs/parallel-interactions/deployment';
const url=process.env.RELEASE_CHECK_URL??'http://127.0.0.1:8806/';
const expected='3d10dddc3e0be55fb5ea1c5262e70e6bb962606867671021f34bdfac35cd3a08';
const source=await sourceFingerprint();assert.equal(source,expected);
await mkdir(output,{recursive:true});
const proof:Record<string,unknown>={checkedAt:new Date().toISOString(),source,url,entryVia:'Full story editor; offline director with all API calls blocked',paidApiCalls:0};
const browser=await chromium.launch({channel:'chrome',headless:false,args:['--disable-background-timer-throttling','--disable-renderer-backgrounding','--disable-backgrounding-occluded-windows']});
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000},deviceScaleFactor:1});
 const errors:string[]=[],requests:string[]=[],blockedApis:string[]=[],failedAssets:{url:string;status:number}[]=[];
 page.on('pageerror',e=>errors.push(e.message));
 page.on('request',r=>requests.push(r.url()));
 page.on('response',r=>{if(r.status()>=400&&!r.url().includes('/api/'))failedAssets.push({url:r.url(),status:r.status()});});
 await page.addInitScript(()=>{localStorage.setItem('mabear.lang','en');(globalThis as any).__name=(x:unknown)=>x;});
 await page.route('**/api/**',r=>{blockedApis.push(r.request().url());return r.fulfill({status:503,contentType:'application/json',body:'{"error":"Release verification; external services disabled"}'});});
 await page.goto(url);
 await page.waitForFunction(()=>!!window.__mabear?.objects,null,{timeout:180000});
 await page.locator('.stage-loading').waitFor({state:'detached',timeout:180000});
 await page.getByTestId('mute').click();
 const snapshot=()=>page.evaluate(()=>({t:window.__mabear!.t(),playing:window.__mabear!.playing(),objects:window.__mabear!.objects(),physics:window.__mabear!.physics()})) as Promise<any>;
 async function pause(){if(await page.getByTestId('pause').isVisible())await page.getByTestId('pause').click();}
 async function load(texts:string[]){
  await pause();await page.getByTestId('full-story').click();
  await page.getByTestId('full-story-text').fill(texts.join('\n\n'));
  await page.getByTestId('apply-full-story').click();await page.getByTestId('play-all').click();
  await page.waitForFunction(n=>window.__mabear!.segments()===n,texts.length,{timeout:90000});
  await pause();return page.evaluate(()=>window.__mabear!.timeline()) as Promise<any>;
 }
 async function seek(t:number){
  await pause();
  const duration=await page.evaluate(()=>(window.__mabear!.timeline() as any).duration);
  const slider=page.getByRole('slider',{name:'Story progress',exact:true}),box=(await slider.boundingBox())!;
  await slider.click({position:{x:Math.max(.1,Math.min(box.width-.1,box.width*t/duration)),y:box.height/2}});
  await page.waitForTimeout(120);return snapshot();
 }
 const clips=(tl:any,actor='masha')=>tl.segments.flatMap(({offset,segment}:any)=>segment.actorClips[actor].map((c:any)=>({...c,time:offset+c.start})));
 const distance=(a:number[],b:number[])=>Math.hypot(...a.map((x,i)=>x-b[i]));
 const ballTimeline=await load(BALL_TEXTS),ballClips=clips(ballTimeline);
 const drop=ballClips.find((c:any)=>c.verb==='drop'&&c.params.item==='ball');
 const take=ballClips.find((c:any)=>c.verb==='take'&&c.params.item==='ball'&&c.time>drop?.time);
 assert.ok(drop&&take,'Production parser must compile a drop followed by pickup');
 const release=drop.time+drop.dur*.5;
 await seek(release+.1);await page.getByTestId('play').click();
 await page.waitForFunction(at=>window.__mabear!.t()>at+.15,release+.1);await pause();
 const paused=await snapshot();await page.waitForTimeout(300);const held=await snapshot();
 assert.equal(held.t,paused.t);assert.deepEqual(held.objects,paused.objects);
 await page.getByTestId('play').click();await page.waitForFunction(at=>window.__mabear!.t()>at+.15,paused.t);await pause();
 const resumed=await snapshot();assert.ok(resumed.t>paused.t);
 const loose=await seek(Math.min(take.time-.15,release+4));
 assert.equal(loose.physics.reason,null);assert.equal(loose.physics.continuity,true);
 assert.ok(loose.physics.ball&&loose.physics.sleeping,'Released ball must settle physically');
 assert.ok(loose.physics.routes.some((r:any)=>r.path.length>2),'Actual story must detour around furniture');
 assert.ok(loose.physics.pickups.length>0);
 assert.ok(distance(loose.physics.pickups[0].position,loose.physics.ball.pos)<.001,'Retrieval must target the actual landed ball');
 const picked=await seek(take.time+take.dur*.9);
 assert.equal(picked.objects.ball.attachedTo,'masha');
 const backward=await seek(release-.15),again=await seek(take.time+take.dur*.9);
 assert.equal(backward.physics.ball,null);assert.deepEqual(again.objects,picked.objects);
 proof.ball={duration:ballTimeline.duration,release,paused,held,resumed,loose,picked,backward,again};

 const carrotTimeline=await load(CARROT_TEXTS),carrotClips=clips(carrotTimeline);
 const takes=carrotClips.filter((c:any)=>c.verb==='take'&&c.params.item==='carrot_2');
 const put=carrotClips.find((c:any)=>c.verb==='put_down'&&c.params.item==='carrot_2');
 assert.equal(takes.length,2);assert.ok(put);
 const start=await seek(.01),first=await seek(takes[0].time+takes[0].dur*.9);
 assert.equal(Object.keys(start.objects.carrots).length,9);assert.equal(first.objects.carrots.carrot_2.attachedTo,'masha');
 const unaffected=(s:any)=>Object.entries(s.objects.carrots).filter(([id])=>id!=='carrot_2');
 assert.deepEqual(unaffected(first),unaffected(start));
 const placed=await seek(put.time+put.dur+.15);assert.equal(placed.objects.carrots.carrot_2.attachedTo,null);
 const retrieved=await seek(takes[1].time+takes[1].dur*.9);assert.equal(retrieved.objects.carrots.carrot_2.attachedTo,'masha');
 const carrotBack=await seek(takes[0].time-.1),carrotAgain=await seek(takes[1].time+takes[1].dur*.9);
 assert.equal(carrotBack.objects.carrots.carrot_2.attachedTo,null);assert.deepEqual(carrotAgain.objects,retrieved.objects);assert.deepEqual(unaffected(retrieved),unaffected(start));
 await page.screenshot({path:output+'/packaged-app.png',fullPage:true});
 proof.carrots={duration:carrotTimeline.duration,start,first,placed,retrieved,backward:carrotBack,again:carrotAgain};

 const cupboardTimeline=await load(CUPBOARD_TEXTS),entry=cupboardTimeline.segments[1];
 const cupboardTake=entry.segment.actorClips.bear.find((c:any)=>c.verb==='take');assert.ok(cupboardTake);
 const jar=await seek(entry.offset+cupboardTake.start+cupboardTake.dur*.95);
 assert.equal(jar.objects.cupboard,1);assert.equal(jar.objects.pantryJar.attachedTo,'bear');
 const closed=await seek(entry.offset+entry.segment.duration-.1);
 assert.equal(closed.objects.cupboard,0);assert.equal(closed.objects.pantryJar.attachedTo,'bear');
 const reset=await seek(.01);assert.equal(reset.objects.cupboard,0);assert.equal(reset.objects.pantryJar.attachedTo,null);
 proof.cupboard={duration:cupboardTimeline.duration,jar,closed,reset};
 proof.loadedJavaScript=[...new Set(requests.filter(u=>new URL(u).pathname.endsWith('.js')).map(u=>new URL(u).pathname))].sort();
 assert.ok((proof.loadedJavaScript as string[]).some(u=>u.includes('/assets/stageReplay-')),'Default physics must be loaded from the production bundle');
 assert.ok(!(proof.loadedJavaScript as string[]).some(u=>u.startsWith('/src/')||u.startsWith('/scripts/')));
 proof.renderer=await page.evaluate(()=>{const c=document.querySelector('canvas'),gl=c?.getContext('webgl2'),ext=gl?.getExtension('WEBGL_debug_renderer_info');return gl?String(gl.getParameter(ext?ext.UNMASKED_RENDERER_WEBGL:gl.RENDERER)):null;});
 proof.blockedApis=blockedApis;proof.errors=errors;proof.failedAssets=failedAssets;
 proof.stable=source===await sourceFingerprint();
 assert.equal(proof.stable,true);assert.deepEqual(errors,[]);assert.deepEqual(failedAssets,[]);
 assert.ok(typeof proof.renderer==='string'&&!/swiftshader|software|llvmpipe/i.test(proof.renderer));
 proof.result='passed';await writeFile(output+'/packaged-app.json',JSON.stringify(proof,null,2)+'\n');
 console.log('Production bundle passed: typed ball continuity, pause/resume and reverse seek; carrot identity/place/retrieval; cupboard regression; default physics; no asset/page errors.');
}catch(error){proof.result='failed';proof.failure=String(error);await writeFile(output+'/packaged-app.json',JSON.stringify(proof,null,2)+'\n');throw error;}
finally{await browser.close();}
