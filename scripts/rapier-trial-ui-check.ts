import {chromium} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
const browser=await chromium.launch({channel:'chrome',headless:false,args:['--disable-background-timer-throttling','--disable-renderer-backgrounding','--disable-backgrounding-occluded-windows']});
const output='docs/rapier-trial/ui';await mkdir(output,{recursive:true});
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000},deviceScaleFactor:1}),errors:string[]=[],api:string[]=[],requests:string[]=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>requests.push(r.url()));
 await page.addInitScript(()=>{localStorage.setItem('mabear.lang','en');(globalThis as any).__name=(x:unknown)=>x;});
 await page.route('**/api/**',r=>{api.push(r.request().url());return r.fulfill({status:503,contentType:'application/json',body:'{"error":"Local verification; external services disabled"}'});});
 await page.goto('http://127.0.0.1:8801/?physics=rapier');
 await page.waitForFunction(()=>!!window.__mabear?.physics,null,{timeout:180000});await page.locator('.stage-loading').waitFor({state:'detached',timeout:180000});
 await page.getByTestId('mute').click();
 await page.evaluate(async()=>{
  const storePath='/src/app/store.ts',fixturePath='/scripts/rapier-trial-fixtures.ts';const {store}=await import(storePath);const {beat}=await import(fixturePath);
  const script={summary:'Masha drops her ball',time_of_day:'day',mood:'playful',music:{mood:'playful',intensity:'soft',change:'start'},ambience:[],beats:[beat('take',{item:'ball',target:'ball'}),beat('drop',{item:'ball'}),beat('idle',{delay_s:4})],rule_hits:[]};
  store.loadFixture({id:'garden_party',lang:'en',title:'Local drop check',paragraphs:[{text:'Masha picks up the ball, lets go, and watches it settle.',beatScript:script}]} as any);
 });
 await page.waitForFunction(()=>window.__mabear!.segments()===1);
 const timeline:any=await page.evaluate(()=>window.__mabear!.timeline());
 const drop=timeline.segments[0].segment.actorClips.masha.find((c:any)=>c.verb==='drop'),release=drop.start+drop.dur*.5;
 await page.getByTestId('scope-story').click();await page.getByTestId('play').click();await page.waitForFunction(t=>window.__mabear!.t()>t+.2,release);await page.getByTestId('pause').click();
 const paused:any=await page.evaluate(()=>({t:window.__mabear!.t(),physics:window.__mabear!.physics()}));
 await page.waitForTimeout(400);const held:any=await page.evaluate(()=>({t:window.__mabear!.t(),physics:window.__mabear!.physics()}));
 if(paused.t!==held.t||JSON.stringify(paused.physics.ball)!==JSON.stringify(held.physics.ball))throw Error('Pause moved the physical ball');
 if(!paused.physics.ball)throw Error('Actual app did not enable ball physics');
 await page.getByTestId('play').click();await page.waitForFunction(t=>window.__mabear!.t()>t+.3,paused.t);await page.getByTestId('pause').click();
 async function seek(t:number){const slider=page.getByRole('slider',{name:'Story progress',exact:true}),box=(await slider.boundingBox())!;await slider.click({position:{x:box.width*t/timeline.duration,y:box.height/2}});await page.waitForTimeout(100);return page.evaluate(()=>({t:window.__mabear!.t(),physics:window.__mabear!.physics()}));}
 const future:any=await seek(release+3),back:any=await seek(release-.2),futureAgain:any=await seek(release+3);
 if(back.physics.ball)throw Error('Seek before release retained free ball');
 if(JSON.stringify(future.physics.ball)!==JSON.stringify(futureAgain.physics.ball))throw Error('Repeated slider seek changed ball');
 await page.screenshot({path:`${output}/actual-editor.png`,fullPage:true});
 // Real scene deletion/replacement triggers Stage's setTimeline effect and cache invalidation.
 await page.getByTestId('examples').click();await page.getByTestId('example-bears_nap').click();await page.waitForFunction(()=>window.__mabear!.segments()>1);
 const edited:any=await page.evaluate(()=>window.__mabear!.physics());if(edited.ball)throw Error('Old ball survived scene replacement');
 await writeFile(`${output}/proof.json`,JSON.stringify({url:page.url(),release,duration:timeline.duration,paused,held,future,back,futureAgain,edited,errors,interceptedApiRequests:api,rapierLoaded:requests.some(s=>s.includes('stageReplay')||s.includes('rapier3d'))},null,2));
 if(errors.length)throw Error(errors.join('\n'));
 console.log(JSON.stringify({release,pausedAt:paused.t,forward:future.t,back:back.t,replaced:true,errors}));
}finally{await browser.close();}
