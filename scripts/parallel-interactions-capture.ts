import {chromium} from '@playwright/test';
import {mkdir,writeFile,readFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {join} from 'node:path';
const mode=process.argv[2]??'after',before=mode==='before';
const output=`docs/parallel-interactions/${mode}`;await mkdir(output,{recursive:true});
const sourceRoot=before?await readFile('docs/parallel-interactions/baseline-path.txt','utf8'):process.cwd();
async function fingerprint(){const files:Record<string,string>={};async function walk(dir:string){for(const e of await readdir(join(sourceRoot,dir),{withFileTypes:true})){const p=join(dir,e.name);if(e.isDirectory())await walk(p);else files[p]=createHash('sha256').update(await readFile(join(sourceRoot,p))).digest('hex');}}await walk('src');return createHash('sha256').update(JSON.stringify(Object.entries(files).sort())).digest('hex');}
const source=await fingerprint(),browser=await chromium.launch({channel:'chrome',headless:false,args:['--disable-background-timer-throttling','--disable-renderer-backgrounding','--disable-backgrounding-occluded-windows']});
try{
 const page=await browser.newPage({viewport:{width:1280,height:810},deviceScaleFactor:1}),errors:string[]=[];
 page.on('pageerror',e=>errors.push(e.message));await page.addInitScript('globalThis.__name=x=>x');
 await page.route('**/api/**',r=>r.abort());
 await page.goto(`http://127.0.0.1:${before?8814:8811}/tools/parallel-interactions.html?mode=${before?'before':'after'}`);
 await page.waitForFunction(()=>!!(window as any).__parallelTrial,null,{timeout:180000});
 const info=await page.evaluate(()=>(window as any).__parallelTrial.info());
 if(/swiftshader|software|llvmpipe/i.test(info.renderer))throw Error('Native GPU required');
 const ids=process.argv[3]?.split(',')??['continuity','carrots'];
 let old:any=null;try{old=JSON.parse(await readFile(`${output}/proof.json`,'utf8'));}catch{}
 if(old?.source!==source||!old?.stable)old=null;
 const recordings:any[]=(old?.recordings??[]).filter((r:any)=>!ids.includes(r.id)),frames:any[]=(old?.frames??[]).filter((r:any)=>!ids.includes(r.id)),benchmarks:any[]=(old?.benchmarks??[]).filter((r:any)=>!ids.includes(r.id));
 for(const id of ids){
  const tl=await page.evaluate(id=>(window as any).__parallelTrial.stories[id],id);
  const actor=id==='cupboard'||id==='entry'?'bear':'masha';
  const samples=tl.segments.flatMap((e:any)=>e.segment.actorClips[actor].filter((c:any)=>!c.params.ambient).flatMap((c:any)=>[e.offset+c.start+c.dur*.25,e.offset+c.start+c.dur*.65]));
  for(const [i,t] of samples.entries()){
   const r=await page.evaluate(({id,t})=>{const x=(window as any).__parallelTrial;return {proof:x.inspect(id,t),png:document.querySelector('canvas')!.toDataURL()};},{id,t});
   await writeFile(`${output}/${id}-${i}.png`,Buffer.from(r.png.split(',')[1],'base64'));frames.push({id,t,...r.proof});
  }
  const r=await page.evaluate(async id=>{const r=await (window as any).__parallelTrial.record(id),bytes=new Uint8Array(await r.blob.arrayBuffer());let s='';for(let i=0;i<bytes.length;i+=32768)s+=String.fromCharCode(...bytes.subarray(i,i+32768));return{base64:btoa(s),mime:r.blob.type,duration:r.duration,frames:r.frames,gapP95:r.gapP95};},id);
  const filename=`${id}.${r.mime.includes('mp4')?'mp4':'webm'}`;await writeFile(`${output}/${filename}`,Buffer.from(r.base64,'base64'));
  const {base64,...meta}=r;recordings.push({id,filename,...meta,timeline:tl});
  benchmarks.push(await page.evaluate(id=>{const x=(window as any).__parallelTrial;x.physics?.dispose();return x.benchmark(id,5);},id));
  console.log(JSON.stringify({mode,id,filename,duration:r.duration}));
 }
 const stable=source===await fingerprint();await writeFile(`${output}/proof.json`,JSON.stringify({mode,sourceRoot,source,stable,capturedAt:new Date().toISOString(),info,recordings,frames,benchmarks,errors},null,2));
 if(!stable||errors.length)throw Error(JSON.stringify({stable,errors}));
}finally{await browser.close();}
