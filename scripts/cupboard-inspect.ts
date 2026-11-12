import {chromium} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
const dir=process.argv[2]??'docs/cupboard/iteration-1';await mkdir(dir,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:false});
try{const page=await browser.newPage({viewport:{width:1280,height:810}});await page.addInitScript('globalThis.__name=x=>x');const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await page.route('**/api/**',r=>r.abort());await page.goto('http://127.0.0.1:8801/tools/cupboard.html');await page.waitForFunction(()=>!!(window as any).__objectTrial,null,{timeout:120000});
const samples=await page.evaluate(()=>{const x=(window as any).__objectTrial,entry=x.stories.cupboard.segments[1],clips=entry.segment.actorClips.bear.filter((c:any)=>!c.params.ambient&&['open','take','close'].includes(c.verb));return clips.flatMap((c:any)=>[.1,.49,.501,.7,.9].map(u=>({id:c.verb+'-'+u,t:entry.offset+c.start+c.dur*u})));});
const proof=[];
for(const [i,camera] of [{pos:[-14.2,2.7,-8.6],look:[-14.6,2,-11.5],fov:44,location:'house'},{pos:[-12.8,3.8,-14.8],look:[-14.7,1.9,-11.5],fov:43,location:'house'},{pos:[-13.2,3.7,-14.1],look:[-14.6,2,-11.4],fov:42,location:'house'}].entries()){
const png=await page.evaluate(({camera,t})=>{const x=(window as any).__objectTrial;x.player.frozen=true;const f=x.frameAt('cupboard',t);f.camera=camera;x.stage.render(f);return document.querySelector('canvas')!.toDataURL();},{camera,t:samples.find((s:any)=>s.id==='take-0.9')!.t});await writeFile(dir+'/camera-'+i+'.png',Buffer.from(png.split(',')[1],'base64'));}
for(const sample of samples){const r=await page.evaluate(t=>{const x=(window as any).__objectTrial;return{proof:x.inspect('cupboard',t),png:document.querySelector('canvas')!.toDataURL()};},sample.t);await writeFile(dir+'/'+sample.id+'.png',Buffer.from(r.png.split(',')[1],'base64'));proof.push({...sample,...r.proof});}
await writeFile(dir+'/proof.json',JSON.stringify({proof,errors},null,2));console.log(JSON.stringify({errors,samples:proof.map(p=>({id:p.id,pos:p.actor.pos,cupboard:p.cupboard,contacts:p.actor.contacts}))}));if(errors.length)throw Error(errors.join());
}finally{await browser.close();}
