import {chromium} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
import {CUPBOARD_TEXTS} from './cupboard-fixtures';
const output='docs/cupboard/deployment';await mkdir(output,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:false});
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors:string[]=[],requests:string[]=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>requests.push(r.url()));
 await page.addInitScript(()=>{localStorage.setItem('mabear.lang','en');(globalThis as any).__name=(x:unknown)=>x;});
 await page.route('**/api/**',r=>r.fulfill({status:503,contentType:'application/json',body:'{"error":"Release check; external services disabled"}'}));
 await page.goto('http://127.0.0.1:8805/');await page.waitForFunction(()=>!!window.__mabear?.objects,null,{timeout:180000});await page.locator('.stage-loading').waitFor({state:'detached'});
 await page.getByTestId('mute').click();await page.getByTestId('full-story').click();await page.getByTestId('full-story-text').fill(CUPBOARD_TEXTS.join('\n\n'));await page.getByTestId('apply-full-story').click();await page.getByTestId('play-all').click();
 await page.waitForFunction(()=>window.__mabear!.segments()===3,null,{timeout:90000});await page.getByTestId('pause').click();
 const tl:any=await page.evaluate(()=>window.__mabear!.timeline()),e=tl.segments[1],take=e.segment.actorClips.bear.find((c:any)=>c.verb==='take');
 const state=()=>page.evaluate(()=>({t:window.__mabear!.t(),objects:window.__mabear!.objects(),physics:window.__mabear!.physics()}));
 async function seek(t:number){const slider=page.getByRole('slider',{name:'Story progress',exact:true}),box=(await slider.boundingBox())!;await slider.click({position:{x:box.width*t/tl.duration,y:box.height/2}});await page.waitForTimeout(150);return state();}
 const taken:any=await seek(e.offset+take.start+take.dur*.95);if(taken.objects.cupboard!==1||taken.objects.pantryJar.attachedTo!=='bear')throw Error('Packaged app did not retrieve the jar');
 const closed:any=await seek(e.offset+e.segment.duration-.1);if(closed.objects.cupboard!==0||closed.objects.pantryJar.attachedTo!=='bear')throw Error('Packaged app lost jar on close');
 await page.screenshot({path:output+'/packaged-app.png',fullPage:true});
 const reset:any=await seek(0);if(reset.objects.cupboard!==0||reset.objects.pantryJar.attachedTo!==null)throw Error('Packaged app did not reset on seek');
 const result={checkedAt:new Date().toISOString(),url:page.url(),entryVia:'Full story editor; offline generation with API network blocked',taken,closed,reset,defaultPhysicsLoaded:requests.some(u=>u.includes('/assets/stageReplay-')),assetErrors:errors};
 await writeFile(output+'/packaged-app.json',JSON.stringify(result,null,2));if(errors.length||!result.defaultPhysicsLoaded)throw Error(JSON.stringify(result));console.log('Production build: actual text entry, cupboard open/take/close, backward seek and default physics passed.');
}finally{await browser.close();}
