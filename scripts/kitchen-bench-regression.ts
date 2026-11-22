import {chromium} from '@playwright/test';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {sourceFingerprint} from './parallel-interactions-utils';

const routeOnly=process.argv.includes('--route-only'),modes=routeOnly?['after']:['before','after'];
const output=routeOnly?'docs/kitchen-bench/iteration-route-current':'docs/kitchen-bench/regression';await mkdir(output,{recursive:true});
const source=await sourceFingerprint(),baselineRoot=(await readFile('docs/kitchen-bench/baseline-path.txt','utf8')).trim(),baselineSource=await sourceFingerprint(baselineRoot);
const browser=await chromium.launch({channel:'chrome',headless:false,args:['--disable-background-timer-throttling','--disable-renderer-backgrounding','--disable-backgrounding-occluded-windows']});
const snapshots:Record<string,any>={},errors:string[]=[];
try{
 const page=await browser.newPage({viewport:{width:1280,height:810},deviceScaleFactor:1});
 page.on('pageerror',e=>errors.push(e.message));await page.addInitScript('globalThis.__name=x=>x');await page.route('**/api/**',r=>r.abort());
 for(const mode of modes){
  await page.goto(`http://127.0.0.1:${mode==='before'?8822:8821}/tools/kitchen-bench.html?mode=${mode}`);
  await page.waitForFunction(()=>!!(window as any).__kitchenBench,null,{timeout:180000});
  snapshots[mode]=await page.evaluate(async ({mode,routeOnly})=>{
   const x=(window as any).__kitchenBench;x.player.frozen=true;const result:Record<string,any>={info:x.info(),stories:{},shots:[]};
   const fixtureModule='/scripts/interactive-objects-fixtures.ts',fixture=await import(fixtureModule);
   x.stories.childCooking=fixture.textStory(['Masha goes into the kitchen and cooks pancakes.','Masha takes the pancakes.']);
   const selected=new Set(['sleep','hug','carry','open','close','take','cook','fish']);
   for(const id of routeOnly?[]:['regression','entry','cupboard','cozy','fishing','childCooking']){
    await x.prepare(id);const tl=x.stories[id],times=new Set<number>([0,tl.duration]),shots:any[]=[];
    for(const [si,e] of tl.segments.entries()){
     times.add(e.offset);
     for(const actor of ['masha','bear'])for(const [ci,c] of e.segment.actorClips[actor].entries())if(!c.params.ambient){
      for(const k of [.1,.5,.9])times.add(e.offset+c.start+c.dur*k);
      if(selected.has(c.verb)&&!(actor==='masha'&&c.verb==='hug'))shots.push({name:`${mode}-${id}-${si}-${actor}-${ci}-${c.verb}`,t:e.offset+c.start+c.dur*.5,actor,verb:c.verb,...(c.params.putDown&&c.params.item?{putDown:c.params.putDown,item:c.params.item}:{})});
     }
    }
    const frames=[...times].sort((a,b)=>a-b).map(t=>{
     const f=x.render(id,t);return {t,actors:Object.fromEntries(['masha','bear'].map(actor=>{
      const a=f.actors[actor],r=x.stage.rigs[actor];return[actor,{pos:a.pos,yaw:a.yaw,holding:a.holding,posture:a.posture,verb:a.verb,bones:a.bones,hips:a.hipsOffset,riding:a.riding,interaction:a.interaction,root:r.root.position.toArray(),head:r.bones.Head?.matrixWorld.elements.slice(),rightHand:r.bones.RightHand.matrixWorld.elements.slice(),leftHand:r.bones.LeftHand.matrixWorld.elements.slice(),leftFoot:r.bones.LeftFoot.matrixWorld.elements.slice(12,15),rightFoot:r.bones.RightFoot.matrixWorld.elements.slice(12,15),contacts:r.root.userData.contacts??null,carry:r.root.userData.carryContacts??null,hug:r.root.userData.hugContacts??null}];
     })),objects:f.objects,props:Object.fromEntries(['pantry_honey','frying_pan','pancakes','fishing_rod','fish','ball'].map(p=>[p,{owner:f.props[p].attachedTo,visible:f.props[p].visible,pos:x.stage.props.objects[p].position.toArray(),q:x.stage.props.objects[p].quaternion.toArray()}]))};
    });
    for(const s of shots){
     if(s.putDown){const before=x.render(id,s.t-.0001),p=x.stage.props.objects[s.item].position.clone(),rootBefore=x.stage.rigs[s.actor].root.position.toArray();const after=x.render(id,s.t+.0001),q=x.stage.props.objects[s.item].position.clone();s.release={item:s.item,at:s.putDown,jump:p.distanceTo(q),beforeOwner:before.props[s.item].attachedTo,afterOwner:after.props[s.item].attachedTo,beforePosition:p.toArray(),afterPosition:q.toArray(),rootBefore,rootAfter:x.stage.rigs[s.actor].root.position.toArray()};}
     s.proof=x.inspect(id,s.t);s.png=document.querySelector('canvas')!.toDataURL();result.shots.push(s);
    }
    result.stories[id]={duration:tl.duration,frames,physics:x.physics?.inspect(tl,tl.duration)};
    if(id==='childCooking'){
     const layoutModule='/src/shared/houseLayout.ts',{houseCookingSupportHeightAt}=await import(layoutModule);
     result.childCookingSupport=frames.filter(f=>f.actors.masha.verb==='cook').map(f=>{const a=f.actors.masha;return{t:f.t,expectedHeight:houseCookingSupportHeightAt(a.pos[0],a.pos[2]),root:a.root,leftFoot:a.leftFoot,rightFoot:a.rightFoot};});
    }
   }
   if(mode==='after'){
    const three='/node_modules/three/build/three.module.js',layout='/src/shared/houseLayout.ts';
    const THREE=await import(three),{HOUSE_STOVE,HOUSE_PREP_TABLE}=await import(layout);
    await x.prepare('kitchen');const tl=x.stories.kitchen,entry=tl.segments[3],route=[];
    const top=HOUSE_PREP_TABLE,stove=HOUSE_STOVE,v=new THREE.Vector3();
    // Interior of the visible lathed barrel, rather than a radius-.33 proxy.
    const stoveProfile=[[.20,.31],[.23,.35],[.28,.355],[.33,.335],[.47,.325],[.88,.328],[1.07,.35],[1.105,.38],[1.16,.38]];
    const stoveRadius=(y:number)=>{for(let i=1;i<stoveProfile.length;i++){const a=stoveProfile[i-1],b=stoveProfile[i];if(y>=a[0]&&y<=b[0])return a[1]+(b[1]-a[1])*(y-a[0])/(b[0]-a[0]);}return 0;};
    for(const [ci,c] of entry.segment.actorClips.bear.entries())if(['walk_to','run_to','tiptoe_to'].includes(c.verb)&&!c.params.sceneCut){
     const count=Math.max(4,Math.ceil(c.dur/.1));
     for(let index=0;index<=count;index++){
      const k=Math.max(.0001,Math.min(.9999,index/count));
      const t=entry.offset+c.start+c.dur*k,f=x.render('kitchen',t),a=f.actors.bear;
      if(a.pos[0]>-9||a.pos[2]>-9)continue;
      const intersections:{surface:string;point:number[];mesh:string}[]=[];let vertices=0;
      x.stage.rigs.bear.root.traverse((mesh:any)=>{
       if(!mesh.isSkinnedMesh||!mesh.visible||!mesh.geometry.attributes.position)return;
       const count=mesh.geometry.attributes.position.count;
       for(let j=0;j<count;j+=8){mesh.getVertexPosition(j,v);v.applyMatrix4(mesh.matrixWorld);vertices++;
        const sx=v.x-stove[0],sz=v.z-stove[1];
        const inBarrel=Math.hypot(sx,sz)<stoveRadius(v.y)-.003;
        const inFirebox=Math.abs(sx)<.12&&Math.abs(v.y-.69)<.125&&sz>.308&&sz<.352;
        const inStove=inBarrel||inFirebox;
        const inTable=v.y>1.045&&v.y<1.20&&Math.abs(v.x-top.position[0])<top.width/2-.02&&Math.abs(v.z-top.position[1])<top.depth/2-.02;
        if((inStove||inTable)&&intersections.length<20)intersections.push({surface:inStove?'stove barrel':'tabletop',point:v.toArray(),mesh:mesh.name});
       }
      });
      route.push({t,clip:ci,k,pos:a.pos,yaw:a.yaw,vertices,intersections});
      if(index===Math.floor(count/2)||intersections.length&&index%Math.max(1,Math.floor(count/4))===0){result.shots.push({name:`after-kitchen-route-${ci}-${k.toFixed(3)}`,t,actor:'bear',verb:c.verb,proof:x.inspect('kitchen',t),png:document.querySelector('canvas')!.toDataURL()});}
     }
    }
    result.kitchenRoute=route;
   }
   return result;
  },{mode,routeOnly});
  for(const shot of snapshots[mode].shots){await writeFile(`${output}/${shot.name}.png`,Buffer.from(shot.png.split(',')[1],'base64'));delete shot.png;}
  console.log(JSON.stringify({mode,stories:Object.fromEntries(Object.entries(snapshots[mode].stories).map(([k,v]:[string,any])=>[k,{duration:v.duration,samples:v.frames.length,reason:v.physics?.reason}])),routeIntersections:snapshots[mode].kitchenRoute?.filter((s:any)=>s.intersections.length).map((s:any)=>({t:s.t,clip:s.clip,k:s.k,count:s.intersections.length}))}));
 }
 const comparisons=Object.fromEntries((routeOnly?[]:['regression','entry','fishing','cupboard','cozy','childCooking']).map(id=>{
  const a=snapshots.before.stories[id],b=snapshots.after.stories[id],differences:any[]=[];
  if(a.frames.length!==b.frames.length)differences.push({kind:'sample count',before:a.frames.length,after:b.frames.length});
  const visibleState=(f:any)=>({...f,actors:Object.fromEntries(Object.entries(f.actors).map(([id,a]:[string,any])=>{const {contacts,carry,hug,...pose}=a;return[id,pose];})),props:Object.fromEntries(Object.entries(f.props).map(([id,p]:[string,any])=>[id,p.visible?p:{visible:false,owner:p.owner}]))});
  for(let i=0;i<Math.min(a.frames.length,b.frames.length);i++){const af=visibleState(a.frames[i]),bf=visibleState(b.frames[i]);for(const k of ['t','actors','objects','props'])if(JSON.stringify(af[k])!==JSON.stringify(bf[k]))differences.push({t:a.frames[i].t,kind:k});}
  const sequence=(frames:any[],get:(f:any)=>unknown)=>frames.map(get).filter((v,i,all)=>!i||JSON.stringify(v)!==JSON.stringify(all[i-1]));
  const semantic=(frames:any[])=>({actors:Object.fromEntries(['masha','bear'].map(actor=>[actor,{holding:sequence(frames,f=>f.actors[actor].holding),posture:sequence(frames,f=>f.actors[actor].posture)}])),props:Object.fromEntries(Object.keys(frames[0].props).map(prop=>[prop,sequence(frames,f=>[f.props[prop].owner,f.props[prop].visible])]))});
  const semanticBefore=semantic(a.frames),semanticAfter=semantic(b.frames);
  return[id,{samples:a.frames.length,durationBefore:a.duration,durationAfter:b.duration,strictParity:['regression','entry','fishing'].includes(id),differences,semanticMatch:JSON.stringify(semanticBefore)===JSON.stringify(semanticAfter),semanticBefore,semanticAfter}];
 }));
 const report={source,baselineSource,stable:source===await sourceFingerprint(),capturedAt:new Date().toISOString(),comparisons,errors,snapshots};
 const rawDir=routeOnly?'docs/kitchen-bench/iteration-route-current':'docs/kitchen-bench/iteration-regression-current',rawPath=`${rawDir}/proof-full.json`,raw=JSON.stringify(report,null,2);await mkdir(rawDir,{recursive:true});await writeFile(rawPath,raw);
 const compact={source,baselineSource,stable:report.stable,capturedAt:report.capturedAt,raw:{path:rawPath,sha256:createHash('sha256').update(raw).digest('hex')},comparisons,errors,
  info:{before:snapshots.before?.info,after:snapshots.after.info},kitchenRoute:snapshots.after.kitchenRoute,
  childCookingSupport:{before:snapshots.before?.childCookingSupport,after:snapshots.after.childCookingSupport},
  shots:Object.fromEntries(modes.map(mode=>[mode,snapshots[mode].shots.map((s:any)=>({name:s.name,file:`${output}/${s.name}.png`,t:s.t,actor:s.actor,verb:s.verb,release:s.release,camera:s.proof.camera,contacts:s.proof.actors[s.actor]?.contacts,physicsReason:s.proof.physics?.reason}))])),
  comparisonNote:'Exact visible actor/skeleton/hand/foot poses, object states and visible props. Stale contact diagnostic objects and transforms of hidden props are excluded. Kitchen routes/furniture intentionally changed; unchanged yard/door/fishing must match exactly.'};
 await writeFile(`${output}/proof.json`,JSON.stringify(compact,null,2));console.log(JSON.stringify({stable:report.stable,comparisons:Object.fromEntries(Object.entries(comparisons).map(([id,c])=>[id,{samples:c.samples,strictParity:c.strictParity,differences:c.differences.length}])),errors}));
 if(!report.stable)throw Error('Runtime source changed during regression; freeze source and repeat');
 if(errors.length||Object.values(comparisons).some(c=>c.strictParity&&c.differences.length||!c.semanticMatch))throw Error('Unexpected interaction pose or ownership regression; inspect proof.json');
 if(!routeOnly){
  const panReleases=snapshots.after.shots.filter((s:any)=>s.release?.item==='frying_pan');
  if(panReleases.length!==2||panReleases.some((s:any)=>{
   const r=s.release,expectedHeight=s.actor==='masha'?.8:0;
   return r.beforeOwner!==s.actor||r.afterOwner!==null||r.jump>.005||Math.abs(r.rootBefore[1]-expectedHeight)>.01||Math.abs(r.rootAfter[1]-expectedHeight)>.01;
  }))throw Error('Cooking pan release lost physical continuity, ownership or actor support');
 }
 if(snapshots.after.childCookingSupport?.some((s:any)=>Math.abs(s.root[1]-s.expectedHeight)>.01||s.expectedHeight<.79))throw Error('Masha lost the cooking helper support');
 if(snapshots.after.kitchenRoute?.some((s:any)=>s.intersections.length))throw Error('Loaded Bear mesh intersects kitchen furniture during the carrot route; inspect proof.json and route screenshots');
}finally{await browser.close();}
