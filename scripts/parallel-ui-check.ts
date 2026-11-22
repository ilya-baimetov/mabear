import {chromium} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
import {sourceFingerprint} from './parallel-interactions-utils';

// Exercise the regular editor and its real transport. Paid endpoints are blocked.
const output='docs/parallel-interactions/ui';
await mkdir(output,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:false,args:['--disable-background-timer-throttling','--disable-renderer-backgrounding','--disable-backgrounding-occluded-windows']});
const source=await sourceFingerprint();
const proof:Record<string,unknown>={source,capturedAt:new Date().toISOString()};
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000},deviceScaleFactor:1});
 const errors:string[]=[],api:string[]=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{localStorage.setItem('mabear.lang','en');(globalThis as any).__name=(x:unknown)=>x;});
 await page.route('**/api/**',r=>{api.push(r.request().url());return r.fulfill({status:503,contentType:'application/json',body:'{"error":"Local verification; external services disabled"}'});});
 await page.goto('http://127.0.0.1:8811/');
 await page.waitForFunction(()=>!!window.__mabear?.objects,null,{timeout:180000});
 await page.locator('.stage-loading').waitFor({state:'detached',timeout:180000});
 await page.getByTestId('mute').click();
 const snapshot=()=>page.evaluate(()=>({t:window.__mabear!.t(),playing:window.__mabear!.playing(),objects:window.__mabear!.objects(),physics:window.__mabear!.physics()})) as Promise<any>;
 const pause=async()=>{if(await page.getByTestId('pause').isVisible())await page.getByTestId('pause').click();};
 async function load(which:'rapier'|'carrots'){
  await pause();
  await page.evaluate(async id=>{
   const storePath='/src/app/store.ts',fixturePath='/scripts/parallel-interactions-fixtures.ts';
   const {store}=await import(storePath),{parallelFixtures}=await import(fixturePath);
   store.loadFixture(parallelFixtures()[id]);
  },which);
  await page.waitForFunction(n=>window.__mabear!.segments()===n,which==='carrots'?4:2);
  if(which==='rapier'&&process.env.PARSED==='1'){
   const before=await page.evaluate(()=>window.__mabear!.compiles());
   await page.getByTestId('moment-card').nth(1).click();
   await page.getByTestId('moment-text').fill('Masha drops the ball. Masha waits. Masha walks to the clearing. Masha waits. Masha picks up the ball. Masha waves.');
   await page.getByTestId('preview-moment').click();
   await page.waitForFunction(n=>window.__mabear!.compiles()>n,before,{timeout:30000});
   await pause();
  }
  await page.getByTestId('scope-story').click();
  return page.evaluate(()=>window.__mabear!.timeline()) as Promise<any>;
 }
 async function seek(t:number){
  await pause();
  const duration=await page.evaluate(()=>(window.__mabear!.timeline() as any).duration);
  const slider=page.getByRole('slider',{name:'Story progress',exact:true}),box=(await slider.boundingBox())!;
  await slider.click({position:{x:Math.max(.1,Math.min(box.width-.1,box.width*t/duration)),y:box.height/2}});
  await page.waitForTimeout(100);return snapshot();
 }
 async function pauseResume(t:number){
  await seek(t);await page.getByTestId('play').click();
  await page.waitForFunction(at=>window.__mabear!.t()>at+.12,t);await pause();
  const paused=await snapshot();await page.waitForTimeout(300);const held=await snapshot();
  if(paused.t!==held.t||JSON.stringify(paused.objects)!==JSON.stringify(held.objects))throw Error('Paused story changed its rendered object state');
  await page.getByTestId('play').click();await page.waitForFunction(at=>window.__mabear!.t()>at+.15,paused.t);await pause();
  const resumed=await snapshot();if(resumed.t<paused.t)throw Error('Resume restarted the story');
  return{paused,held,resumed};
 }
 const clips=(timeline:any)=>timeline.segments.flatMap(({offset,segment}:any)=>segment.actorClips.masha.map((clip:any)=>({...clip,time:offset+clip.start})));
 const equalObjects=(a:any,b:any)=>JSON.stringify(a.objects)===JSON.stringify(b.objects);
 async function edit(index:number,text:string,ready:()=>boolean){
  await pause();await page.getByTestId('moment-card').nth(index).click();
  await page.getByTestId('moment-text').fill(text);await page.getByTestId('preview-moment').click();
  await page.waitForFunction(ready,null,{timeout:30000});await pause();
  await page.getByTestId('scope-story').click();
 }

 if(process.env.FEATURE!=='carrots'){
 const timeline=await load('rapier');
 const ballClips=clips(timeline),drop=ballClips.find((c:any)=>c.verb==='drop'&&c.params.item==='ball');
 const take=ballClips.find((c:any)=>c.verb==='take'&&c.params.item==='ball'&&c.time>drop?.time);
 if(!drop||!take)throw Error('Editor did not compile the drop and later pickup');
 const release=drop.time+drop.dur*.5;
 const pausedBall=await pauseResume(release+.1);
 if(!pausedBall.paused.physics?.ball)throw Error('Default app did not simulate the released ball');
 const loose=await seek(Math.min(take.time-.15,release+4));
 const picked=await seek(take.time+take.dur*.88);
 if(picked.objects.ball.attachedTo!=='masha')throw Error('Retrieved ball is not attached to Masha');
 const backward=await seek(release-.12),again=await seek(take.time+take.dur*.88);
 if(backward.physics.ball)throw Error('Reverse seek kept a ball that had not been released');
 if(!equalObjects(picked,again))throw Error('Repeated ball pickup seek changed rendered state');
 await page.screenshot({path:`${output}/ball-editor.png`,fullPage:true});
 await page.getByTestId('replay').click();await page.waitForFunction(()=>window.__mabear!.t()<1);await pause();
 const replay=await snapshot();if(replay.physics.ball)throw Error('Replay retained a future released ball');
 // A scene-only preview must reconstruct the earlier scene's held ball.
 await page.getByTestId('moment-card').nth(1).click();await page.getByTestId('preview-moment').click();
 await page.waitForFunction(at=>window.__mabear!.t()>at,release+.15,{timeout:30000});await pause();
 const preview=await snapshot();if(!preview.physics.ball)throw Error('Scene preview lost the physical release');
 await edit(1,'Masha waves.',()=>!(window.__mabear!.timeline() as any).segments.some((s:any)=>s.segment.actorClips.masha.some((c:any)=>c.verb==='drop')));
 const editedBall=await seek((await page.evaluate(()=>(window.__mabear!.timeline() as any).duration))-.1);
 if(editedBall.physics.ball||editedBall.objects.ball.attachedTo!=='masha')throw Error('Edited story retained stale loose-ball physics');
 proof.rapier={release,takeTime:take.time,pausedBall,loose,picked,backward,again,replay,preview,edited:editedBall};
 }
 if(process.env.FEATURE!=='rapier'){
 const timeline=await load('carrots');
 const carrotClips=clips(timeline),picks=carrotClips.filter((c:any)=>c.verb==='take'&&c.params.item==='carrot_2');
 const put=carrotClips.find((c:any)=>c.verb==='put_down'&&c.params.item==='carrot_2');
 if(picks.length!==2||!put)throw Error('Editor did not compile distinct carrot #2 pickup, placement and retrieval');
 const start=await seek(.01),first=await seek(picks[0].time+picks[0].dur*.9);
 if(first.objects.carrots.carrot_2.attachedTo!=='masha')throw Error('Wrong carrot was picked');
 const unaffected=(state:any)=>Object.entries(state.objects.carrots).filter(([id])=>id!=='carrot_2');
 if(JSON.stringify(unaffected(start))!==JSON.stringify(unaffected(first)))throw Error('Picking #2 altered another carrot');
 const pausedCarrot=await pauseResume(picks[0].time+.15);
 const placed=await seek(put.time+put.dur+.15);
 if(placed.objects.carrots.carrot_2.attachedTo!==null)throw Error('Placed carrot remained in hand');
 const retrieved=await seek(picks[1].time+picks[1].dur*.9);
 const beforePickup=await seek(picks[0].time-.1),retrievedAgain=await seek(picks[1].time+picks[1].dur*.9);
 if(!equalObjects(retrieved,retrievedAgain))throw Error('Reverse/forward seeking changed carrot identity or pose');
 if(beforePickup.objects.carrots.carrot_2.attachedTo!==null)throw Error('Reverse seek left carrot #2 held');
 await page.screenshot({path:`${output}/carrots-editor.png`,fullPage:true});
 await page.getByTestId('replay').click();await page.waitForFunction(()=>window.__mabear!.t()<1);await pause();
 const carrotReplay=await snapshot();if(carrotReplay.objects.carrots.carrot_2.attachedTo!==null)throw Error('Replay retained future carrot ownership');
 await edit(3,'Masha waves.',()=>!(window.__mabear!.timeline() as any).segments[3]?.segment.actorClips.masha.some((c:any)=>c.verb==='take'));
 const carrotEdit=await seek((await page.evaluate(()=>(window.__mabear!.timeline() as any).duration))-.1);
 if(carrotEdit.objects.carrots.carrot_2.attachedTo!==null)throw Error('Removing retrieval kept carrot in hand');
 await load('carrots');await page.getByTestId('moment-card').nth(3).click();
 await page.getByTestId('request-remove-moment').click();await page.getByTestId('remove-moment').click();
 await page.waitForFunction(()=>window.__mabear!.segments()===3);
 await page.getByTestId('scope-story').click();
 const carrotDelete=await seek((await page.evaluate(()=>(window.__mabear!.timeline() as any).duration))-.1);
 if(carrotDelete.objects.carrots.carrot_2.attachedTo!==null)throw Error('Deleted retrieval retained carrot ownership');
 await page.reload();await page.waitForFunction(()=>!!window.__mabear?.objects,null,{timeout:180000});await page.locator('.stage-loading').waitFor({state:'detached',timeout:180000});
 const reloaded=await snapshot();if(reloaded.objects.carrots.carrot_2.attachedTo!==null)throw Error('Reload retained future carrot ownership');
 proof.carrots={start,first,pausedCarrot,placed,retrieved,beforePickup,retrievedAgain,replay:carrotReplay,edited:carrotEdit,deleted:carrotDelete,reloaded};
 }
 proof.errors=errors;proof.blockedApiRequests=api;
 proof.stable=source===await sourceFingerprint();
 proof.parsedText=process.env.PARSED==='1';
 await writeFile(`${output}/${process.env.FEATURE??'combined'}${process.env.PARSED==='1'?'-parsed':''}-proof.json`,JSON.stringify(proof,null,2));
 if(errors.length||!proof.stable)throw Error(errors.length?errors.join('\n'):'Source changed during UI verification; rerun against the final source.');
 console.log(`Main editor: ${process.env.FEATURE??'both stories'} passed pause/resume, seeking, replay and editing${process.env.FEATURE==='rapier'?'':', plus carrot scene deletion/reload'}.`);
}catch(error){
 proof.failure=String(error);await writeFile(`${output}/failure.json`,JSON.stringify(proof,null,2));throw error;
}finally{await browser.close();}
