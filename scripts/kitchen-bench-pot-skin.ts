import {chromium} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {sourceFingerprint} from './parallel-interactions-utils';
const output='docs/kitchen-bench/iteration-pot-skin',assertClear=process.argv.includes('--assert-clear'),errors:string[]=[];await mkdir(output,{recursive:true});const source=await sourceFingerprint();
const browser=await chromium.launch({channel:'chrome',headless:false,args:['--disable-background-timer-throttling','--disable-renderer-backgrounding','--disable-backgrounding-occluded-windows']});
try{
 const page=await browser.newPage({viewport:{width:1280,height:810},deviceScaleFactor:1});page.on('pageerror',e=>errors.push(e.message));await page.addInitScript('globalThis.__name=x=>x');await page.route('**/api/**',r=>r.abort());
 await page.goto('http://127.0.0.1:8821/tools/kitchen-bench.html?mode=after');await page.waitForFunction(()=>!!(window as any).__kitchenBench,null,{timeout:180000});
 const result=await page.evaluate(async()=>{
  const x=(window as any).__kitchenBench;x.player.frozen=true;await x.prepare('kitchen');x.render('kitchen',52);
  const module='/node_modules/three/build/three.module.js',T=await import(module),v=new T.Vector3(),local=new T.Vector3();
  const kitchen=x.stage.scene.getObjectByName('set:house:kitchen'),pot=x.stage.scene.getObjectByName('Open enamel cooking pot'),kInv=kitchen.matrixWorld.clone().invert(),pInv=pot.matrixWorld.clone().invert();
  const profile=[[0,0],[.32,0],[.385,.025],[.414,.075],[.418,.45],[.43,.47],[.43,.49],[.398,.49],[.394,.075],[.35,.045],[0,.045]],outline=[[-5.264,-3.010],[-4.036,-3.482],[-3.552,-3.435],[-2.643,-2.156],[-3.280,-1.690],[-3.965,-2.662],[-4.979,-2.272]];
  const inside=(x:number,y:number,p:number[][])=>{let b=false;for(let i=0,j=p.length-1;i<p.length;j=i++){const a=p[i],c=p[j];if((a[1]>y)!==(c[1]>y)&&x<(c[0]-a[0])*(y-a[1])/(c[1]-a[1])+a[0])b=!b;}return b;};
  const worldScale=pot.getWorldScale(new T.Vector3()),worldProfile=profile.map(([r,y])=>[r*worldScale.x,y*worldScale.y]);
  const edgeDistance=(x:number,y:number,p:number[][])=>{let best=Infinity;for(let i=0;i<p.length;i++){const a=p[i],b=p[(i+1)%p.length],dx=b[0]-a[0],dy=b[1]-a[1],k=Math.max(0,Math.min(1,((x-a[0])*dx+(y-a[1])*dy)/(dx*dx+dy*dy)));best=Math.min(best,Math.hypot(x-a[0]-dx*k,y-a[1]-dy*k));}return best;};
  const cabinets:any[]=[];kitchen.traverse((o:any)=>{if(o.isMesh&&o.name.startsWith('Cabinet ')&&!o.name.includes('knob')){o.geometry.computeBoundingBox();cabinets.push({name:o.name,world:new T.Box3().setFromObject(o),local:o.geometry.boundingBox.clone().expandByScalar(-.004),inv:o.matrixWorld.clone().invert()});}});
  const tl=x.stories.kitchen,potClip=tl.segments.flatMap((e:any)=>e.segment.actorClips.bear.map((c:any)=>({...c,time:e.offset+c.start}))).find((c:any)=>c.params.putDown==='kitchen_pot');
  if(!potClip)throw Error('Missing actual pot deposit');
  const from=Math.floor((potClip.time-1.1)*20)/20,shotTimes=[potClip.time-.05,potClip.time+.1*potClip.dur,potClip.time+.5*potClip.dur,potClip.time+.85*potClip.dur,tl.duration-.05];
  const frames:any[]=[],shots:any[]=[];
  const sampleTimes:number[]=[];for(let t=from;t<=tl.duration;t+=.05)sampleTimes.push(t);
  for(const boundary of [potClip.time,potClip.time+potClip.dur*.5,potClip.time+potClip.dur])sampleTimes.push(boundary-.0001,boundary+.0001);
  sampleTimes.push(tl.duration-.00001);
  for(const t of [...new Set(sampleTimes)].filter(t=>t>=from&&t<=tl.duration).sort((a,b)=>a-b)){
   const f=x.render('kitchen',t),counts:Record<string,number>={},bones:Record<string,Record<string,number>>={},potDepthMmByBone:Record<string,number>={},examples:any[]=[];let vertices=0,maxPotDepthMm=0;
   x.stage.rigs.bear.root.traverse((mesh:any)=>{
    if(!mesh.isSkinnedMesh||!mesh.visible)return;const a=mesh.geometry.attributes;
    for(let j=0;j<a.position.count;j+=8){
     mesh.getVertexPosition(j,v);v.applyMatrix4(mesh.matrixWorld);vertices++;const kinds:string[]=[];let potDepthMm=0;
     local.copy(v).applyMatrix4(pInv);if(inside(Math.hypot(local.x,local.z),local.y,profile)){kinds.push('pot wall/base');potDepthMm=1000*edgeDistance(Math.hypot(local.x,local.z)*worldScale.x,local.y*worldScale.y,worldProfile);maxPotDepthMm=Math.max(maxPotDepthMm,potDepthMm);}
     local.copy(v).applyMatrix4(kInv);if(local.y>1.228&&local.y<1.312&&inside(local.x,local.z,outline))kinds.push('counter worktop');
     for(const cabinet of cabinets)if(cabinet.world.containsPoint(v)&&cabinet.local.containsPoint(local.copy(v).applyMatrix4(cabinet.inv))){kinds.push(cabinet.name);break;}
     if(!kinds.length)continue;let weight=-1,bone='unknown';for(let k=0;k<4;k++){const w=a.skinWeight.getComponent(j,k);if(w>weight){weight=w;bone=mesh.skeleton.bones[a.skinIndex.getComponent(j,k)]?.name??'unknown';}}
     for(const kind of kinds){counts[kind]=(counts[kind]??0)+1;(bones[kind]??={})[bone]=((bones[kind]??{})[bone]??0)+1;}
     if(potDepthMm)potDepthMmByBone[bone]=Math.max(potDepthMmByBone[bone]??0,potDepthMm);
     if(examples.length<12)examples.push({point:v.toArray(),bone,kinds,potDepthMm});
    }
   });
   const contacts=structuredClone(x.stage.rigs.bear.root.userData.contacts??{});
   const contactDistance=contacts.contactPoint&&contacts.targetPoint?Math.hypot(...contacts.contactPoint.map((v:number,i:number)=>v-contacts.targetPoint[i])):null;
   frames.push({t,verb:f.actors.bear.verb,root:f.actors.bear.pos,vertices,counts,bones,maxPotDepthMm,potDepthMmByBone,contacts,contactDistance,examples});
   if(shotTimes.some(a=>Math.abs(t-a)<.025))shots.push({name:t.toFixed(2),png:document.querySelector('canvas')!.toDataURL()});
  }
  return{from,until:tl.duration,potClip,potMatrix:pot.matrixWorld.elements,frames,shots};
 });
 for(const s of result.shots){await writeFile(`${output}/${s.name}.png`,Buffer.from(s.png.split(',')[1],'base64'));delete s.png;}
 const report={source,stable:source===await sourceFingerprint(),errors,...result},raw=JSON.stringify(report,null,2);await writeFile(`${output}/proof.json`,raw);
 const contactResiduals=Object.fromEntries(['reachError','targetError','contactDistance'].map(key=>{const rows=result.frames.map(f=>({t:f.t,mode:f.contacts?.mode,value:key==='contactDistance'?f.contactDistance:f.contacts?.[key]})).filter(r=>typeof r.value==='number'&&Number.isFinite(r.value));return[key,rows.sort((a,b)=>b.value-a.value)[0]??null];}));
 const compact={source,stable:report.stable,assertClear,errors,from:result.from,until:result.until,frames:result.frames.length,sampledVertices:result.frames.reduce((n,f)=>n+f.vertices,0),contactResiduals,intersections:result.frames.filter(f=>Object.keys(f.counts).length).map(f=>({t:+f.t.toFixed(4),counts:f.counts,bones:f.bones,maxPotDepthMm:f.maxPotDepthMm,potDepthMmByBone:f.potDepthMmByBone})),shots:result.shots.map(s=>`${output}/${s.name}.png`),raw:{path:`${output}/proof.json`,sha256:createHash('sha256').update(raw).digest('hex')},method:'Every eighth loaded Bear skin vertex at50ms intervals and clip/release boundaries; actual scaled pot lathe annulus/base, worktop polygon/thickness and inset cabinet-part boxes. Positive pot depth is minimum world-space distance to the profile edge, measured for every intersecting vertex. Pot handles and continuous triangle intersections are outside this check.'};
 await mkdir('docs/kitchen-bench/pot-contact-review',{recursive:true});await writeFile('docs/kitchen-bench/pot-contact-review/proof.json',JSON.stringify(compact,null,2));console.log(JSON.stringify(compact));
 if(assertClear&&(!report.stable||errors.length||compact.intersections.length))throw Error('Final pot contact review requires stable source, no browser errors and no sampled furniture intersections');
}finally{await browser.close();}
