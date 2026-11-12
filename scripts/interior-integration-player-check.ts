import {chromium} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
const destination='docs/interior-integration/comparison';await mkdir(destination,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:false,args:['--autoplay-policy=no-user-gesture-required','--disable-background-timer-throttling','--disable-renderer-backgrounding','--disable-backgrounding-occluded-windows']});
try{
 const page=await browser.newPage({viewport:{width:1600,height:1080},deviceScaleFactor:1}),errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await page.addInitScript('globalThis.__name=(value)=>value');
 await page.goto((process.env.INTERIOR_URL??'http://127.0.0.1:8806')+'/docs/interior-integration/');await page.waitForFunction(()=>!!(window as any).__interiorComparison);await page.bringToFront();
 const cases=await page.evaluate(()=>(window as any).__interiorComparison.cases);
 for(const c of cases){await page.evaluate(async id=>(window as any).__interiorComparison.select(id),c.id);await page.waitForFunction(()=>Array.from(document.querySelectorAll('img')).every(i=>i.complete&&i.naturalWidth>0));}
 const selected=[...cases].sort((a,b)=>Math.abs((b.before.end-b.before.start)-(b.after.end-b.after.start))-Math.abs((a.before.end-a.before.start)-(a.after.end-a.after.start)))[0];
 await page.evaluate(async id=>(window as any).__interiorComparison.select(id),selected.id);await page.locator('#play').click();await page.waitForFunction(()=>Array.from(document.querySelectorAll('video')).every(v=>!v.paused&&!v.seeking));
 const start=await page.evaluate(()=>({now:performance.now(),times:Array.from(document.querySelectorAll('video')).map(v=>v.currentTime)}));await page.waitForTimeout(800);
 const progressed=await page.evaluate(()=>({now:performance.now(),times:Array.from(document.querySelectorAll('video')).map(v=>v.currentTime),rates:Array.from(document.querySelectorAll('video')).map(v=>v.playbackRate)}));
 const elapsed=(progressed.now-start.now)/1000;
 if(progressed.rates.some(rate=>rate!==1)||progressed.times.some((t,i)=>Math.abs(t-start.times[i]-elapsed)>.2))throw new Error('Comparison videos did not play at actual 1× speed');
 await page.locator('#play').click();const paused=await page.evaluate(()=>Array.from(document.querySelectorAll('video')).map(v=>v.currentTime));await page.waitForTimeout(300);const held=await page.evaluate(()=>Array.from(document.querySelectorAll('video')).map(v=>v.currentTime));if(held.some((t,i)=>Math.abs(t-paused[i])>.04))throw new Error('Comparison advanced while paused');
 await page.locator('#seek').evaluate(el=>{(el as HTMLInputElement).value='.5';el.dispatchEvent(new Event('input',{bubbles:true}));});await page.waitForFunction(()=>Array.from(document.querySelectorAll('video')).every(v=>!v.seeking));
 const duration=Math.max(selected.before.end-selected.before.start,selected.after.end-selected.after.start),sought=await page.evaluate(()=>Array.from(document.querySelectorAll('video')).map(v=>v.currentTime));
 if(sought.some((t,i)=>Math.abs(t-Math.min(selected[['before','after'][i]].end,selected[['before','after'][i]].start+duration*.5))>.05))throw new Error('Comparison seek missed source timestamp');
 await page.locator('#play').click();await page.waitForFunction(()=>Number((document.querySelector('#seek')as HTMLInputElement).value)===1,null,{timeout:30000});await page.waitForFunction(()=>Array.from(document.querySelectorAll('video')).every(v=>v.paused&&!v.seeking));
 const ended=await page.evaluate(()=>Array.from(document.querySelectorAll('video')).map(v=>v.currentTime));if(ended.some((t,i)=>Math.abs(t-selected[['before','after'][i]].end)>.15))throw new Error('Comparison failed to hold final excerpt frames');
 await page.locator('#play').click();await page.waitForFunction(()=>Array.from(document.querySelectorAll('video')).every(v=>!v.paused&&!v.seeking));const replayed=await page.evaluate(()=>Array.from(document.querySelectorAll('video')).map(v=>v.currentTime));if(replayed.some((t,i)=>Math.abs(t-selected[['before','after'][i]].start)>.4))throw new Error('Comparison replay did not return to excerpt start');
 await page.locator('#play').click();await page.locator('#still').click();await page.screenshot({path:`${destination}/player-tested.png`,fullPage:true});
 const proof={checkedAt:new Date().toISOString(),cases:cases.map((c:any)=>c.id),testedCase:selected.id,start,progressed,elapsed,paused,held,sought,ended,replayed,errors};await writeFile(`${destination}/player-check.json`,JSON.stringify(proof,null,2));if(errors.length)throw new Error(errors.join('\n'));console.log(JSON.stringify({cases:cases.length,elapsed,rates:progressed.rates,paused,held,sought,ended,replayed,errors}));
}finally{await browser.close();}
