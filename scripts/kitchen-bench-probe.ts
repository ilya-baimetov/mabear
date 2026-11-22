import {chromium} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
import {sourceFingerprint} from './parallel-interactions-utils';
const output=process.argv[2]??'docs/kitchen-bench/iteration-1',ids=(process.argv[3]??'kitchen,bench,live-ball-en,live-ball-ru').split(',');
await mkdir(output,{recursive:true});const source=await sourceFingerprint();
const browser=await chromium.launch({channel:'chrome',headless:false,args:['--disable-background-timer-throttling','--disable-renderer-backgrounding','--disable-backgrounding-occluded-windows']});
try{
 const page=await browser.newPage({viewport:{width:1280,height:810},deviceScaleFactor:1}),errors:string[]=[];
 page.on('pageerror',e=>errors.push(e.message));await page.addInitScript('globalThis.__name=x=>x');await page.route('**/api/**',r=>r.abort());
 await page.goto('http://127.0.0.1:8821/tools/kitchen-bench.html?mode=after');await page.waitForFunction(()=>!!(window as any).__kitchenBench,null,{timeout:180000});
 const result=await page.evaluate(async ids=>{
  const x=(window as any).__kitchenBench;x.player.frozen=true;const stories:any[]=[];
  for(const id of ids){await x.prepare(id);const tl=x.stories[id],shots:any[]=[],contacts:any[]=[];
   for(const [eidx,e] of tl.segments.entries())for(const actor of ['masha','bear'])for(const c of e.segment.actorClips[actor].filter((c:any)=>!c.params.ambient&&['take','put_down','drop','nudge','cook','enter','exit'].includes(c.verb))){
    const t=e.offset+c.start+c.dur*.5,points:any[]=[];
    for(const at of [t-.0001,t+.0001]){const f=x.inspect(id,at);points.push(f);}
    const item=c.params.item??c.params.pickUpAt?.item??c.params.putDown?.item??(c.verb==='nudge'?'ball':null);
    const jump=item&&points[0].props[item]&&points[1].props[item]?Math.hypot(...points[0].props[item].worldPos.map((v:number,i:number)=>v-points[1].props[item].worldPos[i])):null;
    contacts.push({actor,verb:c.verb,item,t,params:c.params,jump,points});
    for(const f of [.25,.5,.7]){const at=e.offset+c.start+c.dur*f,proof=x.inspect(id,at);shots.push({name:`${id}-${eidx}-${actor}-${c.verb}-${f}`,t:at,proof,png:document.querySelector('canvas')!.toDataURL()});}
   }
   const samples=[];for(let t=0;t<=tl.duration;t+=.2){const f=x.frameAt(id,t);samples.push({t,masha:f.actors.masha.pos,holding:f.actors.masha.holding,ball:f.props.ball});}
   stories.push({id,timeline:tl,physics:x.physics?.inspect(tl,tl.duration),contacts,samples,shots,end:x.inspect(id,tl.duration-.001)});
  }return{info:x.info(),stories};
 },ids);
 for(const s of result.stories)for(const shot of s.shots){await writeFile(`${output}/${shot.name}.png`,Buffer.from(shot.png.split(',')[1],'base64'));delete shot.png;}
 const report={source,stable:source===await sourceFingerprint(),capturedAt:new Date().toISOString(),errors,...result};await writeFile(`${output}/proof.json`,JSON.stringify(report,null,2));
 console.log(JSON.stringify({stable:report.stable,errors,info:result.info,stories:result.stories.map(s=>({id:s.id,duration:s.timeline.duration,physics:s.physics,contacts:s.contacts.map((c:any)=>({actor:c.actor,verb:c.verb,item:c.item,t:c.t,jump:c.jump,contact:c.points[0].actors[c.actor].contacts,source:c.points[0].actors[c.actor].source}))}))},null,2));
 if(!report.stable||errors.length)throw Error('Native contact source changed or browser errors occurred');
 for(const s of result.stories){
  if(['bench','benchRu','live-ball-en','live-ball-ru'].includes(s.id)&&(!s.physics||s.physics.reason||s.physics.preparing))throw Error(`${s.id}: expected completed physics, not authored fallback`);
  for(const c of s.contacts){
   const mark=c.params.pickUpAt??c.params.putDown;
   if(!['kitchen_bowl','kitchen_pot'].includes(mark)&&!(c.item==='ball'&&mark==='bench'))continue;
   if(c.jump===null||c.jump>.005)throw Error(`${s.id}: ${c.actor} ${c.verb} has a visible ownership handoff displacement (${c.jump}m)`);
   const owners=c.points.map((p:any)=>p.props[c.item].attachedTo);
   if(c.verb==='take'&&(owners[0]!==null||owners[1]!==c.actor)||c.verb==='put_down'&&(owners[0]!==c.actor||owners[1]!==null))throw Error(`${s.id}: incorrect ownership transfer at ${mark}`);
  }
  if(['kitchen','kitchenRu'].includes(s.id)&&s.timeline.segments.at(-1).segment.endState.props.carrot_2.at!=='kitchen_pot')throw Error(`${s.id}: the original carrot did not reach the pot`);
  if(['bench','benchRu'].includes(s.id)&&s.end.props.ball.attachedTo!=='masha')throw Error(`${s.id}: Masha did not retrieve the settled ball`);
 }
}finally{await browser.close();}
