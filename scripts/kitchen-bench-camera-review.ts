import {chromium} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {sourceFingerprint} from './parallel-interactions-utils';

// Review actual compiled camera transitions, not only contact midpoints.
const output='docs/kitchen-bench/iteration-camera-review';await mkdir(output,{recursive:true});
const source=await sourceFingerprint(),errors:string[]=[];
const browser=await chromium.launch({channel:'chrome',headless:false,args:['--disable-background-timer-throttling','--disable-renderer-backgrounding','--disable-backgrounding-occluded-windows']});
try{
 const page=await browser.newPage({viewport:{width:1280,height:810},deviceScaleFactor:1});
 page.on('pageerror',e=>errors.push(e.message));await page.addInitScript('globalThis.__name=x=>x');await page.route('**/api/**',r=>r.abort());
 await page.goto('http://127.0.0.1:8821/tools/kitchen-bench.html?mode=after');await page.waitForFunction(()=>!!(window as any).__kitchenBench,null,{timeout:180000});
 const report=await page.evaluate(async()=>{
  const x=(window as any).__kitchenBench;x.player.frozen=true;await x.prepare('kitchen');
  const tl=x.stories.kitchen,canvas=document.querySelector('canvas')!,samples:any[]=[],sheets:any[]=[];
  const module='/node_modules/three/build/three.module.js',THREE=await import(module),vertex=new THREE.Vector3();
  const read=(t:number)=>{const f=x.render('kitchen',t);return{t,camera:{pos:x.stage.camera.position.toArray(),quat:x.stage.camera.quaternion.toArray(),fov:x.stage.camera.fov,authored:f.camera},bear:{pos:f.actors.bear.pos,verb:f.actors.bear.verb,holding:f.actors.bear.holding,opacity:f.actors.bear.opacity},masha:{pos:f.actors.masha.pos,verb:f.actors.masha.verb,opacity:f.actors.masha.opacity},carrot:{...f.props.carrot_2,pos:x.stage.props.objects.carrot_2.position.toArray()}};};
  const makeSheet=(name:string,times:number[])=>{
   const unique=[...new Set(times.map(t=>Math.max(0,Math.min(tl.duration-.00001,t)).toFixed(6)))].map(Number).sort((a,b)=>a-b);
   for(let part=0;part<Math.ceil(unique.length/24);part++){
    const slice=unique.slice(part*24,(part+1)*24),sheet=document.createElement('canvas');sheet.width=1280;sheet.height=Math.ceil(slice.length/4)*204;const ctx=sheet.getContext('2d')!;
    slice.forEach((t,i)=>{samples.push(read(t));const left=i%4*320,top=Math.floor(i/4)*204;ctx.fillStyle='#fff5da';ctx.fillRect(left,top,320,204);ctx.drawImage(canvas,left,top+24,320,180);ctx.fillStyle='#26392e';ctx.font='14px monospace';ctx.fillText(`${name} ${t.toFixed(6)}s`,left+5,top+17);});
    sheets.push({name:`${name}-${part}`,times:slice,png:sheet.toDataURL()});
   }
  };
  for(const si of [0,1,2,3]){
   const e=tl.segments[si],times:number[]=[];
   for(const cue of e.segment.camera){
    const start=e.offset+cue.start,end=start+cue.dur;
    // Includes sub-millisecond rounding seams and each preceding shot's end.
    times.push(start-.00005,start+.00005,end-.00005,end+.00005);
   }
   for(const actor of ['masha','bear'])for(const c of e.segment.actorClips[actor])if(c.verb==='look_at'&&!c.params.ambient)times.push(e.offset+c.start+c.dur*.5);
   makeSheet(`scene-${si}-boundaries`,times);
  }
  const travelCoverage:any[]=[],problemTimes:number[]=[],travelOverview:number[]=[];
  for(const [si,e] of tl.segments.entries())for(const actor of ['masha','bear'])for(const [ci,c] of e.segment.actorClips[actor].entries())if(!c.params.ambient&&['walk_to','run_to','tiptoe_to'].includes(c.verb)){
   const count=Math.max(1,Math.ceil(c.dur/.1));let lastProblem=-Infinity,lastOverview=-Infinity;
   for(let i=0;i<=count;i++){
    const t=e.offset+c.start+c.dur*Math.min(.99999,Math.max(.00001,i/count)),state=read(t),camera=x.stage.camera;
    const min=[Infinity,Infinity],max=[-Infinity,-Infinity];let vertices=0,inView=0,inFront=0;
    x.stage.rigs[actor].root.traverse((mesh:any)=>{
     if(!mesh.isSkinnedMesh||!mesh.visible||!mesh.geometry.attributes.position)return;
     for(let parent=mesh.parent;parent;parent=parent.parent)if(!parent.visible)return;
     for(let j=0;j<mesh.geometry.attributes.position.count;j+=32){
      mesh.getVertexPosition(j,vertex);vertex.applyMatrix4(mesh.matrixWorld);vertices++;vertex.project(camera);
      if(vertex.z>=-1&&vertex.z<=1){inFront++;min[0]=Math.min(min[0],vertex.x);min[1]=Math.min(min[1],vertex.y);max[0]=Math.max(max[0],vertex.x);max[1]=Math.max(max[1],vertex.y);if(Math.abs(vertex.x)<=1&&Math.abs(vertex.y)<=1)inView++;}
     }
    });
    const visibility=inView/Math.max(1,vertices),eligible=!c.params.sceneCut&&(state as any)[actor].opacity>.1,row={t,scene:si,clip:ci,actor,verb:c.verb,eligible,vertices,inFront,inView,visibility,bounds:{min,max},state};travelCoverage.push(row);
    if(eligible&&visibility<.25&&t-lastProblem>=.5){problemTimes.push(t);lastProblem=t;}
    if(eligible&&(t-lastOverview>=.5||i===count)){travelOverview.push(t);lastOverview=t;}
   }
  }
  if(problemTimes.length)makeSheet('travel-low-coverage',problemTimes);
  makeSheet('travel-route-overview',travelOverview);
  const potTimes=[];for(let t=51;t<tl.duration;t+=.1)potTimes.push(t);potTimes.push(tl.duration-.00001);makeSheet('pot-complete-action',potTimes);
  const potClip=tl.segments.flatMap((e:any)=>e.segment.actorClips.bear.map((c:any)=>({...c,time:e.offset+c.start}))).find((c:any)=>c.params.putDown==='kitchen_pot');
  const details=[-.1,.2,.3,.4,.5,.6,.75,.9,1.2].map(k=>{const t=Math.min(tl.duration-.00001,potClip.time+potClip.dur*k),state=read(t);return{name:`pot-detail-${k}`,t,state,png:canvas.toDataURL()};});
  const progression:ReturnType<typeof read>[]=[];for(let t=51;t<tl.duration;t+=1/60)progression.push(read(t));progression.push(read(tl.duration-.00001));
  const backwards=progression.slice().reverse().map(s=>read(s.t)),seekDifferences=backwards.filter((s,i)=>JSON.stringify(s)!==JSON.stringify(progression[progression.length-1-i]));
  return{duration:tl.duration,info:x.info(),timeline:tl,samples,travelCoverage,progressionFrames:progression.length,progression,seekDifferences,sheets,details};
 });
 for(const s of report.sheets){await writeFile(`${output}/${s.name}.png`,Buffer.from(s.png.split(',')[1],'base64'));delete s.png;}
 for(const s of report.details){await writeFile(`${output}/${s.name}.png`,Buffer.from(s.png.split(',')[1],'base64'));delete(s as {png?:string}).png;}
 const result={source,stable:source===await sourceFingerprint(),errors,...report},raw=JSON.stringify(result,null,2);await writeFile(`${output}/proof.json`,raw);
 await mkdir('docs/kitchen-bench/camera-review',{recursive:true});
 await writeFile('docs/kitchen-bench/camera-review/proof.json',JSON.stringify({source,stable:result.stable,errors,duration:report.duration,
  progressionFrames:report.progressionFrames,reverseSeekDifferences:report.seekDifferences.length,boundaryAndActionSamples:report.samples.length,
  travelCoverage:{frames:report.travelCoverage.length,below25Percent:report.travelCoverage.filter(s=>s.eligible&&s.visibility<.25),fullyOutside:report.travelCoverage.filter(s=>s.eligible&&s.inView===0)},
  details:report.details.map(s=>({file:`${output}/${s.name}.png`,t:s.t})),
  info:report.info,sheets:report.sheets.map(s=>({file:`${output}/${s.name}.png`,times:s.times})),raw:{path:`${output}/proof.json`,sha256:createHash('sha256').update(raw).digest('hex')},
  method:'Actual loaded stage, blocked API calls; every protected-camera start/end +/-50 microseconds plus turn midpoints; pot action at0.1s and60Hz forward/reverse pose verification. Image visibility requires separate visual review.'},null,2));
 console.log(JSON.stringify({source,stable:result.stable,errors,progressionFrames:report.progressionFrames,seekDifferences:report.seekDifferences.length,sheets:report.sheets.map(s=>s.name)}));
 if(!result.stable||errors.length||report.seekDifferences.length)throw Error('Camera review source/render/seek instability');
 if(report.travelCoverage.some(s=>s.eligible&&s.inView===0))throw Error('An active travelling actor is entirely outside the camera; inspect coverage and travel sheets');
}finally{await browser.close();}
