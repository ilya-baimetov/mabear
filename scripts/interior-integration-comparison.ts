import {chromium} from '@playwright/test';
import {writeFile,mkdir} from 'node:fs/promises';
await mkdir('docs/interior-integration/comparison',{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:false,args:['--autoplay-policy=no-user-gesture-required','--disable-background-timer-throttling','--disable-renderer-backgrounding','--disable-backgrounding-occluded-windows']});
try{
 const page=await browser.newPage({viewport:{width:1600,height:1080},deviceScaleFactor:1});const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await page.addInitScript('globalThis.__name=(value)=>value');
 await page.goto((process.env.INTERIOR_URL??'http://127.0.0.1:8806')+'/docs/interior-integration/');await page.waitForFunction(()=>!!(window as any).__interiorComparison,null,{timeout:30000});await page.bringToFront();
 const cases=await page.evaluate(()=>(window as any).__interiorComparison.cases);
 await page.evaluate(async id=>await(window as any).__interiorComparison.select(id),cases[0].id);await page.screenshot({path:'docs/interior-integration/comparison/player.png',fullPage:true});
 const result=await page.evaluate(async ids=>{const r=await(window as any).__interiorComparison.record(ids),bytes=new Uint8Array(await r.blob.arrayBuffer());let data='';for(let i=0;i<bytes.length;i+=32768)data+=String.fromCharCode(...bytes.subarray(i,i+32768));return{base64:btoa(data),mime:r.blob.type,ids:r.ids};},cases.map((c:any)=>c.id));
 const{base64,...meta}=result,filename=`interior-before-after.${meta.mime.includes('mp4')?'mp4':'webm'}`;
 await writeFile(`docs/interior-integration/comparison/${filename}`,Buffer.from(base64,'base64'));await writeFile('docs/interior-integration/comparison/proof.json',JSON.stringify({filename,...meta,errors},null,2));if(errors.length)throw new Error(errors.join('\n'));console.log(filename);
}finally{await browser.close();}
