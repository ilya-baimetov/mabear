import {chromium} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
const prefix=process.argv[2]??'after';
const shots=[
 ['garden-wave',0,2.296,'masha',.45],['garden-wave-side',0,2.296,'masha',1.2],
 ['pancake-clap',2,4.94,'masha',.45],['nap-wave',4,21.42,'masha',.45],
 ['fishing-cast',6,20],['fishing-cast-close',6,20,'bear',.6],
 ['pancake-scene',2,43.852],['garden-scene',0,6.692],
 ...(prefix==='before'?[]:[['interior-kitchen',8,0],['interior-eating',8,0]]),
] as const;
await mkdir('docs/visual-fixes/proof',{recursive:true});
const browser=await chromium.launch({channel:'chrome',args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try{
 const page=await browser.newPage({viewport:{width:1280,height:720}});
 await page.goto('http://127.0.0.1:5173/tools/visual-fixes.html');
 await page.waitForFunction(()=>!!(window as any).__visualFixes,null,{timeout:180000});
 const data=[];
 for(const [name,index,originalT,focus,angle] of shots){
  const t=name==='interior-kitchen'?await page.evaluate(()=>(window as any).__visualFixes.timeFor(8,'bear','cook')):
   name==='interior-eating'?await page.evaluate(()=>(window as any).__visualFixes.timeFor(8,'masha','eat')):
   prefix==='before'||!String(name).startsWith('fishing-')?originalT:await page.evaluate(()=>(window as any).__visualFixes.timeFor(6,'bear','fish'));
  const result=await page.evaluate(([i,t,f,a])=>(window as any).__visualFixes.render(i,t,f,a),[index,t,focus,angle]);
  await writeFile(`docs/visual-fixes/proof/${prefix}-${name}.png`,Buffer.from(result.png.split(',')[1],'base64'));
  data.push({name,index,t,actors:result.actors});console.log(`${prefix}-${name}`);
 }
 await writeFile(`docs/visual-fixes/${prefix}-frames.json`,JSON.stringify(data,null,2));
}finally{await browser.close();}
