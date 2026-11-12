import {chromium} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
const out='docs/staging-interactions/cooking-probes';
await mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:false});
try{
 const page=await browser.newPage({viewport:{width:1280,height:768}}),errors:string[]=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript('globalThis.__name=(value)=>value');
 await page.goto('http://127.0.0.1:8797/tools/staging-interactions.html');
 await page.waitForFunction(()=>!!(window as any).__stagingInteractions,null,{timeout:90000});
 const result=await page.evaluate(async()=>{
  // @ts-ignore Diagnostic URL served by Vite, not a production import.
  const T=await import('/node_modules/three/build/three.module.js');
  const api=(window as any).__stagingInteractions,s=api.stage,info=api.info();
  const clip=info.clips.find((c:any)=>c.story==='pancake_morning'&&c.actor==='masha'&&c.verb==='cook');
  const departure=info.clips.find((c:any)=>c.story==='pancake_morning'&&c.actor==='masha'&&c.start>clip.start&&c.params.to&&c.params.item==='frying_pan');
  if(!departure)throw new Error('Missing supported cooking departure');
  const checks:any[]=[],collisions:any[]=[];
  for(let t=clip.start-3;t<departure.start+departure.dur+.1;t+=.1){
   const f=api.inspect('pancake_morning',t),a=f.actors.masha;
   if(a.holding!=='frying_pan')continue;
   const b=new T.Box3().setFromObject(s.props.objects.frying_pan),x=Math.max(b.min.x,Math.min(2,b.max.x)),z=Math.max(b.min.z,Math.min(1.5,b.max.z));
   const overlap=Math.hypot(x-2,z-1.5)<.75&&b.min.y<.78&&b.max.y>.71;
   const rig=s.rigs.masha,row={t,verb:a.verb,root:rig.root.position.toArray(),panBottom:b.min.y,panTop:b.max.y,overlap,feet:['LeftFoot','RightFoot'].map(n=>rig.bones[n].getWorldPosition(rig.root.position.clone()).toArray())};
   checks.push(row);if(overlap)collisions.push(row);
   if(checks.length%10===0)await new Promise(requestAnimationFrame);
  }
  const actual=api.render('pancake_morning',clip.start+.7).png;
  api.inspect('pancake_morning',clip.start+2);
  s.camera.position.set(-1.2,1.8,3.0);s.camera.lookAt(1.4,1,.8);s.renderer.render(s.scene,s.camera);
  const diagnostic=s.renderer.domElement.toDataURL(),cook=checks.filter(r=>r.verb==='cook');
  return{speechTiming:info.speechTiming,renderer:info.renderer,clip,departure,checks,collisions,minCookingPanBottom:Math.min(...cook.map(r=>r.panBottom)),actual,diagnostic};
 });
 for(const key of ['actual','diagnostic'] as const){await writeFile(`${out}/final-${key}.png`,Buffer.from(result[key].split(',')[1],'base64'));delete (result as any)[key];}
 await writeFile(`${out}/final-clearance.json`,JSON.stringify({...result,errors},null,2));
 if(errors.length||result.collisions.length||result.minCookingPanBottom<.80)throw new Error('Cooking staging did not clear the tabletop');
 console.log(JSON.stringify({samples:result.checks.length,tableIntersections:result.collisions.length,minPanBottom:result.minCookingPanBottom,renderer:result.renderer,errors}));
}finally{await browser.close();}
