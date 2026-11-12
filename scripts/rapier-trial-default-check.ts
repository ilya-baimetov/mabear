import {chromium} from '@playwright/test';
import {writeFile} from 'node:fs/promises';
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
 const page=await browser.newPage(),requests:string[]=[],errors:string[]=[];page.on('request',r=>requests.push(r.url()));page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/api/**',r=>r.fulfill({status:503,body:'{}',contentType:'application/json'}));
 await page.goto(process.env.RAPIER_DEFAULT_URL??'http://127.0.0.1:8801/');await page.waitForFunction(()=>!!window.__mabear,null,{timeout:180000});
 const physics=await page.evaluate(()=>window.__mabear!.physics());
 const wasmRequests=requests.filter(s=>/rapier|stageReplay/i.test(s));
 if(physics!==null||wasmRequests.length||errors.length)throw Error(JSON.stringify({physics,wasmRequests,errors}));
 await writeFile('docs/rapier-trial/ui/default-player.json',JSON.stringify({url:page.url(),physics,wasmRequests,errors},null,2));console.log('Default player did not load Rapier.');
}finally{await browser.close();}
