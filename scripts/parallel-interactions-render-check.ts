import {sourceFingerprint} from './parallel-interactions-utils';
import {chromium} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
const output='docs/parallel-interactions/render-check';await mkdir(output,{recursive:true});
const source=await sourceFingerprint();
const browser=await chromium.launch({channel:'chrome',headless:false,args:['--disable-background-timer-throttling','--disable-renderer-backgrounding','--disable-backgrounding-occluded-windows']});
try{
 const page=await browser.newPage({viewport:{width:1280,height:810}}),errors:string[]=[];
 page.on('pageerror',e=>errors.push(e.message));await page.addInitScript('globalThis.__name=x=>x');await page.route('**/api/**',r=>r.abort());
 await page.goto('http://127.0.0.1:8811/tools/parallel-interactions.html?mode=after');await page.waitForFunction(()=>!!(window as any).__parallelTrial,null,{timeout:180000});
 const result=await page.evaluate(()=>{
  const x=(window as any).__parallelTrial,results:Record<string,unknown>={};
  for(const id of ['continuity','carrots','carrotsRu','cupboard','entry','regression','cozy']){
   const tl=x.stories[id],times=new Set<number>([0,tl.duration]);
   for(const e of tl.segments){times.add(e.offset);for(const actor of ['masha','bear'])for(const c of e.segment.actorClips[actor])if(!c.params.ambient)for(const k of [0,.25,.55,.75,1])times.add(Math.min(tl.duration,e.offset+c.start+c.dur*k));}
   const boundaryRootJumps:any[]=[];for(const e of tl.segments)for(const c of e.segment.actorClips.masha.filter((c:any)=>!c.params.ambient))for(const at of [e.offset+c.start,e.offset+c.start+c.dur])if(at>.001&&at<tl.duration-.001){const a=x.frameAt(id,at-.001).actors.masha.pos,b=x.frameAt(id,at+.001).actors.masha.pos;boundaryRootJumps.push({t:at,jump:Math.hypot(...a.map((v:number,i:number)=>v-b[i]))});}
   const initialProps=id==='carrots'?x.inspect(id,0).props:null;const changedUntouchedCarrots:any[]=[];
   const transferChecks:any[]=[];
   if(['continuity','carrots'].includes(id)){
    const prop=id==='continuity'?'ball':'carrot_2';let previous=x.frameAt(id,0).props[prop].attachedTo;
    for(let t=1/120;t<tl.duration;t+=1/120){const owner=x.frameAt(id,t).props[prop].attachedTo;if(owner!==previous){let lo=t-1/120,hi=t;for(let k=0;k<16;k++){const mid=(lo+hi)/2;if(x.frameAt(id,mid).props[prop].attachedTo===previous)lo=mid;else hi=mid;}const a=x.inspect(id,hi-.001),b=x.inspect(id,hi+.001),p=a.props[prop].worldPos,q=b.props[prop].worldPos;transferChecks.push({t:hi,from:previous,to:owner,prop,worldPositionJump:Math.hypot(...p.map((v:number,i:number)=>v-q[i])),before:p,after:q,beforeContact:a.actors.masha.contacts,afterContact:b.actors.masha.contacts});previous=owner;}}
   }
   const ordered=[...times].sort((a,b)=>a-b),snapshots=new Map<number,string>();let maxJump=0,minFoot=Infinity;
   const frames=ordered.map(t=>{const f=x.frameAt(id,t);snapshots.set(t,JSON.stringify(f));x.stage.render(f);if(initialProps)for(const prop of Object.keys(initialProps).filter(k=>k.startsWith('carrot')&&k!=='carrot_2')){const mesh=x.stage.props.objects[prop],original=initialProps[prop];if(mesh.visible!==original.visible||JSON.stringify(mesh.position.toArray())!==JSON.stringify(original.worldPos)||JSON.stringify(mesh.quaternion.toArray())!==JSON.stringify(original.worldRotation))changedUntouchedCarrots.push({t,prop});}return structuredClone({t,actor:f.actors.masha,objects:f.objects,props:Object.fromEntries(Object.entries(f.props).filter(([k])=>k==='ball'||k.startsWith('carrot')||k==='pantry_honey')),physics:x.physics?.inspect(tl,t)??null,contacts:x.stage.rigs.masha.root.userData.contacts??null,source:x.stage.rigs.masha.root.userData.sourceContacts??null});});
   const seekMismatches=ordered.slice().reverse().filter(t=>JSON.stringify(x.frameAt(id,t))!==snapshots.get(t));
   let previous:any=null;for(let t=0;t<tl.duration;t+=1/30){const f=x.frameAt(id,t),pos=f.actors.masha.pos;if(previous)maxJump=Math.max(maxJump,Math.hypot(...pos.map((v:number,i:number)=>v-previous[i])));previous=pos;minFoot=Math.min(minFoot,pos[1]);}
   results[id]={duration:tl.duration,seekMismatches,maxJumpAt30Hz:maxJump,minFoot,transferChecks,boundaryRootJumps,changedUntouchedCarrots,frames};
   if(changedUntouchedCarrots.length)throw Error(`${id}: another carrot moved`);
   if(seekMismatches.length)throw Error(`${id}: order-dependent frames at ${seekMismatches.join(',')}`);
  }
  return results;
 });
 await writeFile(`${output}/proof.json`,JSON.stringify({source,stable:source===await sourceFingerprint(),capturedAt:new Date().toISOString(),info:await page.evaluate(()=>(window as any).__parallelTrial.info()),results:result,errors},null,2));
 if(errors.length)throw Error(errors.join('\n'));console.log(JSON.stringify(Object.fromEntries(Object.entries(result).map(([id,v]:[string,any])=>[id,{duration:v.duration,samples:v.frames.length,seekMismatches:v.seekMismatches.length,maxJumpAt30Hz:v.maxJumpAt30Hz,minFoot:v.minFoot,transferJumps:v.transferChecks.map((x:any)=>x.worldPositionJump),maxBoundaryRootJump:Math.max(0,...v.boundaryRootJumps.map((x:any)=>x.jump)),changedUntouchedCarrots:v.changedUntouchedCarrots.length}]))));
}finally{await browser.close();}
