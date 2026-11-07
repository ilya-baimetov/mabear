import {chromium} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
const out=process.env.ANIMATION_PROOF_DIR??'docs/animation-story-release/proof';
await mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',args:process.env.ANIMATION_PROOF_BACKEND==='software'?['--use-angle=swiftshader','--enable-unsafe-swiftshader']:[]});
try{
 const page=await browser.newPage({viewport:{width:1280,height:784}});const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript('globalThis.__name=(value)=>value');
 await page.goto(`${process.env.ANIMATION_PROOF_URL??'http://127.0.0.1:5185'}/tools/animation-story-proof.html`);
 await page.waitForFunction(()=>!!(window as any).__animationStories,null,{timeout:180000});
 const clips=await page.evaluate(()=>(window as any).__animationStories.clips);
 const chosen=clips.filter((c:any)=>c.putDown||['eat','clap','sit','stand_up','surprised','fish','cook','carry','jump','dance','laugh'].includes(c.verb));
 const results=[];
 for(let i=0;i<chosen.length;i++){
  const c=chosen[i],time=c.start+(c.verb==='clap'?Math.min(.3,c.dur*.5):c.dur*.5);
  const result=await page.evaluate(({c,time})=>(window as any).__animationStories.render(c.story,time),{c,time});
  const {png,...meta}=result;results.push(meta);
  await writeFile(`${out}/${String(i).padStart(2,'0')}-${c.story}-${c.actor}-${c.verb}.png`,Buffer.from(png.split(',')[1],'base64'));
  {
   const detail=await page.evaluate(({c,time})=>(window as any).__animationStories.render(c.story,time,c.actor),{c,time});
   await writeFile(`${out}/${String(i).padStart(2,'0')}-${c.story}-${c.actor}-${c.verb}-detail.png`,Buffer.from(detail.png.split(',')[1],'base64'));
   if(c.actor==='masha'&&c.verb==='stand_up')for(const [phase,offset] of [['start',.02],['end',c.dur-.02]] as const){
    const edge=await page.evaluate(({c,time})=>(window as any).__animationStories.render(c.story,time,c.actor),{c,time:c.start+offset});
    await writeFile(`${out}/${String(i).padStart(2,'0')}-${c.story}-${c.actor}-${c.verb}-${phase}-detail.png`,Buffer.from(edge.png.split(',')[1],'base64'));
   }
   if(c.putDown&&(c.actor==='hare'||c.actor==='squirrel'))for(const phase of [.3,.5,.7]){
    const png=await page.evaluate(({c,time})=>(window as any).__animationStories.groundDiagnostic(c.story,time,c.actor),{c,time:c.start+c.dur*phase});
    await writeFile(`${out}/${c.actor}-release-${phase}-side-diagnostic.png`,Buffer.from(png.split(',')[1],'base64'));
   }
  }
 }
 const sweeps=await page.evaluate(async()=>{
  const api=(window as any).__animationStories,results=[];
  for(const [story,tl] of Object.entries(api.timelines) as [string,any][]){let finite=true;const errors:{t:number;id:string;key:string;error:number;verb:string;strength:number}[]=[],transitionResiduals:typeof errors=[];let samples=0;
   for(let t=0;t<tl.duration;t+=.75){const r=api.diagnostics(story,t);samples++;for(const [id,a] of Object.entries(r.actors) as [string,any][]){if(!a.finite)finite=false;for(const key of ['reachError','primaryReachError','secondaryReachError']){const e=a.contacts?.[key],strength=a.contacts?.strength??1;if(e>.003)(strength<.98?transitionResiduals:errors).push({t,id,key,error:e,verb:a.verb,strength});}}if(samples%10===0)await new Promise(requestAnimationFrame);}
   results.push({story,duration:tl.duration,samples,finite,contactErrors:errors,transitionResiduals});
  }return results;
 });
 const seekChecks=await page.evaluate(()=>{
  const api=(window as any).__animationStories;
  return api.sections.map((section:any)=>{
   api.diagnostics(section.story,section.time);const first=api.rigSignature(section.actor);
   api.diagnostics('masha_contacts',0);api.diagnostics('cozy_evening',17);api.diagnostics(section.story,section.time);
   const restored=api.rigSignature(section.actor);
   return{story:section.story,actor:section.actor,time:section.time,first,restored,match:first.hash===restored.hash};
  });
 });
 const contactChecks=await page.evaluate(()=>{
  const api=(window as any).__animationStories,checks=[];
  for(const clip of api.clips.filter((c:any)=>c.verb==='clap')){
   const frame=api.diagnostics(clip.story,clip.start+Math.min(.3,clip.dur*.5)),a=frame.actors[clip.actor],m=a?.contacts;
   checks.push({story:clip.story,actor:clip.actor,time:clip.start+.3,holding:a?.holding,mode:m?.mode??null,surfaceGap:m?.surfaceGap??null,palmError:m?.palmSeparation===undefined?null:Math.abs(m.palmSeparation-m.targetSeparation),reachError:m?.reachError??null});
  }return checks;
 });
 const stageInfo=await page.evaluate(()=>{const s=(window as any).__animationStories.stage,g=s.renderer.getContext(),ext=g.getExtension('WEBGL_debug_renderer_info');return{assets:s.assets(),renderer:String(g.getParameter(ext?ext.UNMASKED_RENDERER_WEBGL:g.RENDERER)),post:s.postQuality(),buffer:[s.renderer.domElement.width,s.renderer.domElement.height]};});
 const releaseChecks=await page.evaluate(()=>{
  const api=(window as any).__animationStories,s=api.stage,checks=[];
  for(const clip of api.clips.filter((c:any)=>c.putDown&&c.item)){
   const samples=[-.0001,.0001].map(dt=>{
    const meta=api.diagnostics(clip.story,clip.start+clip.dur*.5+dt),rig=s.rigs[clip.actor],object=s.props.objects[clip.item],v=rig.root.position.clone();
    return{holding:meta.actors[clip.actor].holding,object:object.getWorldPosition(v.clone()).toArray(),rotation:object.getWorldQuaternion(rig.root.quaternion.clone()).toArray(),hand:rig.bones.RightHand.getWorldPosition(v.clone()).toArray(),contacts:{...rig.root.userData.contacts}};
   });
   const distance=(key:'object'|'hand')=>Math.hypot(...samples[0][key].map((v:number,i:number)=>v-samples[1][key][i]));
   checks.push({story:clip.story,actor:clip.actor,item:clip.item,samples,propJump:distance('object'),handJump:distance('hand')});
  }return checks;
 });
 await writeFile(`${out}/story-checks.json`,JSON.stringify({stageInfo,clips,results,sweeps,seekChecks,contactChecks,releaseChecks,errors},null,2));
 if(process.env.ANIMATION_PROOF_RECORD!=='0'){
  const recording=await page.evaluate(async()=>{const r=await (window as any).__animationStories.record(),bytes=new Uint8Array(await r.blob.arrayBuffer());let data='';for(let i=0;i<bytes.length;i+=32768)data+=String.fromCharCode(...bytes.subarray(i,i+32768));return{base64:btoa(data),mime:r.blob.type,frames:r.frames,maxGapMs:r.maxGapMs,sections:r.sections};});
  const{base64,...meta}=recording;const ext=meta.mime.includes('mp4')?'mp4':'webm';await writeFile(`${out}/actual-story-animation.${ext}`,Buffer.from(base64,'base64'));await writeFile(`${out}/recording.json`,JSON.stringify(meta,null,2));console.log(JSON.stringify(meta));
  if(process.env.ANIMATION_PROOF_FACES==='1'){
   const r=await page.evaluate(async()=>{const r=await (window as any).__animationStories.record(true),bytes=new Uint8Array(await r.blob.arrayBuffer());let data='';for(let i=0;i<bytes.length;i+=32768)data+=String.fromCharCode(...bytes.subarray(i,i+32768));return{base64:btoa(data),mime:r.blob.type,frames:r.frames,maxGapMs:r.maxGapMs,sections:r.sections};});
   const{base64,...meta}=r;await writeFile(`${out}/diagnostic-story-faces.${meta.mime.includes('mp4')?'mp4':'webm'}`,Buffer.from(base64,'base64'));await writeFile(`${out}/face-recording.json`,JSON.stringify(meta,null,2));console.log(JSON.stringify(meta));
  }
 }
 console.log(JSON.stringify({captures:results.length,sweeps,seekChecks,errors}));if(errors.length)throw new Error(errors.join('\n'));
 if(seekChecks.some((c:any)=>!c.match||!c.first.finite||!c.restored.finite))throw new Error('Rig geometry was nonfinite or changed after seek restoration');
 if(releaseChecks.some((c:any)=>c.propJump>.003||c.handJump>.003))throw new Error('Prop or hand jumped at the ownership release boundary');
}finally{await browser.close();}
