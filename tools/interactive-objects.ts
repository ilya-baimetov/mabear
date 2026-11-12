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
const {objectStories}=await import('../scripts/interactive-objects-fixtures');
const stories=objectStories();
let physics:RapierReplay|undefined;
let physicsInitMs=0;
if(mode==='after'){
  const start=performance.now();
  // The exact pre-trial snapshot can run this harness without importing Rapier.
  const module='/src/engine/physics/stageReplay.ts';
  physics=await(await import(/* @vite-ignore */module)).createStageReplay(stage);
  physicsInitMs=performance.now()-start;
}
let storyId='entry';
const selectBox=document.querySelector('select')!;selectBox.innerHTML=Object.keys(stories).map(id=>`<option>${id}</option>`).join('');
const slider=document.querySelector<HTMLInputElement>('#seek')!,clock=document.querySelector('output')!;
const player=new Player({stage,audio:null,evaluator:physics,onTime(t){slider.value=String(t);clock.textContent=t.toFixed(2);}});
function select(id:string){storyId=id;player.pause();player.setTimeline(stories[id],'en');slider.max=String(stories[id].duration);player.seek(0);}
select(storyId);
document.querySelector<HTMLSelectElement>('#story')!.onchange=e=>select((e.target as HTMLSelectElement).value);
document.querySelector('#play')!.addEventListener('click',()=>player.play(player.time));
document.querySelector('#pause')!.addEventListener('click',()=>player.pause());
document.querySelector('#replay')!.addEventListener('click',()=>player.play(0));
slider.oninput=()=>player.seek(Number(slider.value));

function frameAt(id:string,t:number){const tl=stories[id];physics?.setTimeline(tl);return physics?physics.evaluate(tl,t):evaluate(tl,t);}
function render(id:string,t:number){player.frozen=true;const frame=frameAt(id,t);stage.render(frame);return frame;}
function inspect(id:string,t:number){
 const frame=render(id,t),a=frame.actors.bear,rig=stage.rigs.bear,ball=stage.props.objects.ball;
 const box=new THREE.Box3().setFromObject(rig.root),bb=new THREE.Box3().setFromObject(ball);
 const ballCentre=new THREE.Vector3(0,.15,0);ball.localToWorld(ballCentre);
 return {t,objects:frame.objects,actor:{pos:a.pos,verb:a.verb,physicsRoot:a.physicsRoot,holding:a.holding,box:{min:box.min.toArray(),max:box.max.toArray()},contacts:rig.root.userData.contacts??null,carry:rig.root.userData.carryContacts??null,hug:rig.root.userData.hugContacts??null},ball:{...frame.props.ball,worldPos:ball.position.toArray(),worldRotation:ball.quaternion.toArray(),centre:ballCentre.toArray(),box:{min:bb.min.toArray(),max:bb.max.toArray()}},physics:physics?.inspect(stories[id],t)??null,stats:stage.stats(),camera:{pos:stage.camera.position.toArray(),quat:stage.camera.quaternion.toArray()}};
}
function info(){const gl=stage.renderer.getContext(),ext=gl.getExtension('WEBGL_debug_renderer_info');return {mode,physicsInitMs,renderer:String(gl.getParameter(ext?ext.UNMASKED_RENDERER_WEBGL:gl.RENDERER)),userAgent:navigator.userAgent,buffer:[canvas.width,canvas.height],assets:stage.assets(),durations:Object.fromEntries(Object.entries(stories).map(([k,v])=>[k,v.duration]))};}
const quantile=(v:number[],p:number)=>[...v].sort((a,b)=>a-b)[Math.min(v.length-1,Math.floor(v.length*p))]??0;
async function benchmark(id:string,seconds=6){
 player.frozen=true;physics?.setTimeline(stories[id]);
 const cold=performance.now();frameAt(id,stories[id].duration);const coldMs=performance.now()-cold;
 const evalMs:number[]=[],renderMs:number[]=[],gaps:number[]=[];let last=0;let start=0;
 await new Promise<void>(resolve=>{function tick(now:number){
  if(!start)start=now;
  if(last)gaps.push(now-last);last=now;
  const t=((now-start)/1000)%stories[id].duration,begin=performance.now(),frame=frameAt(id,t),evaluated=performance.now();stage.render(frame);const done=performance.now();
  evalMs.push(evaluated-begin);renderMs.push(done-evaluated);
  if(now-start>=seconds*1000)resolve();else requestAnimationFrame(tick);
 }requestAnimationFrame(tick);});
 return {id,coldMs,frames:gaps.length+1,seconds:seconds,meanFps:1000/(gaps.reduce((a,b)=>a+b,0)/gaps.length),gapP50:quantile(gaps,.5),gapP95:quantile(gaps,.95),evalP50:quantile(evalMs,.5),evalP95:quantile(evalMs,.95),renderP50:quantile(renderMs,.5),renderP95:quantile(renderMs,.95),stats:stage.stats(),physics:physics?.inspect(stories[id],stories[id].duration)??null};
}
async function record(id:string,from=0,to=stories[id].duration){
 player.frozen=true;const duration=to-from;
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
   ctx.fillStyle='#26392e';ctx.font='bold 20px system-ui';ctx.fillText(`${mode==='after'?'AFTER · Interactive door':'BEFORE · Original story playback'} · ${id} · ${(from+elapsed).toFixed(2)} s`,16,22);
   ctx.font='13px system-ui';ctx.fillText('Actual story compiler, Three.js stage and loaded rigs · Silent · 1× wall-clock playback',16,41);
   if(elapsed>=duration)rec.stop();else raf=requestAnimationFrame(tick);
  }catch(e){reject(e);}}
  rec.start();raf=requestAnimationFrame(tick);
 });}finally{cancelAnimationFrame(raf);if(rec.state!=='inactive')rec.stop();stream.getTracks().forEach(t=>t.stop());}
}
function controls(id:string){select(id);player.frozen=false;return true;}
(window as any).__objectTrial={stage,player,physics,stories,info,inspect,benchmark,record,render,controls,frameAt,select};
document.querySelector('#status')!.textContent=`Ready · ${mode} · Local trial; no external services`;
