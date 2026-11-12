import {chromium} from '@playwright/test';
import {writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const folder='docs/staging-interactions',url=pathToFileURL(resolve(`${folder}/index.html`)).href;
const browser=await chromium.launch({channel:'chrome',headless:false,args:['--autoplay-policy=no-user-gesture-required']});
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors:string[]=[],jsonRequests:string[]=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(r.url().endsWith('.json'))jsonRequests.push(r.url());});
 await page.goto(url);await page.waitForFunction(()=>!!(window as any).__stagingComparison?.cases.length);
 const defaultCase=await page.locator('[aria-pressed=true]').getAttribute('data-case');
 const count=await page.locator('[data-case]').count();
 await page.evaluate(async()=>{await (window as any).__stagingComparison.select('cooking');await (window as any).__stagingComparison.start();});
 await page.waitForTimeout(650);
 const playback=await page.evaluate(()=>{const api=(window as any).__stagingComparison;api.pause();const c=api.cases.find((c:any)=>c.id==='cooking');return[...document.querySelectorAll('video')].map((v,i)=>({elapsed:v.currentTime-c.sides[i].start,ready:v.readyState,paused:v.paused}));});
 await page.locator('#seek').evaluate((input:HTMLInputElement)=>{input.value='2.2';input.dispatchEvent(new Event('input',{bubbles:true}));});
 await page.waitForFunction(()=>{const c=(window as any).__stagingComparison.cases.find((c:any)=>c.id==='cooking');return[...document.querySelectorAll('video')].every((v,i)=>Math.abs(v.currentTime-c.sides[i].start-2.2)<.05);});
 await page.locator('#restart').click();
 await page.waitForFunction(()=>{const c=(window as any).__stagingComparison.cases.find((c:any)=>c.id==='cooking');return[...document.querySelectorAll('video')].every((v,i)=>Math.abs(v.currentTime-c.sides[i].start)<.05);});
 await page.setViewportSize({width:390,height:844});const mobileOverflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);
 await page.setViewportSize({width:1440,height:1000});await page.evaluate(()=>(window as any).__stagingComparison.select('carry-lift'));
 const result={url,defaultCase,count,playback,seekAndRestart:true,mobileOverflow,jsonRequests,errors};
 await writeFile(`${folder}/player-checks.json`,JSON.stringify(result,null,2));
 if(defaultCase!=='carry-lift'||count!==11||errors.length||jsonRequests.length||mobileOverflow||playback.some(v=>v.elapsed<.35||!v.paused||v.ready<2)||Math.abs(playback[0].elapsed-playback[1].elapsed)>.12)throw new Error(JSON.stringify(result));
 console.log(JSON.stringify(result));
}finally{await browser.close();}
