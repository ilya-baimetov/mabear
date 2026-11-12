import {chromium} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
const destination=process.env.INTERIOR_UI_DIR??'docs/interior-integration/ui';await mkdir(destination,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:false,args:['--autoplay-policy=no-user-gesture-required','--disable-background-timer-throttling','--disable-renderer-backgrounding','--disable-backgrounding-occluded-windows']});
try{
 const page=await browser.newPage({viewport:{width:1600,height:1000},deviceScaleFactor:1});const errors:string[]=[],apiRequests:string[]=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{localStorage.setItem('mabear.lang','en');});
 // This local renderer/transport check never invokes a paid director or voice request.
 await page.route('**/api/**',async route=>{apiRequests.push(route.request().url());await route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'Local visual test; external generation disabled'})});});
 await page.goto(process.env.INTERIOR_APP_URL??'http://127.0.0.1:8806/');await page.getByTestId('moment-text').waitFor();await page.waitForFunction(()=>!!window.__mabear,null,{timeout:180000});await page.locator('.stage-loading').waitFor({state:'detached',timeout:180000});
 await page.getByTestId('mute').click();await page.getByTestId('examples').click();await page.getByTestId('example-cozy_evening').click();
 await page.waitForFunction(()=>window.__mabear!.segments()===3);await page.getByTestId('scope-story').click();
 const timeline=await page.evaluate(()=>window.__mabear!.timeline()) as any;
 const clips=timeline.segments.flatMap((s:any)=>Object.entries(s.segment.actorClips).flatMap(([actor,clips])=>(clips as any[]).filter(c=>!c.params.ambient).map(c=>({actor,verb:c.verb,start:s.offset+c.start,duration:c.dur}))));
 const cooking=clips.find((c:any)=>c.actor==='bear'&&c.verb==='cook'),eating=clips.find((c:any)=>c.actor==='masha'&&c.verb==='eat');
 async function seek(time:number){const slider=page.getByRole('slider',{name:'Story progress',exact:true}),box=await slider.boundingBox();if(!box)throw new Error('Story scrubber missing');await slider.click({position:{x:box.width*time/timeline.duration,y:box.height/2}});await page.waitForFunction(value=>Math.abs(window.__mabear!.t()-value)<.15,time);}
 for(const [name,at]of [['cooking',cooking.start+1],['reading',eating.start+.8]]as const){await seek(at);await page.screenshot({path:`${destination}/${name}.png`,fullPage:true});}
 await seek(cooking.start+.5);await page.getByTestId('play').click();await page.waitForFunction(()=>window.__mabear!.playing());await page.waitForFunction(t=>window.__mabear!.t()>t+.7,cooking.start+.5);await page.getByTestId('pause').click();
 const pausedAt=await page.evaluate(()=>window.__mabear!.t());await new Promise(resolve=>setTimeout(resolve,350));const heldAt=await page.evaluate(()=>window.__mabear!.t());if(Math.abs(heldAt-pausedAt)>.04)throw new Error(`Pause advanced ${heldAt-pausedAt}`);
 await page.getByTestId('play').click();await page.waitForFunction(t=>window.__mabear!.t()>t+.4,pausedAt);const resumedAt=await page.evaluate(()=>window.__mabear!.t());await page.waitForFunction(()=>!window.__mabear!.playing(),null,{timeout:120000});const endedAt=await page.evaluate(()=>window.__mabear!.t());if(Math.abs(endedAt-timeline.duration)>.15)throw new Error(`Playback stopped early ${endedAt}/${timeline.duration}`);
 await seek(cooking.start+1);await page.screenshot({path:`${destination}/studio-final.png`,fullPage:true});
 const scriptSources=await page.evaluate(()=>Array.from(document.scripts).map(s=>s.src).filter(Boolean));
 await writeFile(`${destination}/proof.json`,JSON.stringify({appUrl:page.url(),scriptSources,fixture:'cozy_evening_en',paragraphs:3,duration:timeline.duration,pausedAt,heldAt,resumedAt,endedAt,errors,apiRequests,scope:'Actual app UI and renderer; no paid API calls, audio disabled'},null,2));if(errors.length)throw new Error(errors.join('\n'));console.log(JSON.stringify({duration:timeline.duration,pausedAt,resumedAt,endedAt,errors,apiRequests}));
}finally{await browser.close();}
