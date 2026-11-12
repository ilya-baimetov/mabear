import {chromium} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
const destination='docs/staging-interactions/comparison';await mkdir(destination,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:false,args:['--autoplay-policy=no-user-gesture-required','--disable-background-timer-throttling','--disable-renderer-backgrounding','--disable-backgrounding-occluded-windows']});
try{
 const page=await browser.newPage({viewport:{width:1440,height:1100},deviceScaleFactor:1});const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await page.addInitScript('globalThis.__name=(value)=>value');
 await page.goto((process.env.STAGING_INTERACTIONS_URL??'http://127.0.0.1:8797')+'/docs/staging-interactions/');await page.waitForFunction(()=>!!(window as any).__stagingComparison?.cases.length,null,{timeout:30000});await page.bringToFront();
 const cases=await page.evaluate(()=>(window as any).__stagingComparison.cases);const results=[];
 for(const c of [...cases,{id:'all'}]){const result=await page.evaluate(async id=>{const r=await (window as any).__stagingComparison.record(id),bytes=new Uint8Array(await r.blob.arrayBuffer());let data='';for(let i=0;i<bytes.length;i+=32768)data+=String.fromCharCode(...bytes.subarray(i,i+32768));return{base64:btoa(data),mime:r.blob.type,alignment:r.alignment};},c.id);const{base64,...meta}=result,filename=`${c.id==='all'?'staging-before-after-montage':c.id}.${meta.mime.includes('mp4')?'mp4':'webm'}`;await writeFile(`${destination}/${filename}`,Buffer.from(base64,'base64'));results.push({filename,...meta});console.log(filename);}
 await page.evaluate(()=>(window as any).__stagingComparison.select('carry-lift'));await page.screenshot({path:`${destination}/comparison-player.png`,fullPage:true});await writeFile(`${destination}/alignment.json`,JSON.stringify({results,errors},null,2));if(errors.length)throw new Error(errors.join('\n'));
}finally{await browser.close();}
