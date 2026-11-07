import {chromium} from '@playwright/test';
import {readFile,writeFile} from 'node:fs/promises';
const filter=process.env.SCENE_BENCH_BACKEND;
const reports=filter?JSON.parse(await readFile('docs/scene-fidelity/performance.json','utf8')).filter((r:{backend:string})=>r.backend!==filter):[];
for(const backend of filter?[filter]:['software','default']){
 const browser=await chromium.launch({channel:'chrome',args:backend==='software'?['--use-angle=swiftshader','--enable-unsafe-swiftshader']:[]});
 try{
  const page=await browser.newPage({viewport:{width:1280,height:720}}),errors:string[]=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400)errors.push(`${r.status()} ${r.url()}`);});
  await page.goto('http://127.0.0.1:5184/tools/scene-fidelity.html');await page.waitForFunction(()=>!!(window as any).__sceneFidelity,null,{timeout:180000});
  const without=await page.evaluate(()=>(window as any).__sceneFidelity.bench('pond-story',8,false));
  const withReflection=await page.evaluate(()=>(window as any).__sceneFidelity.bench('pond-story',8,true));
  const desktop=backend==='default'?{without:await page.evaluate(()=>(window as any).__sceneFidelity.bench('pond-story',48,false,1280,720,4096)),withReflection:await page.evaluate(()=>(window as any).__sceneFidelity.bench('pond-story',48,true,1280,720,4096))}:null;
  reports.push({backend,without,withReflection,desktop,errors});console.log(JSON.stringify(reports.at(-1)));
 }finally{await browser.close();}
}
await writeFile('docs/scene-fidelity/performance.json',JSON.stringify(reports,null,2));
