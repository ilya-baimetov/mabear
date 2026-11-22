import * as THREE from 'three';
import {createStage} from '../src/engine/stage';
import {Player} from '../src/engine/player/player';
import {evaluate} from '../src/engine/player/evaluate';
import type {Timeline} from '../src/shared/schema';
import type {FrameState} from '../src/engine/api';
import type {RapierReplay} from '../src/engine/physics/rapierReplay';

const mode=new URLSearchParams(location.search).get('mode')??'after';
const canvas=document.querySelector('canvas')!;
const stage=await createStage(canvas);stage.setAdaptive(false);stage.resize(1280,720);await stage.assetsReady;
const {kitchenBenchStories}=await import('../scripts/kitchen-bench-fixtures');
const stories=kitchenBenchStories();
let physics:any;
let physicsInitMs=0;
if(mode!=='animation'){
  const start=performance.now();
  // The exact pre-trial snapshot can run this harness without importing Rapier.
  const module='/src/engine/physics/stageReplay.ts';
  const factory=await import(/* @vite-ignore */module);
  physics=mode==='after'?factory.createResponsiveStageReplay(stage):await factory.createStageReplay(stage);
  physicsInitMs=performance.now()-start;
}
let storyId='kitchen';
let preparedId='';
const selectBox=document.querySelector('select')!;selectBox.innerHTML=Object.keys(stories).map(id=>`<option>${id}</option>`).join('');
const slider=document.querySelector<HTMLInputElement>('#seek')!,clock=document.querySelector('output')!;
const player=new Player({stage,audio:null,evaluator:physics,onTime(t){slider.value=String(t);clock.textContent=t.toFixed(2);}});
async function prepare(id:string){if(id===preparedId&&physics?.ready!==false)return;physics?.setTimeline(stories[id]);await physics?.whenReady?.();preparedId=id;}
async function select(id:string){storyId=id;player.pause();player.setTimeline(stories[id],'en');slider.max=String(stories[id].duration);player.seek(0);await prepare(id);}
await select(storyId);
document.querySelector<HTMLSelectElement>('#story')!.onchange=e=>select((e.target as HTMLSelectElement).value);
document.querySelector('#play')!.addEventListener('click',()=>player.play(player.time));
document.querySelector('#pause')!.addEventListener('click',()=>player.pause());
document.querySelector('#replay')!.addEventListener('click',()=>player.play(0));
slider.oninput=()=>player.seek(Number(slider.value));

function frameAt(id:string,t:number){if(preparedId!==id)throw Error('Call await prepare(id) before reading frames');const tl=stories[id];return physics?physics.evaluate(tl,t):evaluate(tl,t);}
function render(id:string,t:number){player.frozen=true;const frame=frameAt(id,t);stage.render(frame);return frame;}
function inspect(id:string,t:number){
 const frame=render(id,t),a=frame.actors.masha,rig=stage.rigs.masha;
 const props=Object.fromEntries(Object.entries(stage.props.objects).filter(([id])=>id==='ball'||id.startsWith('carrot')||id==='pantry_honey').map(([id,obj])=>{const box=new THREE.Box3().setFromObject(obj);return[id,{...frame.props[id as keyof typeof frame.props],worldPos:obj.position.toArray(),worldRotation:obj.quaternion.toArray(),visible:obj.visible,box:{min:box.min.toArray(),max:box.max.toArray()}}];}));
 const actors=Object.fromEntries(['masha','bear'].map(id=>{const actor=frame.actors[id as 'masha'|'bear'],rig=stage.rigs[id as 'masha'|'bear'];return[id,{...actor,contacts:rig.root.userData.contacts??null,carry:rig.root.userData.carryContacts??null,hug:rig.root.userData.hugContacts??null,source:rig.root.userData.sourceContacts??null}];}));
 return structuredClone({t,objects:frame.objects,props,actors,physics:physics?.inspect(stories[id],t)??null,stats:stage.stats(),camera:{pos:stage.camera.position.toArray(),quat:stage.camera.quaternion.toArray()}});
}
function carrotResources(){const ids=Object.keys(stage.props.objects).filter(id=>id.startsWith('carrot')),materials=new Set<string>(),geometries=new Set<string>(),textures=new Set<string>();for(const id of ids)stage.props.objects[id as keyof typeof stage.props.objects].traverse((o:any)=>{if(o.geometry)geometries.add(o.geometry.uuid);for(const m of o.material?(Array.isArray(o.material)?o.material:[o.material]):[]){materials.add(m.uuid);if(m.map)textures.add(m.map.uuid);}});return{instances:ids.length,materials:materials.size,geometries:geometries.size,textures:textures.size};}
function info(){const gl=stage.renderer.getContext(),ext=gl.getExtension('WEBGL_debug_renderer_info');return {mode,physicsInitMs,carrotResources:carrotResources(),renderer:String(gl.getParameter(ext?ext.UNMASKED_RENDERER_WEBGL:gl.RENDERER)),userAgent:navigator.userAgent,buffer:[canvas.width,canvas.height],assets:stage.assets(),durations:Object.fromEntries(Object.entries(stories).map(([k,v])=>[k,v.duration]))};}
const quantile=(v:number[],p:number)=>[...v].sort((a,b)=>a-b)[Math.min(v.length-1,Math.floor(v.length*p))]??0;
async function benchmark(id:string,seconds=6,from=0){
 player.frozen=true;const cold=performance.now();await prepare(id);frameAt(id,stories[id].duration);const coldMs=performance.now()-cold;
 const evalMs:number[]=[],renderMs:number[]=[],gaps:number[]=[];let last=0;let start=0;
 await new Promise<void>(resolve=>{function tick(now:number){
  if(!start)start=now;
  if(last)gaps.push(now-last);last=now;
  const t=(from+(now-start)/1000)%stories[id].duration,begin=performance.now(),frame=frameAt(id,t),evaluated=performance.now();stage.render(frame);const done=performance.now();
  evalMs.push(evaluated-begin);renderMs.push(done-evaluated);
  if(now-start>=seconds*1000)resolve();else requestAnimationFrame(tick);
 }requestAnimationFrame(tick);});
 return {id,from,coldMs,frames:gaps.length+1,seconds:seconds,meanFps:1000/(gaps.reduce((a,b)=>a+b,0)/gaps.length),gapP50:quantile(gaps,.5),gapP95:quantile(gaps,.95),evalP50:quantile(evalMs,.5),evalP95:quantile(evalMs,.95),renderP50:quantile(renderMs,.5),renderP95:quantile(renderMs,.95),stats:stage.stats(),physics:physics?.inspect(stories[id],stories[id].duration)??null};
}
async function record(id:string,from=0,to=stories[id].duration){
 player.frozen=true;await prepare(id);const duration=to-from;
 for(let t=from;t<to;t+=.5){render(id,t);await new Promise(requestAnimationFrame);}
 render(id,from);await new Promise(requestAnimationFrame);
 const mime=['video/mp4;codecs=avc1.42E01E','video/mp4','video/webm;codecs=vp9'].find(t=>MediaRecorder.isTypeSupported(t))!;
 const out=document.createElement('canvas');out.width=1280;out.height=768;
 const ctx=out.getContext('2d')!,stream=out.captureStream(30),parts:BlobPart[]=[],rec=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:5_000_000});
 let raf=0,last=0,frames=0;const gaps:number[]=[];
 try{return await new Promise<{blob:Blob;duration:number;frames:number;gapP95:number}>((resolve,reject)=>{
  rec.ondataavailable=e=>{if(e.data.size)parts.push(e.data);};rec.onerror=()=>reject(Error('MediaRecorder failed'));
  rec.onstop=()=>resolve({blob:new Blob(parts,{type:mime}),duration,frames,gapP95:quantile(gaps,.95)});
  const start=performance.now();
  function tick(now:number){try{const elapsed=Math.min((now-start)/1000,duration);if(last)gaps.push(now-last);last=now;frames++;
   render(id,from+elapsed);ctx.fillStyle='#fff5da';ctx.fillRect(0,0,1280,768);ctx.drawImage(canvas,0,48);
   ctx.fillStyle='#26392e';ctx.font='bold 20px system-ui';ctx.fillText(`${mode==='after'?'AFTER · Kitchen and bench continuity':'BEFORE · Deployed source'} · ${id} · ${(from+elapsed).toFixed(2)} s`,16,22);
   ctx.font='13px system-ui';ctx.fillText('Actual story compiler, Three.js stage and loaded rigs · Silent · 1× wall-clock playback',16,41);
   if(elapsed>=duration)rec.stop();else raf=requestAnimationFrame(tick);
  }catch(e){reject(e);}}
  rec.start();raf=requestAnimationFrame(tick);
 });}finally{cancelAnimationFrame(raf);if(rec.state!=='inactive')rec.stop();stream.getTracks().forEach(t=>t.stop());}
}
async function controls(id:string){await select(id);player.frozen=false;return true;}
(window as any).__kitchenBench={stage,player,physics,stories,info,inspect,benchmark,record,render,controls,frameAt,select,prepare};
document.querySelector('#status')!.textContent=`Ready · ${mode} · Local trial; no external services`;
