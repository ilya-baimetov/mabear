import {chromium} from '@playwright/test';
import {mkdir,writeFile,readFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {join} from 'node:path';
const mode=process.argv[2]??'after',before=mode==='before';
const output=`docs/interactive-objects/${mode}`;await mkdir(output,{recursive:true});
const sourceRoot=before?await readFile('docs/interactive-objects/baseline/path.txt','utf8'):process.cwd();
async function fingerprint(){const files:Record<string,string>={};async function walk(dir:string){for(const e of await readdir(join(sourceRoot,dir),{withFileTypes:true})){const p=join(dir,e.name);if(e.isDirectory())await walk(p);else files[p]=createHash('sha256').update(await readFile(join(sourceRoot,p))).digest('hex');}}await walk('src');return createHash('sha256').update(JSON.stringify(Object.entries(files).sort())).digest('hex');}
const source=await fingerprint(),browser=await chromium.launch({channel:'chrome',headless:false,args:['--disable-background-timer-throttling','--disable-renderer-backgrounding','--disable-backgrounding-occluded-windows']});
try{
 const page=await browser.newPage({viewport:{width:1280,height:810},deviceScaleFactor:1}),errors:string[]=[];
 page.on('pageerror',e=>errors.push(e.message));await page.addInitScript('globalThis.__name=x=>x');
 await page.route('**/api/**',r=>r.abort());
 await page.goto(`http://127.0.0.1:${before?8802:8801}/tools/interactive-objects.html?mode=${before?'baseline':'after'}`);
 await page.waitForFunction(()=>!!(window as any).__objectTrial,null,{timeout:180000});
 const info=await page.evaluate(()=>(window as any).__objectTrial.info());
 if(/swiftshader|software|llvmpipe/i.test(info.renderer))throw Error('Native GPU required');
 const recordings=[],frames=[],benchmarks=[];
 for(const id of before?['entry','approach']:['entry','approach','roundtrip']){
  const tl=await page.evaluate(id=>(window as any).__objectTrial.stories[id],id);
  const samples=tl.segments.flatMap((e:any)=>e.segment.actorClips.bear.filter((c:any)=>!c.params.ambient).map((c:any)=>e.offset+c.start+c.dur*.55));
  for(const [i,t] of samples.entries()){
   const r=await page.evaluate(({id,t})=>{const x=(window as any).__objectTrial;return {proof:x.inspect(id,t),png:document.querySelector('canvas')!.toDataURL()};},{id,t});
   await writeFile(`${output}/${id}-${i}.png`,Buffer.from(r.png.split(',')[1],'base64'));frames.push({id,t,...r.proof});
  }
  const r=await page.evaluate(async id=>{const r=await (window as any).__objectTrial.record(id),bytes=new Uint8Array(await r.blob.arrayBuffer());let s='';for(let i=0;i<bytes.length;i+=32768)s+=String.fromCharCode(...bytes.subarray(i,i+32768));return{base64:btoa(s),mime:r.blob.type,duration:r.duration,frames:r.frames,gapP95:r.gapP95};},id);
  const filename=`${id}.${r.mime.includes('mp4')?'mp4':'webm'}`;await writeFile(`${output}/${filename}`,Buffer.from(r.base64,'base64'));
  const {base64,...meta}=r;recordings.push({id,filename,...meta});
  benchmarks.push(await page.evaluate(id=>{const x=(window as any).__objectTrial;x.physics?.dispose();return x.benchmark(id,4);},id));
  console.log(JSON.stringify({mode,id,filename,duration:r.duration}));
 }
 if(!before)for(const id of ['russian','held','cozy','regression']){
  const tl=await page.evaluate(id=>(window as any).__objectTrial.stories[id],id);
  let t=tl.duration*.5;
  if(id==='held'||id==='russian'){const c=tl.segments[0].segment.actorClips.bear.find((c:any)=>c.params.portal);t=c.start+c.dur+1;}
  if(id==='cozy'){const s=tl.segments[0],c=s.segment.actorClips.bear.find((c:any)=>c.verb==='cook');t=s.offset+c.start+c.dur*.5;}
  if(id==='regression')t=45;
  const r=await page.evaluate(({id,t})=>{const x=(window as any).__objectTrial;return {proof:x.inspect(id,t),png:document.querySelector('canvas')!.toDataURL()};},{id,t});
  await writeFile(`${output}/${id}.png`,Buffer.from(r.png.split(',')[1],'base64'));frames.push({id,t,...r.proof});
 }
 const stable=source===await fingerprint();await writeFile(`${output}/proof.json`,JSON.stringify({mode,sourceRoot,source,stable,capturedAt:new Date().toISOString(),info,recordings,frames,benchmarks,errors},null,2));
 if(!stable||errors.length)throw Error(JSON.stringify({stable,errors}));
}finally{await browser.close();}
