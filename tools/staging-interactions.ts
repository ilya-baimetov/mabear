import * as THREE from 'three';
import {createStage} from '../src/engine/stage';
import {compileEpisode} from '../src/compiler/episode';
import {FIXTURES} from '../src/director/fixtures';
import {evaluate} from '../src/engine/player/evaluate';
import {ACTOR_IDS,DEFAULT_REMIX,type Timeline} from '../src/shared/schema';
import recordings from '../src/shared/recordedSpeech.json';
import {speechKey,type SpeechRecording} from '../src/shared/speech';

const canvas=document.querySelector('canvas')!;
const stage=await createStage(canvas);
stage.setAdaptive(false);stage.resize(1280,720);await stage.assetsReady;
const ids=['garden_party','fishing_trip','bears_nap','pancake_morning'];
const speechDurations=Object.fromEntries((recordings as SpeechRecording[]).map(r=>[speechKey(r.text,r.lang),r.duration]));
const timelines:Record<string,Timeline>=Object.fromEntries(FIXTURES.filter(f=>f.lang==='en'&&ids.includes(f.id)).map(f=>[f.id,compileEpisode(f.paragraphs.map((p,i)=>({paragraphId:`proof-${i}`,version:1,beatScript:p.beatScript,remix:DEFAULT_REMIX})),'en',undefined,speechDurations).timeline]));
const clips=Object.entries(timelines).flatMap(([story,tl])=>tl.segments.flatMap(s=>ACTOR_IDS.flatMap(actor=>s.segment.actorClips[actor].filter(c=>!c.params.ambient).map(c=>({story,actor,verb:c.verb,start:s.offset+c.start,dur:c.dur,params:c.params})))));
const at=(story:string,actor:string,verb:string,offset:number)=>Math.max(0,Math.min(timelines[story].duration-.01,clips.find(c=>c.story===story&&c.actor===actor&&c.verb===verb)!.start+offset));
const carry=clips.find(c=>c.story==='bears_nap'&&c.actor==='bear'&&c.verb==='carry')!;
const rideWalk=clips.filter(c=>c.story==='bears_nap'&&c.actor==='bear'&&['walk_to','run_to','tiptoe_to'].includes(c.verb)&&c.start>=carry.start+carry.dur-.001).sort((a,b)=>a.start-b.start)[0];
const snapshots:Record<string,number[]>={
 garden_party:[at('garden_party','bear','wave',.5),at('garden_party','hare','eat',.8),at('garden_party','rosie','surprised',.4),at('garden_party','squirrel','jump',.4),at('garden_party','rival_bear','dance',.7)],
 fishing_trip:[at('fishing_trip','bear','sit',.6),at('fishing_trip','bear','surprised',.3),at('fishing_trip','bear','fish',2),at('fishing_trip','masha','hug',.7)],
 bears_nap:[at('bears_nap','bear','sleep',.4),at('bears_nap','bear','wake_up',-.4),at('bears_nap','bear','wake_up',.3),at('bears_nap','bear','wake_up',1.2),at('bears_nap','bear','fall_down',.4),at('bears_nap','bear','stand_up',.5),at('bears_nap','masha','hug',.8),carry.start+.3,carry.start+1.5,carry.start+2.8,rideWalk.start+1,rideWalk.start+4.5],
 pancake_morning:[at('pancake_morning','masha','cook',-.5),at('pancake_morning','masha','cook',.7),at('pancake_morning','masha','cook',2.1),at('pancake_morning','masha','hug',-.15),at('pancake_morning','masha','hug',.35),at('pancake_morning','masha','hug',1.05),at('pancake_morning','masha','hug',2.4)],
};
function render(story:string,time:number){stage.render(evaluate(timelines[story],Math.min(time,timelines[story].duration-.001)));}
function inspect(story:string,time:number){
 const frame=evaluate(timelines[story],time);stage.render(frame);
 const actors=Object.fromEntries(ACTOR_IDS.filter(id=>frame.cast?.includes(id)).map(id=>{
  const a=frame.actors[id],rig=stage.rigs[id],box=new THREE.Box3().setFromObject(rig.root),points=[];
  let finite=true;rig.root.traverse(o=>{finite&&=o.matrixWorld.elements.every(Number.isFinite);});
  for(const x of [box.min.x,box.max.x])for(const y of [box.min.y,box.max.y])for(const z of [box.min.z,box.max.z])points.push(new THREE.Vector3(x,y,z).project(stage.camera).toArray());
  return[id,{verb:a.verb,pos:a.pos,posture:a.posture,holding:a.holding,finite,contacts:rig.root.userData.contacts??null,carryContacts:rig.root.userData.carryContacts??null,hugContacts:rig.root.userData.hugContacts??null,projectedBounds:{x:[Math.min(...points.map(p=>p[0])),Math.max(...points.map(p=>p[0]))],y:[Math.min(...points.map(p=>p[1])),Math.max(...points.map(p=>p[1]))]},worldBounds:{min:box.min.toArray(),max:box.max.toArray()}}];
 }));
 return{story,time,authoredCamera:frame.camera,actualCamera:{pos:stage.camera.position.toArray(),quaternion:stage.camera.quaternion.toArray(),fov:stage.camera.fov},actors,stats:stage.stats()};
}
function info(){const g=stage.renderer.getContext(),ext=g.getExtension('WEBGL_debug_renderer_info');return{speechTiming:'AppStore recordedSpeech.json durations keyed by speechKey; silent recording',renderer:String(g.getParameter(ext?ext.UNMASKED_RENDERER_WEBGL:g.RENDERER)),assets:stage.assets(),post:stage.postQuality(),buffer:[canvas.width,canvas.height],durations:Object.fromEntries(Object.entries(timelines).map(([k,t])=>[k,t.duration])),segments:Object.fromEntries(Object.entries(timelines).map(([k,t])=>[k,t.segments.map(s=>({offset:s.offset,duration:s.segment.duration}))])),clips,snapshots};}
async function record(story:string,label:string){
 const duration=timelines[story].duration;
 // Compile required materials before starting the evidence clock.
 for(let t=0;t<duration;t+=2){render(story,t);await new Promise(requestAnimationFrame);}
 render(story,0);await new Promise(requestAnimationFrame);
 const mime=['video/mp4;codecs=avc1.42E01E','video/mp4','video/webm;codecs=vp9'].find(t=>MediaRecorder.isTypeSupported(t));
 if(!mime)throw new Error('No supported native video encoder');
 const output=document.createElement('canvas');output.width=1280;output.height=768;
 const ctx=output.getContext('2d')!,stream=output.captureStream(30),parts:BlobPart[]=[];
 const recorder=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:5_000_000});
 const gaps:number[]=[];let raf=0,last=0,frames=0;
 try{return await new Promise<{blob:Blob;duration:number;frames:number;maxGapMs:number;p95GapMs:number}>((resolve,reject)=>{
  recorder.ondataavailable=e=>{if(e.data.size)parts.push(e.data);};recorder.onerror=()=>reject(new Error('MediaRecorder failed'));
  recorder.onstop=()=>{const sorted=[...gaps].sort((a,b)=>a-b);resolve({blob:new Blob(parts,{type:mime}),duration,frames,maxGapMs:Math.max(...gaps),p95GapMs:sorted[Math.floor(sorted.length*.95)]??0});};
  const start=performance.now();
  const tick=(now:number)=>{try{
   if(last)gaps.push(now-last);last=now;frames++;const elapsed=Math.min((now-start)/1000,duration-.001);
   render(story,elapsed);ctx.fillStyle='#fff5da';ctx.fillRect(0,0,1280,768);ctx.drawImage(canvas,0,48,1280,720);
   ctx.fillStyle='#342b3d';ctx.font='bold 20px system-ui';ctx.fillText(`${label} · ${story.replaceAll('_',' ')} · ${elapsed.toFixed(2)} s`,16,22);
   ctx.font='13px system-ui';ctx.fillText('Actual game fixture · Production camera, stage, rigs and assets · Silent recording',16,40);
   if(now-start>=duration*1000)recorder.stop();else raf=requestAnimationFrame(tick);
  }catch(e){reject(e);}};
  recorder.start();raf=requestAnimationFrame(tick);
 });}finally{cancelAnimationFrame(raf);if(recorder.state!=='inactive')recorder.stop();stream.getTracks().forEach(t=>t.stop());}
}
(window as unknown as {__stagingInteractions:unknown}).__stagingInteractions={stage,timelines,info,inspect,record,render(story:string,time:number){const meta=inspect(story,time);return{...meta,png:canvas.toDataURL()};}};
document.querySelector('#status')!.textContent='Ready: actual game fixture compiler, evaluator and stage.';
