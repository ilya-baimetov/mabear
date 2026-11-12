import {chromium} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
const output='docs/cupboard/render-check';await mkdir(output,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:false});
try{
 const errors:string[]=[],page=await browser.newPage({viewport:{width:1280,height:810}});
 page.on('pageerror',e=>errors.push(e.message));await page.addInitScript('globalThis.__name=x=>x');await page.route('**/api/**',r=>r.abort());
 const observations:Record<string,any>={};
 for(const mode of ['before','after']){
  await page.goto(`http://127.0.0.1:${mode==='before'?8804:8801}/tools/cupboard.html?mode=${mode==='before'?'baseline':'after'}`);await page.waitForFunction(()=>!!(window as any).__objectTrial,null,{timeout:180000});
  const cases=await page.evaluate(()=>{const x=(window as any).__objectTrial;return ['cozy','regression'].flatMap(id=>{
   const wanted=id==='cozy'?['cook','sit','hug']:['sleep','hug','carry'];
   return wanted.flatMap(verb=>{for(const e of x.stories[id].segments){for(const actor of ['bear','masha']){const c=e.segment.actorClips[actor].find((c:any)=>c.verb===verb&&!c.params.ambient);if(c)return[{id,verb,t:e.offset+c.start+c.dur*.55}];}}return [];});
  });});
  const samples=[];
  for(const c of cases){const r=await page.evaluate(({id,t})=>{const x=(window as any).__objectTrial,f=x.frameAt(id,t);x.render(id,t);return{actors:f.actors,camera:f.camera,props:Object.fromEntries(Object.entries(f.props).filter(([id])=>id!=='pantry_honey')),bearContacts:x.stage.rigs.bear.root.userData.contacts,png:document.querySelector('canvas')!.toDataURL()};},c);await writeFile(`${output}/${mode}-${c.id}-${c.verb}.png`,Buffer.from(r.png.split(',')[1],'base64'));const {png,...data}=r;samples.push({...c,...data});}
  observations[mode]=samples;
 }
 if(JSON.stringify(observations.before)!==JSON.stringify(observations.after))throw Error('Existing interaction poses, props, contacts or camera changed');
 const behavior=await page.evaluate(()=>{
  const x=(window as any).__objectTrial,tl=x.stories.cupboard,e=tl.segments[1],take=e.segment.actorClips.bear.find((c:any)=>c.verb==='take'),at=e.offset+take.start+take.dur*.5,end=e.offset+take.start+take.dur;
  const sample=(t:number)=>{const f=x.inspect('cupboard',t);return{t,jar:f.cupboard.jar,open:f.cupboard.open,contact:f.cupboard.contact,owner:f.props.pantry_honey.attachedTo,actorContacts:f.actor.contacts};};
  const near=[sample(at-.0001),sample(at+.0001),sample(end-.0001),sample(end+.0001)];
  const sweep=[];for(let t=e.offset;t<e.offset+e.segment.duration;t+=1/30)sweep.push(sample(t));
  const target=e.offset+take.start+take.dur*.72,first=sample(target);sample(tl.duration);sample(0);const repeated=sample(target);
  const last=tl.segments[2],wave=last.segment.actorClips.bear.find((c:any)=>c.verb==='wave'),gesture=[sample(last.offset+wave.start+.001),sample(last.offset+wave.start+wave.dur*.5)];
  const others=['russian','implicit','empty'].map(id=>{const result=x.inspect(id,x.stories[id].duration);return{id,objects:result.objects,owner:result.props.pantry_honey.attachedTo,jar:result.cupboard.jar,contact:result.actor.contacts};});
  return{near,sweep,first,repeated,others,gesture};
 });
 const distance=(a:number[],b:number[])=>Math.hypot(...a.map((x,i)=>x-b[i]));
 const acquisitionJump=distance(behavior.near[0].jar,behavior.near[1].jar),carryJump=distance(behavior.near[2].jar,behavior.near[3].jar);
 if(acquisitionJump>.01||carryJump>.015)throw Error(`Visible jar snap: ${acquisitionJump}/${carryJump}`);
 if(JSON.stringify(behavior.first)!==JSON.stringify(behavior.repeated))throw Error('Rendered contact depends on seek history');
 const contactGaps=behavior.sweep.filter(p=>p.contact?.strength===1).map(p=>p.contact.gap),maxContactGap=Math.max(...contactGaps);
 if(maxContactGap>.045)throw Error(`Paw misses cupboard: ${maxContactGap}`);
 if(behavior.others.some(p=>p.owner!=='bear'))throw Error('Actual alternative story lost jar');
 if(distance(behavior.gesture[0].jar,behavior.gesture[1].jar)<.12)throw Error('Carrying the jar suppressed the subsequent waving gesture');
 await writeFile(`${output}/proof.json`,JSON.stringify({regressionsIdentical:true,observations,acquisitionJump,carryJump,maxContactGap,behavior,errors},null,2));
 if(errors.length)throw Error(errors.join());console.log(JSON.stringify({regressions:observations.after.map((s:any)=>s.id+':'+s.verb),acquisitionJump,carryJump,maxContactGap,errors}));
}finally{await browser.close();}
