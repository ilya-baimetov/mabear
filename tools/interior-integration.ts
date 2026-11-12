import * as THREE from 'three';
import {createStage} from '../src/engine/stage';
import {compileEpisode} from '../src/compiler/episode';
import {FIXTURES} from '../src/director/fixtures';
import {evaluate} from '../src/engine/player/evaluate';
import {ACTOR_IDS,DEFAULT_REMIX,type Beat,type BeatScript,type Timeline} from '../src/shared/schema';
import {sceneLocationAt,MARKS} from '../src/shared/bible/set';
import {initialWorldState} from '../src/compiler/worldState';
import recordings from '../src/shared/recordedSpeech.json';
import {speechKey,type SpeechRecording} from '../src/shared/speech';
import {PROP_CONTACTS} from '../src/shared/propContacts';

const canvas=document.querySelector('canvas')!;
const stage=await createStage(canvas);
stage.setAdaptive(false);stage.resize(1280,720);await stage.assetsReady;
const durations=Object.fromEntries((recordings as SpeechRecording[]).map(r=>[speechKey(r.text,r.lang),r.duration]));
const beat=(actor:Beat['actor'],verb:Beat['verb'],extra:Partial<Beat>={}):Beat=>({actor,verb,target:null,item:null,line:null,emote:null,sfx:null,emotion:'happy',with_previous:false,delay_s:0,shot:'auto',...extra});
const script=(summary:string,beats:Beat[],first=false):BeatScript=>({summary,time_of_day:first?'day':null,mood:'calm',music:{mood:'calm',intensity:'soft',change:first?'start':'continue'},ambience:null,beats,rule_hits:[]});
const kitchenScripts:BeatScript[]=[
 script('Bear cooks in his kitchen while Masha sits in the reading chair.',[
  beat('bear','take',{item:'frying_pan',target:'frying_pan'}),beat('bear','walk_to',{target:'house_kitchen'}),beat('masha','walk_to',{target:'house_living',with_previous:true}),beat('masha','sit',{target:'house_living'}),beat('bear','cook',{target:'house_kitchen',shot:'wide'}),
 ],true),
 script('Masha gets up, walks around the furniture to the kitchen, and cooks. Bear moves to the reading chair.',[
  beat('masha','stand_up'),beat('bear','walk_to',{target:'house_living'}),beat('bear','sit',{target:'house_living'}),beat('masha','walk_to',{target:'house_kitchen'}),beat('masha','cook',{target:'house_kitchen',shot:'medium'}),
 ]),
 script('Masha brings pancakes back to the living room. Bear gets up and they go outside.',[
  beat('masha','take',{item:'pancakes',target:'pancakes'}),beat('masha','walk_to',{target:'house_living'}),beat('masha','eat',{item:'pancakes'}),beat('bear','stand_up'),beat('bear','walk_to',{target:'clearing'}),beat('masha','walk_to',{target:'clearing',with_previous:true}),beat('masha','wave',{target:'bear'}),
 ]),
];
const timelines:Record<string,Timeline>={};
for(const lang of ['en','ru'] as const){const f=FIXTURES.find(f=>f.id==='cozy_evening'&&f.lang===lang)!;timelines[`cozy_evening_${lang}`]=compileEpisode(f.paragraphs.map((p,i)=>({paragraphId:`interior-${i}`,version:1,beatScript:p.beatScript,remix:DEFAULT_REMIX})),lang,undefined,durations).timeline;}
timelines.kitchen_visit=compileEpisode(kitchenScripts.map((beatScript,i)=>({paragraphId:`kitchen-${i}`,version:1,beatScript,remix:DEFAULT_REMIX})),'en',undefined,durations).timeline;
const pickupInitial=initialWorldState();
pickupInitial.actors.masha={...pickupInitial.actors.masha,pos:[...MARKS.house_kitchen.pos],mark:'house_kitchen',facing:MARKS.house_kitchen.facing};
for(const item of ['jam_jar','flour_bag','frying_pan']as const)pickupInitial.props[item]={at:'house_kitchen'};
const pickupScript=script('Masha climbs the kitchen helper and picks up the jam jar, flour bag and frying pan in turn.',[
 beat('masha','take',{target:'jam_jar',item:'jam_jar'}),beat('masha','take',{target:'flour_bag',item:'flour_bag'}),beat('masha','take',{target:'frying_pan',item:'frying_pan'}),
],true);
timelines.kitchen_pickups=compileEpisode([{paragraphId:'pickup-0',version:1,beatScript:pickupScript,remix:DEFAULT_REMIX}],'en',pickupInitial,durations).timeline;
const clips=Object.entries(timelines).flatMap(([story,tl])=>tl.segments.flatMap(s=>ACTOR_IDS.flatMap(actor=>s.segment.actorClips[actor].filter(c=>!c.params.ambient).map(c=>({story,actor,verb:c.verb,start:s.offset+c.start,dur:c.dur,params:c.params})))));
const snapshots=Object.fromEntries(Object.keys(timelines).map(story=>[story,clips.filter(c=>c.story===story&&((c.verb==='cook')||(c.verb==='sit')||(c.verb==='eat')||(c.verb==='stand_up')||(c.verb==='give'))).map((c,i)=>({id:`${String(i+1).padStart(2,'0')}-${c.actor}-${c.verb}`,time:c.start+Math.min(c.dur*.5,1.6),start:c.start,duration:c.dur,actor:c.actor,verb:c.verb}))]));
for(const story of Object.keys(timelines)){
 const staged=clips.filter(c=>c.story===story&&['sit','stand_up','give'].includes(c.verb));
 for(const [index,c]of staged.entries())for(const [label,k]of [['start',.12],['end',.9]]as const)snapshots[story].push({id:`detail-${index}-${c.actor}-${c.verb}-${label}`,time:c.start+c.dur*k,start:c.start,duration:c.dur,actor:c.actor,verb:c.verb});
 for(const [index,c]of clips.filter(c=>c.story===story&&c.verb==='sit'&&c.params.target==='house_living').entries()){
  snapshots[story].push({id:`seat-entry-${index}-${c.actor}-approach`,time:Math.max(0,c.start-.01),start:c.start,duration:c.dur,actor:c.actor,verb:c.verb});
  for(const k of [0,.12,.25,.5,.75,.97,1.03])snapshots[story].push({id:`seat-entry-${index}-${c.actor}-${k}`,time:Math.min(timelines[story].duration-.001,c.start+c.dur*k),start:c.start,duration:c.dur,actor:c.actor,verb:c.verb});
 }
}
for(const [index,c]of clips.filter(c=>c.story==='kitchen_pickups'&&c.verb==='take').entries())for(const k of [.4,.49,.5,.6,.8,.99,1.01,1.15])snapshots.kitchen_pickups.push({id:`${index+1}-${c.params.item}-pickup-${k}`,time:Math.min(timelines[c.story].duration-.001,c.start+c.dur*k),start:c.start,duration:c.dur,actor:c.actor,verb:c.verb});
for(const [index,c]of clips.filter(c=>c.story!=='kitchen_pickups'&&c.verb==='take').entries())for(const k of [.4,.49,.5,.6,.8,.99,1.01,1.15])snapshots[c.story].push({id:`detail-take-${index}-${c.actor}-${c.params.item}-${k}`,time:Math.min(timelines[c.story].duration-.001,c.start+c.dur*k),start:c.start,duration:c.dur,actor:c.actor,verb:c.verb});
function render(story:string,time:number){const frame=evaluate(timelines[story],Math.min(time,timelines[story].duration-.001));stage.render(frame);return frame;}
function ancestorVisible(o:THREE.Object3D){for(let p:THREE.Object3D|null=o;p;p=p.parent)if(!p.visible)return false;return true;}
function inspect(story:string,time:number){
 const frame=render(story,time),camera=stage.camera;
 const actors=Object.fromEntries(ACTOR_IDS.filter(id=>frame.cast?.includes(id)).map(id=>{
  const actor=frame.actors[id],rig=stage.rigs[id],box=new THREE.Box3().setFromObject(rig.root),corners=[];
  let finite=true;rig.root.traverse(o=>{finite&&=o.matrixWorld.elements.every(Number.isFinite);});
  for(const x of [box.min.x,box.max.x])for(const y of [box.min.y,box.max.y])for(const z of [box.min.z,box.max.z])corners.push(new THREE.Vector3(x,y,z).project(camera).toArray());
  const targets=[new THREE.Vector3(actor.pos[0],box.min.y+(box.max.y-box.min.y)*.80,actor.pos[2]),new THREE.Vector3(actor.pos[0],box.min.y+(box.max.y-box.min.y)*.45,actor.pos[2])];
  const occluders=targets.map(target=>{const delta=target.clone().sub(camera.position),distance=delta.length(),ray=new THREE.Raycaster(camera.position,delta.normalize(),.05,distance-.12);return ray.intersectObject(stage.set.root,true).filter(hit=>ancestorVisible(hit.object)).slice(0,3).map(hit=>({name:hit.object.name,distance:hit.distance}));});
  const hands=Object.fromEntries(['LeftHand','RightHand'].map(name=>[name,rig.bones[name]?.getWorldPosition(new THREE.Vector3()).toArray()??null]));
  return[id,{verb:actor.verb,pos:actor.pos,actualRoot:rig.root.getWorldPosition(new THREE.Vector3()).toArray(),yaw:actor.yaw,opacity:actor.opacity,posture:actor.posture,holding:actor.holding,finite,visible:rig.root.visible,location:sceneLocationAt(actor.pos[0],actor.pos[2]),contacts:rig.root.userData.contacts??null,handSocket:rig.handSocket.getWorldPosition(new THREE.Vector3()).toArray(),hands,occluders,projectedBounds:{x:[Math.min(...corners.map(p=>p[0])),Math.max(...corners.map(p=>p[0]))],y:[Math.min(...corners.map(p=>p[1])),Math.max(...corners.map(p=>p[1]))]},worldBounds:{min:box.min.toArray(),max:box.max.toArray()}}];
 }));
 const props=Object.fromEntries((['frying_pan','pancakes','jam_jar','flour_bag']as const).map(id=>{const object=stage.props.objects[id],box=new THREE.Box3().setFromObject(object),grip=object.localToWorld(new THREE.Vector3(...PROP_CONTACTS[id].point)),origin=object.getWorldPosition(new THREE.Vector3());const supportRay=new THREE.Raycaster(new THREE.Vector3(origin.x,Math.max(3,box.max.y+.1),origin.z),new THREE.Vector3(0,-1,0),0,6);const support=supportRay.intersectObject(stage.set.root,true).find(hit=>ancestorVisible(hit.object)&&hit.point.y<=box.min.y+.1);return[id,{support: support?{name:support.object.name,height:support.point.y,baseGap:box.min.y-support.point.y}:null,visible:ancestorVisible(object),attachedTo:frame.props[id].attachedTo,position:object.getWorldPosition(new THREE.Vector3()).toArray(),rotation:object.rotation.toArray(),grip:grip.toArray(),worldBounds:{min:box.min.toArray(),max:box.max.toArray()},baseAgainstPrepTable:box.min.y-1.20}];}));
 const house=stage.set.root.children.find(child=>child.userData.setElement==='house_interior'),anchors:Record<string,unknown>={};
 for(const [name,value]of Object.entries(house?.userData.anchors??{})){if(value instanceof THREE.Object3D){const box=new THREE.Box3().setFromObject(value);anchors[name]={position:value.getWorldPosition(new THREE.Vector3()).toArray(),bounds:{min:box.min.toArray(),max:box.max.toArray()}};}else if(typeof value==='number')anchors[name]=value;}
 return{story,time,location:frame.camera.location??sceneLocationAt(frame.camera.look[0],frame.camera.look[2]),authoredCamera:frame.camera,actualCamera:{pos:camera.position.toArray(),quaternion:camera.quaternion.toArray(),fov:camera.fov},actors,props,house:{geometryVersion:house?.userData.geometryVersion??'previous-interior',revision:house?.userData.revision??null,anchors},stats:stage.stats()};
}
function info(){const gl=stage.renderer.getContext(),ext=gl.getExtension('WEBGL_debug_renderer_info');return{speechTiming:'Production recordedSpeech.json durations; silent evidence recording',renderer:String(gl.getParameter(ext?ext.UNMASKED_RENDERER_WEBGL:gl.RENDERER)),assets:stage.assets(),post:stage.postQuality(),buffer:[canvas.width,canvas.height],durations:Object.fromEntries(Object.entries(timelines).map(([k,t])=>[k,t.duration])),segments:Object.fromEntries(Object.entries(timelines).map(([k,t])=>[k,t.segments.map(s=>({offset:s.offset,duration:s.segment.duration}))])),clips,snapshots};}
async function record(story:string,label:string,startTime=0,endTime=timelines[story].duration){
 const duration=endTime-startTime;
 for(let t=startTime;t<endTime;t+=2){render(story,t);await new Promise(requestAnimationFrame);}
 render(story,startTime);await new Promise(requestAnimationFrame);
 const mime=['video/mp4;codecs=avc1.42E01E','video/mp4','video/webm;codecs=vp9'].find(t=>MediaRecorder.isTypeSupported(t));if(!mime)throw new Error('No supported video encoder');
 const output=document.createElement('canvas');output.width=1280;output.height=768;
 const context=output.getContext('2d')!,stream=output.captureStream(30),parts:BlobPart[]=[];
 const recorder=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:5_000_000});const gaps:number[]=[];let raf=0,last=0,frames=0;
 try{return await new Promise<{blob:Blob;duration:number;frames:number;maxGapMs:number;p95GapMs:number}>((resolve,reject)=>{
  recorder.ondataavailable=e=>{if(e.data.size)parts.push(e.data);};recorder.onerror=()=>reject(new Error('Video recording failed'));
  recorder.onstop=()=>{const sorted=[...gaps].sort((a,b)=>a-b);resolve({blob:new Blob(parts,{type:mime}),duration,frames,maxGapMs:Math.max(...gaps),p95GapMs:sorted[Math.floor(sorted.length*.95)]??0});};
  const start=performance.now();const tick=(now:number)=>{try{if(last)gaps.push(now-last);last=now;frames++;const elapsed=Math.min((now-start)/1000,duration-.001);render(story,startTime+elapsed);context.fillStyle='#fff5da';context.fillRect(0,0,1280,768);context.drawImage(canvas,0,48,1280,720);context.fillStyle='#342b3d';context.font='bold 20px system-ui';context.fillText(`${label} · ${story.replaceAll('_',' ')} · ${(startTime+elapsed).toFixed(2)} s`,16,22);context.font='13px system-ui';context.fillText('Actual story compiler, game camera, stage, rigs and assets · Silent recording',16,40);if(now-start>=duration*1000)recorder.stop();else raf=requestAnimationFrame(tick);}catch(e){reject(e);}};recorder.start();raf=requestAnimationFrame(tick);
 });}finally{cancelAnimationFrame(raf);if(recorder.state!=='inactive')recorder.stop();stream.getTracks().forEach(t=>t.stop());}
}
let selected=Object.keys(timelines)[0],time=0,playing=false,lastTick=performance.now();
const select=document.querySelector<HTMLSelectElement>('#story')!,slider=document.querySelector<HTMLInputElement>('#time')!,play=document.querySelector<HTMLButtonElement>('#play')!,clock=document.querySelector('#clock')!;
for(const id of Object.keys(timelines)){const option=document.createElement('option');option.value=id;option.textContent=id.replaceAll('_',' ');select.append(option);}
function show(){render(selected,time);slider.max=String(timelines[selected].duration);slider.value=String(time);clock.textContent=`${time.toFixed(1)} / ${timelines[selected].duration.toFixed(1)} s`;}
select.onchange=()=>{selected=select.value;time=0;show();};slider.oninput=()=>{time=Number(slider.value);show();};play.onclick=()=>{playing=!playing;play.textContent=playing?'Pause':'Play';lastTick=performance.now();};
function tick(now:number){if(playing){time=Math.min(time+(now-lastTick)/1000,timelines[selected].duration-.001);show();if(time>=timelines[selected].duration-.001){playing=false;play.textContent='Play';}}lastTick=now;requestAnimationFrame(tick);}requestAnimationFrame(tick);
(window as unknown as {__interiorIntegration:unknown}).__interiorIntegration={stage,timelines,info,inspect,record,render(story:string,time:number){const meta=inspect(story,time);return{...meta,png:canvas.toDataURL()};},select(story:string,at=0){selected=story;select.value=story;time=at;playing=false;show();}};
document.querySelector('#status')!.textContent='Ready: production story compiler, evaluator and renderer. Play/pause resumes the same frame.';show();
