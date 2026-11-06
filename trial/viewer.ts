import './style.css';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { buildMasha } from '../src/engine/characters/masha';
import { restFrame } from '../src/engine/characters/rig';
import { evaluatePose, STYLES } from '../src/engine/motion/library';
import { makeSetup, retargetFrame, BONES, SKELETON, type SourcePoseWorld, type RetargetSetup } from '../src/engine/motion/retarget';
import { qmul, qinv, IDENTITY } from '../src/engine/motion/blend';
import type { ActorFrame, Quat } from '../src/engine/api';

const el = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const current = buildMasha();
const currentHolder = new THREE.Group(); currentHolder.add(current.root);
const candidateHolder = new THREE.Group();
const renderers: THREE.WebGLRenderer[] = [];
const cameras: THREE.PerspectiveCamera[] = [];
const controls: OrbitControls[] = [];
const scenes: THREE.Scene[] = [];
const worlds = [currentHolder, candidateHolder];
type FootSample = {mesh:THREE.Mesh,index:number};
const footSamples:FootSample[][]=[[],[]];
function collectFeet(root:THREE.Object3D):FootSample[]{
  root.updateMatrixWorld(true);const result:FootSample[]=[],p=new THREE.Vector3();
  root.traverse(o=>{const mesh=o as THREE.Mesh;if(!mesh.isMesh)return;
    for(let index=0;index<mesh.geometry.attributes.position.count;index++){
      mesh.getVertexPosition(index,p).applyMatrix4(mesh.matrixWorld);if(p.y<.14)result.push({mesh,index});
    }
  });return result;
}
function groundFeet(root:THREE.Object3D,samples:FootSample[]){
  root.updateMatrixWorld(true);const p=new THREE.Vector3();let low=Infinity;
  for(const {mesh,index} of samples){mesh.getVertexPosition(index,p).applyMatrix4(mesh.matrixWorld);low=Math.min(low,p.y);}
  if(Number.isFinite(low)){root.position.y-=low;root.updateMatrixWorld(true);}
}
let syncing = false;

for (let i = 0; i < 2; i++) {
  const view = el(i ? 'candidate' : 'current');
  const r = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  r.setPixelRatio(Math.min(devicePixelRatio, 2));
  r.outputColorSpace = THREE.SRGBColorSpace;
  r.toneMapping = THREE.ACESFilmicToneMapping;
  r.toneMappingExposure = 1;
  r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap;
  view.append(r.domElement); renderers.push(r);
  const scene = new THREE.Scene(); scene.background = new THREE.Color('#e9ede6');
  scene.add(new THREE.HemisphereLight('#f8fbff', '#a5a18a', 2.1));
  const key = new THREE.DirectionalLight('#fff3e4', 2.8); key.position.set(-2.2, 3.2, 3);
  key.castShadow = true; key.shadow.mapSize.set(2048, 2048);
  Object.assign(key.shadow.camera, {left:-1.4,right:1.4,top:1.6,bottom:-1,near:0.1,far:10});
  key.shadow.bias = -0.0002; key.shadow.normalBias = 0.002; key.shadow.radius = 3;
  const fill = new THREE.DirectionalLight('#dde8ff', .7); fill.position.set(2,1,3);
  const rim = new THREE.DirectionalLight('#fff8ee', 1.5); rim.position.set(2,2,-3);
  scene.add(key,fill,rim);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(200,200),new THREE.MeshStandardMaterial({color:'#e9ede6',roughness:1}));
  floor.rotation.x=-Math.PI/2; floor.position.y=-.005; floor.receiveShadow=true;scene.add(floor,worlds[i]);
  scenes.push(scene);
  const camera = new THREE.PerspectiveCamera(29,1,.01,100); cameras.push(camera);
  camera.position.set(0,.62,2.55);
  const control = new OrbitControls(camera,r.domElement); control.target.set(0,.53,0);
  control.minDistance=.35;control.maxDistance=5;control.maxPolarAngle=Math.PI*.56;control.enablePan=true;control.update();
  controls.push(control);
  control.addEventListener('change',()=>{
    if(syncing || controls.length<2)return;
    syncing=true; const j=1-i;
    cameras[j].position.copy(camera.position);cameras[j].quaternion.copy(camera.quaternion);
    controls[j].target.copy(control.target);controls[j].update();syncing=false;
  });
  new ResizeObserver(()=>{ const w=view.clientWidth,h=view.clientHeight;r.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();}).observe(view);
}

let model: THREE.Group;
let mixer: THREE.AnimationMixer;
const clips: Record<string,THREE.AnimationClip> = {};
let activeAction: THREE.AnimationAction | undefined;
let setup: RetargetSetup;
let map: Record<string,string> = {};
const bones: Record<string,THREE.Bone> = {};
const localRest = new Map<THREE.Bone,{q:THREE.Quaternion,p:THREE.Vector3}>();
let ready=false, playing=true, t=0, last=performance.now(), mode='game_walk';
let wire=false;
const diagnostics: Record<string,unknown> = {ready:false};
(window as unknown as {trial:unknown}).trial={diagnostics};

function capture(): SourcePoseWorld {
  model.updateMatrixWorld(true);
  const rot:SourcePoseWorld['rot']={},pos:SourcePoseWorld['pos']={};
  for(const [name,b] of Object.entries(bones)) {
    rot[name]=b.getWorldQuaternion(new THREE.Quaternion()).toArray() as Quat;
    pos[name]=b.getWorldPosition(new THREE.Vector3()).toArray() as [number,number,number];
  }
  return {rot,pos};
}
function stats(root:THREE.Object3D) {
  let triangles=0,meshes=0,morphs=0,joints=0;
  root.traverse(o=>{const m=o as THREE.Mesh;if(m.isMesh){meshes++;triangles+=(m.geometry.index?.count??m.geometry.attributes.position.count)/3;morphs+=Object.keys(m.morphTargetDictionary??{}).length;}if((o as THREE.Bone).isBone)joints++;});
  return {triangles:Math.round(triangles),meshes,joints,morphs};
}
function updateMetrics(){
  const a=stats(current.root),b=stats(model);diagnostics.current=a;diagnostics.candidate=b;
  el('current-metrics').textContent=`${a.triangles.toLocaleString()} triangles · ${a.joints} joints · animated eyes & mouth`;
  el('candidate-metrics').textContent=`${b.triangles.toLocaleString()} triangles · ${b.joints} joints · ${b.morphs} facial morphs`;
}

async function init(){
  const loader=new GLTFLoader();
  const rig=await loader.loadAsync('/models/masha-rigged.glb');model=rig.scene;
  model.traverse(o=>{if((o as THREE.Bone).isBone)bones[o.name]=o as THREE.Bone;const mesh=o as THREE.Mesh;if(mesh.isMesh){mesh.castShadow=true;mesh.receiveShadow=true;mesh.frustumCulled=false;}});
  // Meshy may preserve Mixamo prefixes; record the exact correspondence for this asset.
  for(const canonical of BONES){const n=Object.keys(bones).find(n=>n.replace(/^mixamorig[:_]?/i,'')===canonical);if(n)map[canonical]=n;}
  // This Meshy rig names its spine from the neck downward, unlike Mixamo.
  if(bones.Spine02&&bones.Spine01&&bones.neck)Object.assign(map,{Spine:'Spine02',Spine1:'Spine01',Spine2:'Spine',Neck:'neck'});
  if(!map.Hips||!map.Head||!map.LeftArm||!map.RightArm)throw Error('Generated skeleton needs an explicit bone map: '+Object.keys(bones).join(', '));
  model.updateMatrixWorld(true);
  const rawSetup=makeSetup(map,capture());
  candidateHolder.quaternion.fromArray(rawSetup.C);candidateHolder.add(model);candidateHolder.updateMatrixWorld(true);
  const box=new THREE.Box3().setFromObject(candidateHolder,true),height=box.max.y-box.min.y;
  candidateHolder.scale.setScalar(1/height);candidateHolder.position.set(-(box.min.x+box.max.x)/2/height,-box.min.y/height,-(box.min.z+box.max.z)/2/height);
  candidateHolder.updateMatrixWorld(true);
  for(const b of Object.values(bones))localRest.set(b,{q:b.quaternion.clone(),p:b.position.clone()});
  setup=makeSetup(map,capture());mixer=new THREE.AnimationMixer(model);
  current.apply(restFrame());footSamples[0]=collectFeet(currentHolder);footSamples[1]=collectFeet(candidateHolder);
  const animations=await Promise.all(['walk','run'].map(async name=>{const data=await loader.loadAsync(`/models/${name}-armature.glb`);if(!data.animations[0])throw Error(`No animation in ${name} GLB`);clips[name]=data.animations[0];return {name,duration:clips[name].duration,tracks:clips[name].tracks.length};}));
  diagnostics.animations=animations;diagnostics.mapping=map;diagnostics.height=height;diagnostics.modelScale=candidateHolder.scale.x;
  updateMetrics();ready=true;diagnostics.ready=true;el('loading').remove();
  el('limitations').textContent='The candidate has static eyes and smile, and no facial controls. The auto-rig bends the dress with the legs; it has no cloth simulation. A substantial modeling upgrade, with facial rigging and clothing work still needed.';
  setMode('game_walk');
}

function reset(){
  for(const [b,r] of localRest){b.quaternion.copy(r.q);b.position.copy(r.p);}
  currentHolder.position.set(0,0,0);candidateHolder.position.y=Number(diagnostics.baseY??candidateHolder.position.y);
  candidateHolder.updateMatrixWorld(true);
}
function gameFrame(time:number,verb:'idle'|'wave'|'walk_to'|'run_to'):ActorFrame{
  const speed=verb==='run_to'?1.4:.65;
  const {layer,breathe}=evaluatePose(verb,time,{}, {actor:'masha',style:STYLES.masha,dur:6,emotion:'happy',t:time,dist:time*speed,speed,turned:0,fromPosture:'stand',posture:'stand',targetLocal:null,seat:0});
  const f=restFrame({bones:layer.bones,hipsOffset:layer.hipsOffset,verb,secondary:{breathe,sway:layer.sway??0,jiggle:0}});
  f.face={...f.face,...layer.face,emotion:'happy',lidClose:(time%3.2)>.0&&(time%3.2)<.15?Math.sin(time%3.2/.15*Math.PI):0};
  if(mode==='talk'){const vowels=['open_wide','e','o'] as const;f.face.viseme=vowels[Math.floor(time*2)%3];f.face.visemeWeight=.45+.55*Math.sin(time*9)**2;f.face.browRaise=.25*Math.sin(time*3);}
  return f;
}

/** Inverse of the game's world-space rest-aware retargeter. Never apply local rotations blindly. */
function applyGameToCandidate(frame:ActorFrame){
  reset();model.updateMatrixWorld(true);
  const globals:Record<string,Quat>={};
  for(const name of BONES){const parent=SKELETON[name];globals[name]=parent?qmul(globals[parent],frame.bones[name]??IDENTITY):frame.bones[name]??IDENTITY;
    const b=bones[map[name]];if(!b)continue;
    const delta=qmul(globals[name],qinv(setup.F[name]));
    const world=qmul(qmul(qmul(qinv(setup.C),delta),setup.C),setup.restRot[name]);
    const parentQ=b.parent!.getWorldQuaternion(new THREE.Quaternion()).invert();
    b.quaternion.copy(parentQ.multiply(new THREE.Quaternion().fromArray(world)));b.updateWorldMatrix(false,true);
  }
  const hip=bones[map.Hips],r=localRest.get(hip)!;
  const desired=hip.parent!.localToWorld(r.p.clone()).add(new THREE.Vector3(...frame.hipsOffset).multiplyScalar(setup.hipHeight/STYLES.masha.hipHeight));
  hip.position.copy(hip.parent!.worldToLocal(desired));model.updateMatrixWorld(true);
}

function setMode(next:string){
  mode=next;t=0;activeAction?.stop();activeAction=undefined;
  if(!ready)return;
  if(diagnostics.baseY===undefined)diagnostics.baseY=candidateHolder.position.y;
  reset();
  if(clips[mode]){activeAction=mixer.clipAction(clips[mode]);activeAction.reset().play();}
  const duration=clips[mode]?.duration??6;
  el<HTMLInputElement>('timeline').max=String(duration);
  el('motion-note').textContent=clips[mode]?`Same Meshy ${mode} clip on both meshes. Retargeted, in place, with sole contact normalized.`:mode==='rest'?'Bind-pose comparison. The current model uses a T-pose; the candidate uses an A-pose.':mode==='talk'?'Same head motion. Current Masha blinks and speaks; the generated face has no facial controls.':'The existing game motion on both skeletons, with rest-pose correction and sole contact normalized.';
}

function frame(){
  requestAnimationFrame(frame);
  const now=performance.now(),dt=Math.min((now-last)/1000,.1);last=now;
  if(ready){
    const duration=clips[mode]?.duration??6;if(playing)t=(t+dt*Number(el<HTMLSelectElement>('speed').value))%duration;
    if(activeAction){
      reset();mixer.setTime(t);model.updateMatrixWorld(true);
      const pose=retargetFrame(setup,capture());
      // Keep both models in place. Only the source clip's vertical motion is retained.
      const h=bones[map.Hips],rest=localRest.get(h)!;
      const animated=h.getWorldPosition(new THREE.Vector3());
      const origin=h.parent!.localToWorld(rest.p.clone());
      const vertical=animated.y-origin.y;
      h.position.copy(h.parent!.worldToLocal(new THREE.Vector3(origin.x,animated.y,origin.z)));model.updateMatrixWorld(true);
      current.apply(restFrame({bones:pose.bones,hipsOffset:[0,vertical*STYLES.masha.hipHeight/setup.hipHeight,0],verb:mode}));
    }else if(mode==='rest'){
      reset();current.apply(restFrame());
    }else{
      const f=gameFrame(t,mode==='wave'?'wave':mode==='game_walk'?'walk_to':mode==='game_run'?'run_to':'idle');current.apply(f);applyGameToCandidate(f);
    }
    // Retargeted legs have different proportions. Normalize sole contact in this inspection viewer.
    groundFeet(currentHolder,footSamples[0]);groundFeet(candidateHolder,footSamples[1]);
    el<HTMLInputElement>('timeline').value=String(t);el('time').textContent=t.toFixed(2)+' s';
    diagnostics.time=t;diagnostics.mode=mode;
  }else current.apply(gameFrame(0,'idle'));
  renderers.forEach((r,i)=>r.render(scenes[i],cameras[i]));
}

el('play').onclick=()=>{playing=!playing;el('play').textContent=playing?'Pause':'Play';el('play').setAttribute('aria-pressed',String(playing));};
el<HTMLSelectElement>('motion').onchange=e=>setMode((e.target as HTMLSelectElement).value);
el<HTMLInputElement>('timeline').oninput=e=>{t=Number((e.target as HTMLInputElement).value);playing=false;el('play').textContent='Play';el('play').setAttribute('aria-pressed','false');};
el('wire').onclick=()=>{wire=!wire;el('wire').setAttribute('aria-pressed',String(wire));worlds.forEach(root=>root.traverse(o=>{const m=o as THREE.Mesh;for(const material of Array.isArray(m.material)?m.material:[m.material]){if(material&&'wireframe' in material)(material as THREE.MeshStandardMaterial).wireframe=wire;}}));};
document.querySelectorAll<HTMLButtonElement>('[data-angle]').forEach(button=>button.onclick=()=>{
  document.querySelectorAll('[data-angle]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));
  const name=button.dataset.angle,angle=name==='side'?Math.PI/2:name==='back'?Math.PI:name==='three'?.55:0;
  const face=name==='face',distance=face?1.3:2.55,target=face?.78:.53;
  syncing=true;
  cameras.forEach((camera,i)=>{camera.position.set(Math.sin(angle)*distance,target+(face?0:.09),Math.cos(angle)*distance);controls[i].target.set(0,target,.03);controls[i].update();});
  syncing=false;
});
init().catch(error=>{console.error(error);el('loading').textContent='Could not load the candidate: '+error.message;diagnostics.error=error.message;});
el('record').onclick=()=>{
  if(!ready)return;
  const button=el<HTMLButtonElement>('record');button.disabled=true;button.textContent='Recording…';
  const canvas=document.createElement('canvas');canvas.width=1440;canvas.height=900;
  const ctx=canvas.getContext('2d')!;
  const stream=canvas.captureStream(24),chunks:Blob[]=[];
  const mime=MediaRecorder.isTypeSupported('video/webm;codecs=vp9')?'video/webm;codecs=vp9':'video/webm';
  const recorder=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:5000000});
  let capturing=true;
  const paint=()=>{
    ctx.fillStyle='#f4f2ec';ctx.fillRect(0,0,1440,900);
    ctx.fillStyle='#25352f';ctx.font='600 25px sans-serif';ctx.fillText('CURRENT · Game Masha',32,46);ctx.fillText('CANDIDATE · Meshy 7.1',752,46);
    renderers.forEach((r,i)=>{const source=r.domElement,aspect=source.width/source.height;const w=Math.min(700,760*aspect),h=w/aspect;ctx.drawImage(source,i*720+(720-w)/2,72+(760-h)/2,w,h);});
    ctx.font='18px sans-serif';ctx.fillText(`${el<HTMLSelectElement>('motion').selectedOptions[0].text} · live 3D · matched camera and lighting`,32,866);
    ctx.font='15px sans-serif';ctx.fillText('Candidate: body rig only; no blinking or lip sync',1000,866);
    if(capturing)requestAnimationFrame(paint);
  };paint();
  recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};
  recorder.onstop=()=>{capturing=false;stream.getTracks().forEach(t=>t.stop());const link=el<HTMLAnchorElement>('recording');if(link.href.startsWith('blob:'))URL.revokeObjectURL(link.href);link.href=URL.createObjectURL(new Blob(chunks,{type:'video/webm'}));link.hidden=false;button.disabled=false;button.textContent='Record 8s';};
  playing=true;el('play').textContent='Pause';el('play').setAttribute('aria-pressed','true');
  recorder.start();setTimeout(()=>recorder.stop(),8000);
};
frame();
