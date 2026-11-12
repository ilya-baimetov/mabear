import {chromium} from '@playwright/test';
import {mkdir,readFile,writeFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve,join} from 'node:path';
const mode=process.argv[2]??'after';
if(!['baseline','control','after'].includes(mode))throw Error('Expected baseline, control or after');
const root=mode==='baseline'?'/tmp/mabear-rapier-baseline':process.cwd();
const output=`docs/rapier-trial/${mode}`;await mkdir(output,{recursive:true});
async function fingerprint(){
 const paths:string[]=[];async function walk(dir:string){for(const entry of await readdir(dir,{withFileTypes:true})){const p=join(dir,entry.name);if(entry.isDirectory())await walk(p);else paths.push(p);}}await walk(join(root,'src'));
 const hashes=Object.fromEntries(await Promise.all(paths.sort().map(async p=>[p.slice(root.length+1),createHash('sha256').update(await readFile(p)).digest('hex')])));
 return {files:hashes,fingerprint:createHash('sha256').update(JSON.stringify(hashes)).digest('hex')};
}
const before=await fingerprint(),browser=await chromium.launch({channel:'chrome',headless:false,args:['--disable-background-timer-throttling','--disable-renderer-backgrounding','--disable-backgrounding-occluded-windows']});
try{
 const page=await browser.newPage({viewport:{width:1280,height:810},deviceScaleFactor:1}),errors:string[]=[],failed:string[]=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('requestfailed',r=>failed.push(`${r.url()}: ${r.failure()?.errorText}`));
 await page.addInitScript('globalThis.__name=(x)=>x');
 await page.goto(`http://127.0.0.1:${mode==='baseline'?8802:8801}/tools/rapier-trial.html?mode=${mode}`);
 await page.waitForFunction(()=>!!(window as any).__rapierTrial,null,{timeout:180000});await page.bringToFront();
 const info=await page.evaluate(()=>(window as any).__rapierTrial.info());if(/swiftshader|software|llvmpipe/i.test(info.renderer))throw Error('Native GPU required');
 const ids=mode==='control'?['drop']:mode==='baseline'?['obstacle','regression']:['obstacle','drop','regression'];
 const proofs:unknown[]=[],recordings:unknown[]=[],benchmarks:unknown[]=[];
 for(const id of ids){
  const times=id==='drop'?[1.99,2,2.12,2.3,2.5,3,4,8]:id==='obstacle'?[.3,1,2,3.5,4.5,5.5,8]:[35.887,36.5,37.3,39.8,41,42.6,47];
  for(const t of times){
   const result=await page.evaluate(({id,t})=>{const x=(window as any).__rapierTrial;const proof=x.inspect(id,t);return{proof,png:document.querySelector('canvas')!.toDataURL()};},{id,t});
   proofs.push({id,...result.proof});await writeFile(`${output}/${id}-${t.toFixed(2)}.png`,Buffer.from(result.png.split(',')[1],'base64'));
  }
  // Each cold measurement starts with an empty replay cache.
  const benchmark=await page.evaluate(async id=>{const x=(window as any).__rapierTrial;x.physics?.dispose();return x.benchmark(id);},id);benchmarks.push(benchmark);
  const from=id==='regression'?34.8:0,to=id==='regression'?50.282:info.durations[id];
  const result=await page.evaluate(async({id,from,to})=>{const r=await (window as any).__rapierTrial.record(id,from,to),bytes=new Uint8Array(await r.blob.arrayBuffer());let s='';for(let i=0;i<bytes.length;i+=32768)s+=String.fromCharCode(...bytes.subarray(i,i+32768));return{base64:btoa(s),mime:r.blob.type,duration:r.duration,frames:r.frames,gapP95:r.gapP95};},{id,from,to});
  const {base64,...meta}=result,filename=`${id}.${result.mime.includes('mp4')?'mp4':'webm'}`;await writeFile(`${output}/${filename}`,Buffer.from(base64,'base64'));
  recordings.push({id,from,to,filename,...meta});console.log(JSON.stringify({mode,id,benchmark,recording:meta}));
 }
 const after=await fingerprint();if(after.fingerprint!==before.fingerprint)errors.push('Source changed during capture');
 await writeFile(`${output}/proof.json`,JSON.stringify({mode,sourceRoot:root,source:before,capturedAt:new Date().toISOString(),info,proofs,benchmarks,recordings,errors,failed},null,2));
 if(errors.length||failed.length)throw Error(JSON.stringify({errors,failed}));
}finally{await browser.close();}
