import {chromium} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
const output='docs/cupboard/ui';await mkdir(output,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:false});
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors:string[]=[],intercepted:string[]=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{localStorage.setItem('mabear.lang','en');(globalThis as any).__name=(x:unknown)=>x;});
 await page.route('**/api/**',r=>{intercepted.push(r.request().url());return r.fulfill({status:503,contentType:'application/json',body:'{"error":"Offline local verification"}'});});
 await page.goto('http://127.0.0.1:8801/');await page.waitForFunction(()=>!!window.__mabear?.objects,null,{timeout:180000});await page.locator('.stage-loading').waitFor({state:'detached'});await page.getByTestId('mute').click();
 async function load(){await page.evaluate(async()=>{
  const storePath='/src/app/store.ts',parserPath='/src/director/offline/parser.ts',worldPath='/src/compiler/worldState.ts',fixturePath='/scripts/cupboard-fixtures.ts';
  const {store}=await import(storePath),{parseParagraph}=await import(parserPath),{initialWorldState}=await import(worldPath),{CUPBOARD_TEXTS}=await import(fixturePath);
  store.loadFixture({id:'garden_party',lang:'en',title:'A jar from the cupboard',paragraphs:CUPBOARD_TEXTS.map((text:string)=>({text,beatScript:parseParagraph(text,'en',initialWorldState())}))});
 });await page.waitForFunction(()=>window.__mabear!.segments()===3);await page.getByTestId('scope-story').click();}
 const state=()=>page.evaluate(()=>({t:window.__mabear!.t(),playing:window.__mabear!.playing(),objects:window.__mabear!.objects(),physics:window.__mabear!.physics()}));
 const pause=async()=>{if(await page.getByTestId('pause').isVisible())await page.getByTestId('pause').click();};
 await load();const timeline:any=await page.evaluate(()=>window.__mabear!.timeline()),scene=timeline.segments[1];
 const opening=scene.segment.objectCues.find((c:any)=>c.object==='kitchen_cupboard'&&c.to===1),take=scene.segment.actorClips.bear.find((c:any)=>c.verb==='take'),closing=scene.segment.objectCues.find((c:any)=>c.object==='kitchen_cupboard'&&c.to===0);
 if(!opening||!take||!closing)throw Error('Actual editor did not compile cupboard sequence');
 async function seek(t:number){const slider=page.getByRole('slider',{name:'Story progress',exact:true}),box=(await slider.boundingBox())!;await slider.click({position:{x:box.width*t/timeline.duration,y:box.height/2}});await page.waitForTimeout(150);return state();}
 await seek(scene.offset+opening.start+.1);await page.getByTestId('play').click();await page.waitForFunction(t=>window.__mabear!.t()>t,scene.offset+opening.start+.45);await pause();
 const paused:any=await state();await page.waitForTimeout(350);const held:any=await state();
 if(paused.t!==held.t||JSON.stringify(paused.objects)!==JSON.stringify(held.objects))throw Error('Paused cupboard or jar moved');
 if(!(held.objects.cupboard>0&&held.objects.cupboard<1))throw Error('Pause did not catch moving panel');
 await page.getByTestId('play').click();await page.waitForFunction(t=>window.__mabear!.t()>t+.25,paused.t);await pause();const resumed=await state();
 const taken:any=await seek(scene.offset+take.start+take.dur*.95),back:any=await seek(scene.offset+.01),again:any=await seek(scene.offset+take.start+take.dur*.95);
 if(taken.objects.pantryJar.attachedTo!=='bear'||back.objects.pantryJar.attachedTo!==null||back.objects.cupboard!==0||JSON.stringify(taken.objects)!==JSON.stringify(again.objects))throw Error('Seek did not restore the same jar/panel');
 await page.screenshot({path:`${output}/actual-editor.png`,fullPage:true});
 const closed:any=await seek(scene.offset+closing.start+closing.dur+.1);if(closed.objects.cupboard!==0||closed.objects.pantryJar.attachedTo!=='bear')throw Error('Closing lost the jar');
 await page.getByTestId('replay').click();await page.waitForFunction(()=>window.__mabear!.t()<1);await pause();const replay:any=await state();if(replay.objects.cupboard!==0||replay.objects.pantryJar.attachedTo!==null)throw Error('Replay retained cupboard state');
 // The real text editor, offline director, compiler and timeline rebuild.
 await page.getByTestId('moment-card').nth(1).click();await page.getByTestId('moment-text').fill('Bear waves.');await page.getByTestId('preview-moment').click();
 await page.waitForFunction(()=>{const tl:any=window.__mabear!.timeline();return tl.segments.length>=2&&!tl.segments[1].segment.objectCues?.some((c:any)=>c.object==='kitchen_cupboard');},null,{timeout:30000});await pause();
 const edited:any=await state();if(edited.objects.cupboard!==0||edited.objects.pantryJar.attachedTo!==null)throw Error('Text edit retained a removed jar pickup');
 await load();await seek(scene.offset+closing.start+closing.dur+.1);await page.getByTestId('moment-card').nth(1).click();await page.getByTestId('request-remove-moment').click();await page.getByTestId('remove-moment').click();
 await page.waitForFunction(()=>window.__mabear!.segments()===2);const deleted:any=await state();if(deleted.objects.cupboard!==0||deleted.objects.pantryJar.attachedTo!==null)throw Error('Scene deletion retained cupboard ownership');
 // The persisted edited story also remains valid after reopening the app.
 await page.reload();await page.waitForFunction(()=>!!window.__mabear?.objects,null,{timeout:180000});await page.locator('.stage-loading').waitFor({state:'detached'});
 const reloaded:any=await state();if(reloaded.objects.pantryJar.attachedTo!==null||reloaded.objects.cupboard!==0)throw Error('Reload restored stale state');
 await writeFile(`${output}/proof.json`,JSON.stringify({paused,held,resumed,taken,back,again,closed,replay,edited,deleted,reloaded,errors,interceptedApiRequests:intercepted},null,2));
 if(errors.length)throw Error(errors.join('\n'));console.log('Main app: pause/resume, forward/backward seek, replay, text editing, deletion and reload passed.');
}finally{await browser.close();}
