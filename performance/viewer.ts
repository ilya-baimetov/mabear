import './style.css';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {MeshoptDecoder} from 'three/addons/libs/meshopt_decoder.module.js';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {generatedRig} from '../src/engine/characters/generated';
import type {ActorFrame,CharacterRig,PropFrame} from '../src/engine/api';
import {PROP_IDS,type PropId} from '../src/shared/schema';
import {studyFrame,studyBeat,type StudyMode} from './acting';
import mashaUrl from '../public/assets/generated/masha.glb?url';
import {createProps,type PropsHandle} from '../src/engine/props/props';
import {createMaterials} from '../src/engine/look';
import {captureComparison} from './capture';

const $=<T extends HTMLElement>(id:string)=>document.getElementById(id) as T;
const scenes:THREE.Scene[]=[],cameras:THREE.PerspectiveCamera[]=[],renderers:THREE.WebGLRenderer[]=[],controls:OrbitControls[]=[],rigs:CharacterRig[]=[];
const props:PropsHandle[]=[];
type Mode=StudyMode;
let mode:Mode='face',t=0,playing=true,last=performance.now(),ready=false,sync=false,recording=false;
const diagnostics:Record<string,unknown>={ready:false};
const captions:Record<string,string>={face:'Curiosity, delight, surprise and a mischievous smile. Watch the eyes, brows and mouth work together.',hold:'A stable grasp, then a deliberate hand-to-mouth motion. Inspect the grip from the side.',clap:'Palms meet, hold briefly, then separate. Slow playback exposes contact and penetration.'};
for(const id of ['before','after']){
 const host=$(id),r=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});r.setPixelRatio(Math.min(2,devicePixelRatio));r.outputColorSpace=THREE.SRGBColorSpace;r.toneMapping=THREE.ACESFilmicToneMapping;r.toneMappingExposure=1;r.shadowMap.enabled=true;r.shadowMap.type=THREE.PCFSoftShadowMap;host.append(r.domElement);renderers.push(r);
 const scene=new THREE.Scene();scene.background=new THREE.Color('#e7e9e0');scene.add(new THREE.HemisphereLight('#f5f8ff','#a4a58f',1.5));
 const key=new THREE.DirectionalLight('#fff2df',2.5);key.position.set(-2,3,4);key.castShadow=true;key.shadow.mapSize.set(2048,2048);Object.assign(key.shadow.camera,{left:-1,right:1,top:1.5,bottom:-1,near:.1,far:10});key.shadow.normalBias=.001;key.shadow.bias=-.00015;
 const fill=new THREE.DirectionalLight('#e3eaff',1);fill.position.set(3,2,3);const rim=new THREE.DirectionalLight('#fff4e8',1.4);rim.position.set(1,3,-3);scene.add(key,fill,rim);
 const floor=new THREE.Mesh(new THREE.PlaneGeometry(50,50),new THREE.MeshStandardMaterial({color:'#e7e9e0',roughness:1}));floor.rotation.x=-Math.PI/2;floor.position.y=-.003;floor.receiveShadow=true;scene.add(floor);scenes.push(scene);const p=createProps(createMaterials());props.push(p);scene.add(p.root);
 const cam=new THREE.PerspectiveCamera(30,1,.01,100);cam.position.set(0,.73,1.2);cameras.push(cam);const c=new OrbitControls(cam,r.domElement);c.target.set(0,.73,.03);c.minDistance=.4;c.maxDistance=4;c.update();controls.push(c);
 c.addEventListener('change',()=>{if(sync||controls.length!==2)return;sync=true;const j=1-controls.indexOf(c);cameras[j].position.copy(cam.position);controls[j].target.copy(c.target);controls[j].update();sync=false;});
 new ResizeObserver(()=>{r.setSize(host.clientWidth,host.clientHeight,false);cam.aspect=host.clientWidth/host.clientHeight;cam.updateProjectionMatrix();}).observe(host);
}
function frameAt(time:number):ActorFrame{return studyFrame(mode,time);}
function camera(name='front'){
 const full=name==='full',angle=name==='side'?1.15:name==='three'?.55:0,d=full?2.4:mode==='face'?1.22:name==='hands'?1.08:1.60,y=full?.51:mode==='face'?.76:name==='hands'?.56:.64;
 sync=true;for(let i=0;i<2;i++){cameras[i].position.set(Math.sin(angle)*d,y,Math.cos(angle)*d);controls[i].target.set(0,y,.03);controls[i].update();}sync=false;
}
function render(){const f=frameAt(t),propFrames=Object.fromEntries(PROP_IDS.map(id=>[id,{visible:id==='lollipop'&&mode==='hold',attachedTo:id==='lollipop'?'masha':null,pos:[0,0,0]}])) as Record<PropId,PropFrame>;rigs.forEach((r,i)=>{r.apply(f);props[i].apply(propFrames,{masha:r.handSocket},{masha:0});renderers[i].render(scenes[i],cameras[i]);});$<HTMLInputElement>('scrub').value=String(t);$('time').textContent=`${t.toFixed(2)} / 12 s`;diagnostics.time=t;diagnostics.mode=mode;$('beat').textContent=studyBeat(mode,t);}
function draw(){requestAnimationFrame(draw);const now=performance.now(),dt=Math.min(.05,(now-last)/1000);last=now;if(!ready||recording)return;if(playing)t=(t+dt*Number($<HTMLSelectElement>('speed').value))%12;render();}
async function init(){const loader=new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);for(let i=0;i<2;i++){const gltf=await loader.loadAsync(mashaUrl);const r=generatedRig('masha',gltf.scene,{height:1,mashaPerformance:i===1});scenes[i].add(r.root);rigs.push(r);}await document.fonts.ready;ready=true;diagnostics.ready=true;camera();$('caption').textContent=captions[mode];document.querySelectorAll<HTMLButtonElement|HTMLInputElement|HTMLSelectElement>('button,input,select').forEach(x=>x.disabled=false);}
$('play').onclick=()=>{playing=!playing;$('play').textContent=playing?'Pause':'Play';};$('restart').onclick=()=>{t=0;};$<HTMLInputElement>('scrub').oninput=e=>{t=Number((e.target as HTMLInputElement).value);playing=false;$('play').textContent='Play';};
function setMode(value:Mode){mode=value;t=0;document.querySelectorAll<HTMLButtonElement>('[data-scene]').forEach(x=>x.setAttribute('aria-pressed',String(x.dataset.scene===value)));$('caption').textContent=captions[mode];camera(mode==='hold'?'three':'front');}
document.querySelectorAll<HTMLButtonElement>('[data-scene]').forEach(b=>b.onclick=()=>{setMode(b.dataset.scene as Mode);playing=true;$('play').textContent='Pause';});
document.querySelectorAll<HTMLButtonElement>('[data-camera]').forEach(b=>b.onclick=()=>camera(b.dataset.camera));
async function record(){
 if(recording)throw new Error('A recording is already in progress.');
 recording=true;playing=false;document.querySelectorAll<HTMLButtonElement|HTMLInputElement|HTMLSelectElement>('button,input,select').forEach(x=>x.disabled=true);$('record').textContent='Recording…';
 try{return await captureComparison({renderers,cameras,setScene:(scene,view)=>{setMode(scene);camera(view);},renderAt:time=>{t=time;render();}});}
 finally{recording=false;setMode('face');t=0;playing=true;$('play').textContent='Pause';$('record').textContent='Save video';document.querySelectorAll<HTMLButtonElement|HTMLInputElement|HTMLSelectElement>('button,input,select').forEach(x=>x.disabled=false);}
}
$('record').onclick=async()=>{try{const blob=await record(),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`masha-before-after.${blob.type.includes('mp4')?'mp4':'webm'}`;a.click();setTimeout(()=>URL.revokeObjectURL(url),60_000);}catch(e){$('caption').textContent=(e as Error).message;}};
// Development/capture controls use the exact same renderer as the visible UI.
(window as any).__performance={diagnostics,rigs,scenes,cameras,renderers,frameAt,render,camera,record,setTime:(value:number)=>{t=value;playing=false;$('play').textContent='Play';if(ready)render();},setMode};
document.querySelectorAll<HTMLButtonElement|HTMLInputElement|HTMLSelectElement>('button,input,select').forEach(x=>x.disabled=true);
init().catch(e=>{$('caption').textContent='The model could not load. Reload this page to try again.';console.error(e);});draw();
