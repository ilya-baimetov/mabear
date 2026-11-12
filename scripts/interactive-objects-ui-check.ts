import {chromium} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
const output='docs/interactive-objects/ui';await mkdir(output,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:false});
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors:string[]=[],intercepted:string[]=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{localStorage.setItem('mabear.lang','en');(globalThis as any).__name=(x:unknown)=>x;});
 await page.route('**/api/**',r=>{intercepted.push(r.request().url());return r.fulfill({status:503,contentType:'application/json',body:'{"error":"Offline local verification"}'});});
 await page.goto('http://127.0.0.1:8801/');
 await page.waitForFunction(()=>!!window.__mabear?.objects,null,{timeout:180000});await page.locator('.stage-loading').waitFor({state:'detached'});
 await page.getByTestId('mute').click();
 const defaultPhysics=await page.evaluate(()=>window.__mabear!.physics());if(!defaultPhysics)throw Error('Physics was not enabled by default');
 await page.evaluate(async()=>{
  const storePath='/src/app/store.ts',parserPath='/src/director/offline/parser.ts',worldPath='/src/compiler/worldState.ts';
  const {store}=await import(storePath),{parseParagraph}=await import(parserPath),{initialWorldState}=await import(worldPath);
  const texts=['Bear goes to the house, opens the door and comes in.','Bear closes the door. Bear waves.'];
  store.loadFixture({id:'garden_party',lang:'en',title:'Door entry — actual editor',paragraphs:texts.map(text=>({text,beatScript:parseParagraph(text,'en',initialWorldState())}))});
 });
 await page.waitForFunction(()=>window.__mabear!.segments()===2);
 const timeline:any=await page.evaluate(()=>window.__mabear!.timeline());
 const cue=timeline.segments[0].segment.objectCues[0],middle=cue.start+cue.dur/2;
 await page.getByTestId('scope-story').click();await page.getByTestId('play').click();
 await page.waitForFunction(t=>window.__mabear!.t()>t,middle);await page.getByTestId('pause').click();
 const state=()=>page.evaluate(()=>({t:window.__mabear!.t(),playing:window.__mabear!.playing(),objects:window.__mabear!.objects(),physics:window.__mabear!.physics()}));
 const paused:any=await state();await page.waitForTimeout(350);const held:any=await state();
 if(paused.t!==held.t||JSON.stringify(paused.objects)!==JSON.stringify(held.objects))throw Error('Paused door moved');
 await page.getByTestId('play').click();await page.waitForFunction(t=>window.__mabear!.t()>t+.25,paused.t);await page.getByTestId('pause').click();
 async function seek(t:number){const slider=page.getByRole('slider',{name:'Story progress',exact:true}),box=(await slider.boundingBox())!;await slider.click({position:{x:box.width*t/timeline.duration,y:box.height/2}});await page.waitForTimeout(100);return state();}
 const future:any=await seek(timeline.segments[0].segment.duration-.4),back:any=await seek(0),again:any=await seek(timeline.segments[0].segment.duration-.4);
 if(future.objects.state.house_door!==1||back.objects.state.house_door!==0||JSON.stringify(future.objects)!==JSON.stringify(again.objects))throw Error('Door seek state mismatch');
 if(future.objects.panels.some((p:any)=>p.open!==1))throw Error('Rendered panel did not follow door state');
 await page.screenshot({path:`${output}/actual-editor.png`,fullPage:true});
 // Edit the source through the real editor. Network is blocked, so the existing
 // offline director handles the new text; no paid generation/voice calls occur.
 await page.getByTestId('moment-card').first().click();
 await page.getByTestId('moment-text').fill('Bear walks to the door.');
 await page.getByTestId('preview-moment').click();
 await page.waitForFunction(()=>{const tl:any=window.__mabear!.timeline();return tl.segments.length>0&&!tl.segments[0].segment.objectCues?.length;},null,{timeout:30000});
 await page.waitForTimeout(300);if(await page.getByTestId('pause').isVisible())await page.getByTestId('pause').click();
 const edited:any=await state();if(edited.objects.state.house_door!==0)throw Error('Edited scene retained the open door');
 await page.getByTestId('request-remove-moment').click();await page.getByTestId('remove-moment').click();
 await page.waitForFunction(()=>window.__mabear!.segments()<=1);const deleted:any=await state();
 if(deleted.objects.state.house_door!==0)throw Error('Deleted scene retained the open door');
 await writeFile(`${output}/proof.json`,JSON.stringify({defaultPhysics,paused,held,future,back,again,edited,deleted,errors,interceptedApiRequests:intercepted},null,2));
 if(errors.length)throw Error(errors.join('\n'));
 console.log('Default physics, door pause/resume, seek, actual editor change and deletion passed.');
 // Explicit diagnostic opt-out and a failed physics import must still render.
 for(const kind of ['off','failed-import']){
  const p=await browser.newPage();await p.route('**/api/**',r=>r.fulfill({status:503,body:'{}'}));
  if(kind==='failed-import')await p.route('**/src/engine/physics/stageReplay.ts',r=>r.abort());
  await p.goto(`http://127.0.0.1:8801/${kind==='off'?'?physics=off':''}`);
  await p.waitForFunction(()=>!!window.__mabear,null,{timeout:180000});await p.locator('.stage-loading').waitFor({state:'detached'});
  const value=await p.evaluate(()=>({physics:window.__mabear!.physics(),png:window.__mabear!.snapshot()}));
  if(value.physics!==null||!value.png)throw Error(`${kind} did not fall back to usable animation`);
  await writeFile(`${output}/${kind}.json`,JSON.stringify({physics:value.physics,rendered:!!value.png}));await p.close();
 }
}finally{await browser.close();}
