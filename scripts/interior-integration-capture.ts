import {chromium} from '@playwright/test';
import {mkdir,readFile,writeFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {join,relative} from 'node:path';
const phase=process.argv[2]??'after',quick=process.argv.includes('--quick');
const base=process.env.INTERIOR_URL??`http://127.0.0.1:${phase==='before'?8805:8806}`;
const destination=process.env.INTERIOR_DIR??`docs/interior-integration/${phase}`;
const source=process.env.INTERIOR_SOURCE??(phase==='before'?'/tmp/mabear-interior-before-20261107':process.cwd());
await mkdir(destination,{recursive:true});
async function fingerprint(){const files:Record<string,string>={};async function scan(dir:string){for(const item of await readdir(dir,{withFileTypes:true})){const path=join(dir,item.name);if(item.isDirectory())await scan(path);else if(item.isFile())files[relative(source,path)]=createHash('sha256').update(await readFile(path)).digest('hex');}}await scan(join(source,'src'));return{files,fingerprint:createHash('sha256').update(JSON.stringify(Object.entries(files).sort(([a],[b])=>a.localeCompare(b)))).digest('hex')};}
const stamp=await fingerprint();
const harnessSha256=createHash('sha256').update(await readFile(join(source,'tools/interior-integration.ts'))).digest('hex');
const browser=await chromium.launch({channel:'chrome',headless:false,args:['--autoplay-policy=no-user-gesture-required','--disable-background-timer-throttling','--disable-renderer-backgrounding','--disable-backgrounding-occluded-windows']});
try{
 const page=await browser.newPage({viewport:{width:1280,height:820},deviceScaleFactor:1});const errors:string[]=[],failedRequests:string[]=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('requestfailed',r=>failedRequests.push(`${r.url()}: ${r.failure()?.errorText}`));
 await page.addInitScript('globalThis.__name=(value)=>value');await page.goto(`${base}/tools/interior-integration.html`);await page.waitForFunction(()=>!!(window as any).__interiorIntegration,null,{timeout:180000});await page.bringToFront();
 const info=await page.evaluate(()=>(window as any).__interiorIntegration.info());
 if(/swiftshader|llvmpipe|software/i.test(info.renderer))throw new Error(`Native GPU required, got ${info.renderer}`);
 console.log(JSON.stringify({phase,renderer:info.renderer,durations:info.durations}));
 const snapshots:any[]=[],sweep:any[]=[];
 for(const [story,cases]of Object.entries(info.snapshots)as[string,{id:string,time:number}[]][]){
  if(process.env.INTERIOR_STORIES&&!process.env.INTERIOR_STORIES.split(',').includes(story))continue;
  for(const sample of cases){if(process.env.INTERIOR_SNAPSHOT_MATCH&&!new RegExp(process.env.INTERIOR_SNAPSHOT_MATCH).test(sample.id))continue;const{png,...meta}=await page.evaluate(({story,time})=>(window as any).__interiorIntegration.render(story,time),{story,time:sample.time});await writeFile(`${destination}/${story}-${sample.id}.png`,Buffer.from(png.split(',')[1],'base64'));snapshots.push({...sample,...meta});}
  for(let time=0;time<info.durations[story];time+=Number(process.env.INTERIOR_STEP??(quick?2:.5)))sweep.push(await page.evaluate(({story,time})=>(window as any).__interiorIntegration.inspect(story,time),{story,time}));
 }
 const proof={phase,source,...stamp,harnessSha256,capturedAt:new Date().toISOString(),...info,snapshots,sweep,errors,failedRequests};await writeFile(`${destination}/proof.json`,JSON.stringify(proof,null,2));
 const recordings=[];
 if(!quick)for(const story of ['cozy_evening_en','kitchen_visit']){
  const result=await page.evaluate(async({story,phase})=>{const r=await(window as any).__interiorIntegration.record(story,phase.toUpperCase()),bytes=new Uint8Array(await r.blob.arrayBuffer());let data='';for(let i=0;i<bytes.length;i+=32768)data+=String.fromCharCode(...bytes.subarray(i,i+32768));const{blob,...meta}=r;return{base64:btoa(data),mime:blob.type,...meta};},{story,phase});
  const{base64,...meta}=result,filename=`${story}.${meta.mime.includes('mp4')?'mp4':'webm'}`;await writeFile(`${destination}/${filename}`,Buffer.from(base64,'base64'));recordings.push({story,filename,...meta});console.log(JSON.stringify({story,...meta}));
 }
 const sourceStable=(await fingerprint()).fingerprint===stamp.fingerprint;
 await writeFile(`${destination}/recordings.json`,JSON.stringify({phase,renderer:info.renderer,sourceStable,recordings,errors,failedRequests},null,2));
 if(errors.length||failedRequests.length)throw new Error(JSON.stringify({errors,failedRequests}));
 if(!sourceStable&&!quick)throw new Error('Source changed during final capture; repeat after freeze.');
}finally{await browser.close();}
