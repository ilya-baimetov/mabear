import {chromium} from '@playwright/test';
import {writeFile,mkdir} from 'node:fs/promises';
const browser=await chromium.launch({channel:'chrome',headless:false,args:['--disable-background-timer-throttling','--disable-renderer-backgrounding','--disable-backgrounding-occluded-windows']});
try{
 const page=await browser.newPage({viewport:{width:1280,height:800},deviceScaleFactor:1});
 page.on('pageerror',e=>console.log('PAGEERROR',e.message));
 await page.goto('http://127.0.0.1:8801/tools/rapier-trial.html');await page.waitForFunction(()=>!!(window as any).__rapierTrial,null,{timeout:120000});
 const info=await page.evaluate(()=>(window as any).__rapierTrial.info());console.log(JSON.stringify(info));
 await mkdir('docs/rapier-trial/working',{recursive:true});
 for(const [id,times] of Object.entries({obstacle:[0,1,2,3,4,6,8],drop:[0,1.99,2,2.1,2.2,2.35,2.5,2.8,3,4,5,8,12]})){
  const samples=[];for(const t of times){const data=await page.evaluate(({id,t})=>{const x=(window as any).__rapierTrial;const sample=x.inspect(id,t);return{sample,png:document.querySelector('canvas')!.toDataURL()};},{id,t});samples.push(data.sample);if([2,3,5,8].includes(t))await writeFile(`docs/rapier-trial/working/${id}-${t}.png`,Buffer.from(data.png.split(',')[1],'base64'));}
  await writeFile(`docs/rapier-trial/working/${id}.json`,JSON.stringify(samples,null,2));console.log(JSON.stringify({id,samples:samples.map((s:any)=>({t:s.t,pos:s.actor.pos,ball:s.ball.centre,reason:s.physics?.reason,sleep:s.physics?.sleeping}))}));
 }
}finally{await browser.close();}
