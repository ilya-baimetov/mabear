import {chromium} from '@playwright/test';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const phase=process.argv[2];if(!['before','after'].includes(phase))throw new Error('Use before or after');
const base=process.env.STAGING_INTERACTIONS_URL??`http://127.0.0.1:${phase==='before'?8796:8797}`;
const destination=process.env.STAGING_INTERACTIONS_DIR??`docs/staging-interactions/${phase}`;
await mkdir(destination,{recursive:true});
const sourceDir=process.env.STAGING_INTERACTIONS_SOURCE??process.cwd();
async function fingerprint(){
 const paths=execFileSync('git',['-C',sourceDir,'ls-files','--cached','--others','--exclude-standard','src'],{encoding:'utf8'}).trim().split('\n').sort();
 const hashes=Object.fromEntries(await Promise.all(paths.map(async path=>[path,createHash('sha256').update(await readFile(`${sourceDir}/${path}`)).digest('hex')])));
 return{sourceHashes:hashes,sourceFingerprint:createHash('sha256').update(JSON.stringify(hashes)).digest('hex')};
}
const sourceHead=execFileSync('git',['-C',sourceDir,'rev-parse','HEAD'],{encoding:'utf8'}).trim();
const sourceStamp=await fingerprint();
const browser=await chromium.launch({channel:'chrome',headless:false,args:['--autoplay-policy=no-user-gesture-required','--disable-background-timer-throttling','--disable-renderer-backgrounding','--disable-backgrounding-occluded-windows']});
try{
 const page=await browser.newPage({viewport:{width:1280,height:768},deviceScaleFactor:1});const errors:string[]=[],failedRequests:string[]=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('requestfailed',r=>failedRequests.push(`${r.url()}: ${r.failure()?.errorText}`));
 await page.addInitScript('globalThis.__name=(value)=>value');
 await page.goto(`${base}/tools/staging-interactions.html`);await page.waitForFunction(()=>!!(window as any).__stagingInteractions,null,{timeout:180000});await page.bringToFront();
 const info=await page.evaluate(()=>(window as any).__stagingInteractions.info());
 if(/swiftshader|llvmpipe|software/i.test(info.renderer))throw new Error(`Native GPU required, received ${info.renderer}`);
 console.log(JSON.stringify({phase,renderer:info.renderer,durations:info.durations}));
 const proof:any[]=[];
 for(const [story,times] of Object.entries(info.snapshots) as [string,number[]][]){
  for(const time of times){const{png,...meta}=await page.evaluate(({story,time})=>(window as any).__stagingInteractions.render(story,time),{story,time});proof.push(meta);await writeFile(`${destination}/${story}-${time.toFixed(2)}s.png`,Buffer.from(png.split(',')[1],'base64'));}
 }
 await writeFile(`${destination}/proof.json`,JSON.stringify({phase,sourceDir,sourceHead,...sourceStamp,capturedAt:new Date().toISOString(),...info,proof,errors,failedRequests},null,2));
 const recordings=[];
 for(const story of Object.keys(info.durations)){
  const result=await page.evaluate(async({story,phase})=>{const r=await (window as any).__stagingInteractions.record(story,phase.toUpperCase()),bytes=new Uint8Array(await r.blob.arrayBuffer());let data='';for(let i=0;i<bytes.length;i+=32768)data+=String.fromCharCode(...bytes.subarray(i,i+32768));const{blob,...meta}=r;return{base64:btoa(data),mime:blob.type,...meta};},{story,phase});
  const{base64,...meta}=result,filename=`${story}.${meta.mime.includes('mp4')?'mp4':'webm'}`;
  await writeFile(`${destination}/${filename}`,Buffer.from(base64,'base64'));recordings.push({story,filename,...meta});
  await writeFile(`${destination}/recordings.json`,JSON.stringify({phase,renderer:info.renderer,recordings,errors,failedRequests},null,2));console.log(JSON.stringify({story,...meta}));
 }
 if((await fingerprint()).sourceFingerprint!==sourceStamp.sourceFingerprint)errors.push('Production source changed during capture; discard this capture.');
 await writeFile(`${destination}/recordings.json`,JSON.stringify({phase,renderer:info.renderer,sourceStable:!errors.some(e=>e.includes('source changed')),recordings,errors,failedRequests},null,2));
 if(errors.length||failedRequests.length)throw new Error(JSON.stringify({errors,failedRequests}));
}finally{await browser.close();}
