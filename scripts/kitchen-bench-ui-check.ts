import {chromium} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
import {sourceFingerprint} from './parallel-interactions-utils';
import {KITCHEN_TEXTS,BENCH_TEXTS} from './kitchen-bench-fixtures';

const production=process.env.PRODUCTION==='1',url=process.env.APP_URL??'http://127.0.0.1:8821/';
const output=production?'docs/kitchen-bench/production':'docs/kitchen-bench/ui';await mkdir(output,{recursive:true});
const source=await sourceFingerprint(),proof:any={source,capturedAt:new Date().toISOString(),url,entryVia:'Actual full story textbox; paid endpoints blocked'},errors:string[]=[],blocked:string[]=[],requests:string[]=[],failedAssets:any[]=[];
const browser=await chromium.launch({channel:'chrome',headless:false,args:['--disable-background-timer-throttling','--disable-renderer-backgrounding','--disable-backgrounding-occluded-windows']});
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000},deviceScaleFactor:1});
 page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>requests.push(r.url()));page.on('response',r=>{if(r.status()>=400&&!r.url().includes('/api/'))failedAssets.push({url:r.url(),status:r.status()});});
 await page.addInitScript(()=>{localStorage.setItem('mabear.lang','en');(globalThis as any).__name=(x:unknown)=>x;});
 await page.route('**/api/**',r=>{blocked.push(r.request().url());return r.fulfill({status:503,contentType:'application/json',body:'{"error":"Local check; paid services disabled"}'});});
 await page.goto(url);
 await page.waitForFunction(()=>!!window.__mabear?.objects,null,{timeout:180000});await page.locator('.stage-loading').waitFor({state:'detached',timeout:180000});
 await page.getByTestId('mute').click();
 const ready=()=>page.waitForFunction(()=>!window.__mabear!.preparing(),null,{timeout:60000});
 const snapshot=()=>page.evaluate(()=>({t:window.__mabear!.t(),playing:window.__mabear!.playing(),objects:window.__mabear!.objects(),physics:window.__mabear!.physics()})) as Promise<any>;
 const pause=async()=>{if(await page.getByTestId('pause').isVisible())await page.getByTestId('pause').click();};
 async function load(id:'kitchen'|'bench'){
  await pause();await page.getByTestId('full-story').click();
  await page.getByTestId('full-story-text').fill((id==='kitchen'?KITCHEN_TEXTS:BENCH_TEXTS).join('\n\n'));
  await page.getByTestId('apply-full-story').click();await page.getByTestId('play-all').click();
  await page.waitForFunction(n=>window.__mabear!.segments()===n,id==='kitchen'?4:3,{timeout:90000});await ready();await pause();await page.getByTestId('scope-story').click();
  return page.evaluate(()=>window.__mabear!.timeline()) as Promise<any>;
 }
 async function seek(t:number){await pause();await ready();const d=await page.evaluate(()=>(window.__mabear!.timeline() as any).duration),slider=page.getByRole('slider',{name:'Story progress',exact:true}),box=(await slider.boundingBox())!;await slider.click({position:{x:Math.max(.1,Math.min(box.width-.1,box.width*t/d)),y:box.height/2}});await page.waitForTimeout(120);return snapshot();}
 const clips=(tl:any,actor='masha')=>tl.segments.flatMap(({offset,segment}:any)=>segment.actorClips[actor].map((c:any)=>({...c,time:offset+c.start})));
 const equal=(a:any,b:any)=>JSON.stringify(a.objects)===JSON.stringify(b.objects);
 async function transport(t:number){await seek(t);await page.getByTestId('play').click();await page.waitForFunction(t=>window.__mabear!.t()>t+.15,t);await pause();const paused=await snapshot();await page.waitForTimeout(300);const held=await snapshot();if(!equal(paused,held)||paused.t!==held.t)throw Error('Pause changed visible object state');await page.getByTestId('play').click();await page.waitForFunction(t=>window.__mabear!.t()>t+.15,paused.t);await pause();return{paused,held,resumed:await snapshot()};}
 async function edit(index:number,text:string){await pause();await page.getByTestId('moment-card').nth(index).click();await page.getByTestId('moment-text').fill(text);const n=await page.evaluate(()=>window.__mabear!.compiles());await page.getByTestId('preview-moment').click();await page.waitForFunction(n=>window.__mabear!.compiles()>n,n,{timeout:45000});await ready();await pause();await page.getByTestId('scope-story').click();}

 let tl=await load('bench');const bc=clips(tl),put=bc.find((c:any)=>c.verb==='put_down'),nudge=bc.find((c:any)=>c.verb==='nudge'),take=bc.filter((c:any)=>c.verb==='take').at(-1);
 if(!put||!nudge||!take)throw Error('Main editor did not compile bench actions');
 const seat=await seek(put.time+put.dur+.1);if(seat.physics.reason||!seat.physics.ball)throw Error('Bench story failed to retain physics');
 const rolling=await transport(nudge.time+nudge.dur*.55),picked=await seek(take.time+take.dur*.9);
 if(picked.objects.ball.attachedTo!=='masha')throw Error('Final ball not held');
 const before=await seek(nudge.time-.1),again=await seek(take.time+take.dur*.9);if(!equal(picked,again))throw Error('Backward/forward seek changed bench pickup');
 await page.screenshot({path:`${output}/bench-editor.png`,fullPage:true});
 await page.getByTestId('replay').click();await page.waitForFunction(()=>window.__mabear!.t()<1);await pause();const replay=await snapshot();if(replay.physics.ball)throw Error('Replay retained future loose ball');
 await edit(2,'Masha walks to the clearing and waves.');
 const edited=await seek((await page.evaluate(()=>(window.__mabear!.timeline() as any).duration))-.1);if(edited.objects.ball.attachedTo||!edited.physics.ball)throw Error('Deleting retrieval did not leave physical ball on ground');
 proof.bench={seat,rolling,picked,before,again,replay,edited};

 tl=await load('kitchen');const mc=clips(tl),bear=clips(tl,'bear'),deposit=mc.find((c:any)=>c.verb==='put_down'),retrieve=bear.find((c:any)=>c.verb==='take'),pot=bear.find((c:any)=>c.verb==='put_down');
 if(!deposit||!retrieve||!pot)throw Error('Kitchen story missing transfers');
 const initial=await seek(.01),bowl=await seek(deposit.time+deposit.dur+.1),retrieved=await seek(retrieve.time+retrieve.dur*.9),cooked=await seek(pot.time+pot.dur*.9);
 if(bowl.objects.carrots.carrot_2.attachedTo||retrieved.objects.carrots.carrot_2.attachedTo!=='bear'||cooked.objects.carrots.carrot_2.attachedTo)throw Error('Kitchen ownership chain broken');
 const untouched=(s:any)=>Object.fromEntries(Object.entries(s.objects.carrots).filter(([id])=>id!=='carrot_2'));
 if(JSON.stringify(untouched(initial))!==JSON.stringify(untouched(cooked)))throw Error('Moving carrot2 changed another carrot');
 const kitchenTransport=await transport(retrieve.time+.1);await seek(deposit.time-.1);const cookedAgain=await seek(pot.time+pot.dur*.9);if(!equal(cooked,cookedAgain))throw Error('Kitchen seek changed final exact pose');
 await page.screenshot({path:`${output}/kitchen-editor.png`,fullPage:true});
 // Scene deletion must remove its ownership and pose changes on recompile.
 await page.getByTestId('moment-card').nth(3).click();await page.getByTestId('request-remove-moment').click();await page.getByTestId('remove-moment').click();await page.waitForFunction(()=>window.__mabear!.segments()===3);await ready();await page.getByTestId('scope-story').click();
 const deleted=await seek((await page.evaluate(()=>(window.__mabear!.timeline() as any).duration))-.1);if(JSON.stringify(deleted.objects.carrots.carrot_2.worldPosition)!==JSON.stringify(bowl.objects.carrots.carrot_2.worldPosition))throw Error('Removing Bear scene did not restore bowl position');
 await page.reload();await page.waitForFunction(()=>!!window.__mabear?.objects,null,{timeout:180000});await page.locator('.stage-loading').waitFor({state:'detached',timeout:180000});await ready();await page.getByTestId('scope-story').click();const reloaded=await seek((await page.evaluate(()=>(window.__mabear!.timeline() as any).duration))-.1);if(JSON.stringify(reloaded.objects.carrots.carrot_2.worldPosition)!==JSON.stringify(deleted.objects.carrots.carrot_2.worldPosition))throw Error('Reload changed bowl state');
 proof.kitchen={initial,bowl,retrieved,cooked,kitchenTransport,cookedAgain,deleted,reloaded};
 proof.stable=source===await sourceFingerprint();proof.errors=errors;proof.blockedApiRequests=blocked;proof.failedAssets=failedAssets;proof.loadedJavaScript=[...new Set(requests.filter(u=>new URL(u).pathname.endsWith('.js')).map(u=>new URL(u).pathname))].sort();
 if(production&&(!proof.loadedJavaScript.some((u:string)=>u.includes('/assets/replayWorker-'))||requests.some(u=>/\/(src|scripts)\//.test(new URL(u).pathname))))throw Error('Production worker bundle was not loaded independently');
 if(failedAssets.length)throw Error('Failed asset requests');
 await writeFile(`${output}/proof.json`,JSON.stringify(proof,null,2));if(errors.length||!proof.stable)throw Error('Source change or browser errors; rerun final check');console.log('PASS: actual editor bench and kitchen transport, edits, identity, deletion and reload.');
}catch(error){proof.failure=String(error);proof.errors=errors;await writeFile(`${output}/failure.json`,JSON.stringify(proof,null,2));throw error;}finally{await browser.close();}
