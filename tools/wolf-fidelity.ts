import * as THREE from 'three';
import {buildWolf} from '../src/engine/characters/wolf';
import {buildWolf as buildBaseline} from './wolf-fidelity-baseline';
import {restFrame} from '../src/engine/characters/rig';
import {evaluatePose, STYLES} from '../src/engine/motion/library';
import {armsDown, type ActorStyle} from '../src/engine/motion/verbs/common';
import type {Emotion, Verb} from '../src/shared/schema';
import type {CharacterRig} from '../src/engine/api';
const params=new URLSearchParams(location.search);
const variant=params.get('variant')==='b'?'b':'a';
const rigs=[buildBaseline(variant),buildWolf(variant)];
const id=variant==='a'?'wolf_a':'wolf_b';
const k=STYLES[id].height/2;
const oldStyle:ActorStyle={...STYLES[id],hipHeight:.98*k,bounce:.7,stance:.04,armOut:.2,hipsDrop:.02,lieHeight:.2,shoulderHeight:1.39*k,
 leg:{x:.1*k,y:-.05*k,thigh:.44*k,shin:.41*k,ankle:.06*k,toe:.13*k}};
const canvas=document.querySelector('canvas')!;
const renderer=new THREE.WebGLRenderer({canvas,antialias:true,preserveDrawingBuffer:true});
renderer.setSize(1280,720);renderer.setPixelRatio(1);renderer.outputColorSpace=THREE.SRGBColorSpace;
renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.02;
renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
const scenes=rigs.map(rig=>{
 const scene=new THREE.Scene();scene.background=new THREE.Color('#d9e1d7');
 scene.add(rig.root,new THREE.HemisphereLight('#e1efff','#78745d',1.2));
 const key=new THREE.DirectionalLight('#fff2db',2.8);key.position.set(-3,5,5);key.castShadow=true;
 key.shadow.mapSize.set(1024,1024);Object.assign(key.shadow.camera,{left:-2,right:2,top:3,bottom:-1,near:.1,far:12});
 key.shadow.bias=-.0002;key.shadow.normalBias=.006;
 const rim=new THREE.DirectionalLight('#ecf5ff',1.6);rim.position.set(3,3,-4);scene.add(key,rim);
 const floor=new THREE.Mesh(new THREE.PlaneGeometry(100,100),new THREE.MeshStandardMaterial({color:'#a7b09c',roughness:1}));
 floor.rotation.x=-Math.PI/2;floor.receiveShadow=true;scene.add(floor);return scene;
});
const camera=new THREE.PerspectiveCamera(32,640/720,.01,50);
let state={angle:params.get('angle')??'three',pose:params.get('pose')??'idle',emotion:(params.get('emotion')??'neutral') as Emotion,time:1.2};
function apply(rig:CharacterRig,style:ActorStyle,time:number){
 const seated=state.pose==='seated';const rising=state.pose==='stand_up';const verb=(seated?'idle':state.pose==='sit_down'?'sit':state.pose) as Verb;
 const emotion=state.pose==='laugh'?'happy':state.emotion;
 const face={emotion,lidClose:0,viseme:'rest' as const,visemeWeight:0,lookAt:(state.angle==='reference'?[3,3,6]:[camera.position.x,camera.position.y,camera.position.z]) as [number,number,number],browRaise:0};
 if(state.pose==='stand'){rig.apply(restFrame({bones:armsDown(.25),face}));return;}
 const ctx={actor:id,style,dur:4,t:time,dist:state.pose==='walk_to'?time*1.15:0,speed:1.15,turned:0,
 fromPosture:(seated||rising)?'sit' as const:'stand' as const,posture:(seated||state.pose==='sit_down')?'sit' as const:'stand' as const,emotion,targetLocal:[.4,.2,1] as [number,number,number],seat:0};
 const {layer,breathe}=evaluatePose(verb,time%4,{},ctx);
 rig.apply(restFrame({bones:layer.bones,hipsOffset:layer.hipsOffset,face:{...face,...layer.face},posture:ctx.posture,verb,
 secondary:{sway:.5+.2*Math.sin(time),jiggle:.5+.2*Math.cos(time),breathe}}));
}
function render(update:Partial<typeof state>={},capture=true){
 state={...state,...update};
 const close=state.angle==='face'||state.angle==='reference';const az=state.angle==='front'?0:state.angle==='side'?Math.PI/2:state.angle==='reference'?-.95:.55;
 const distance=close?1.9:4.5;const target=new THREE.Vector3(0,close?1.64:state.pose==='seated'?.73:1.03,close?.12:0);
 camera.position.set(Math.sin(az)*distance,target.y+distance*.045,Math.cos(az)*distance);camera.lookAt(target);
 renderer.setScissorTest(true);
 for(let i=0;i<2;i++){
  renderer.setViewport(i*640,0,640,720);renderer.setScissor(i*640,0,640,720);apply(rigs[i],i===0?oldStyle:STYLES[id],state.time);renderer.render(scenes[i],camera);
 }
 renderer.setScissorTest(false);
 return {png:capture?canvas.toDataURL('image/png'):undefined,state,variant};
}
const variants=document.querySelector<HTMLSelectElement>('#variant')!;variants.value=variant;
variants.onchange=()=>{params.set('variant',variants.value);location.search=params.toString()};
for(const key of ['pose','angle'] as const){const el=document.querySelector<HTMLSelectElement>('#'+key)!;el.value=state[key];el.onchange=()=>render({[key]:el.value})}
let playing=false,last=0;
function tick(now:number){if(!playing)return;if(last)state.time+=(now-last)/1000;last=now;render({},false);requestAnimationFrame(tick)}
document.querySelector<HTMLButtonElement>('#play')!.onclick=()=>{playing=!playing;last=0;document.querySelector('#play')!.textContent=playing?'Pause':'Play animation';if(playing)requestAnimationFrame(tick)};
(window as any).__wolfFidelity={render,rigs,scenes,renderer,camera};
render();(window as any).__ready=true;
