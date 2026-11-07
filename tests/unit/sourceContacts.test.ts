import {afterAll,beforeAll,describe,expect,it,vi} from 'vitest';
import {readFile} from 'node:fs/promises';
import sharp from 'sharp';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {MeshoptDecoder} from 'three/addons/libs/meshopt_decoder.module.js';
import {generatedRig} from '../../src/engine/characters/generated';
import {GENERATED_PROPORTIONS} from '../../src/engine/motion/generatedProportions';
import {addSourceContacts} from '../../src/engine/characters/sourceContacts';
import {restFrame} from '../../src/engine/characters/rig';
import {buildWolf} from '../../src/engine/characters/wolf';
import {evaluatePose,STYLES,type VerbCtx} from '../../src/engine/motion/library';
import type {CharacterRig} from '../../src/engine/api';
import type {ActorId,Vec3} from '../../src/shared/schema';
import {getFixture} from '../../src/director/fixtures';
import {compileEpisode} from '../../src/compiler/episode';
import {evaluate} from '../../src/engine/player/evaluate';
import {DEFAULT_REMIX} from '../../src/shared/schema';
const ids:ActorId[]=['bear','lady_bear','hare','rosie','squirrel','rival_bear','wolf_a','wolf_b'];
const signature=(rig:CharacterRig)=>{rig.root.updateMatrixWorld(true);const out:number[]=[];rig.root.traverse(o=>out.push(...o.matrixWorld.elements));return out;};
function clap(id:ActorId,time:number){const ctx:VerbCtx={actor:id,style:STYLES[id],t:time,dur:2.4,emotion:'happy',posture:'stand',fromPosture:'stand',speed:0,dist:0,turned:0,targetLocal:null,seat:0};const pose=evaluatePose('clap',time,{},ctx);return restFrame({verb:'clap',action:{time,duration:2.4},bones:pose.layer.bones,hipsOffset:pose.layer.hipsOffset});}
describe('contacts on actual cast surfaces',()=>{
 const rigs=new Map<ActorId,CharacterRig>();
 beforeAll(async()=>{
  vi.stubGlobal('self',globalThis);vi.stubGlobal('createImageBitmap',async(blob:Blob)=>{const{data,info}=await sharp(Buffer.from(await blob.arrayBuffer())).ensureAlpha().raw().toBuffer({resolveWithObject:true});return{width:info.width,height:info.height,data:new Uint8ClampedArray(data),close(){}};});
  for(const id of ids){let rig:CharacterRig;if(id==='wolf_a'||id==='wolf_b')rig=buildWolf(id==='wolf_a'?'a':'b');else{const data=await readFile(new URL(`../../public/assets/generated/${id}.glb`,import.meta.url)),g=await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength),'');rig=generatedRig(id,g.scene,{height:GENERATED_PROPORTIONS[id as keyof typeof GENERATED_PROPORTIONS].height});}expect(addSourceContacts(rig)).toBe(true);rigs.set(id,rig);}
 },60_000);
 afterAll(()=>{for(const rig of rigs.values())rig.dispose();vi.unstubAllGlobals();});
 for(const id of ids)it(`${id} meets with opposing pads, separates on release and restores sockets on seek`,()=>{
  const rig=rigs.get(id)!;rig.apply(restFrame());const original=signature(rig);
  for(const time of [.27,.30,.32]){rig.apply(clap(id,time));const c=rig.root.userData.contacts;expect(c.reachError).toBeLessThan(.001);expect(c.surfaceGap).toBeGreaterThanOrEqual(-.0001);expect(c.surfaceGap).toBeLessThan(.003);expect(c.palmNormalDot).toBeLessThan(-.9);expect(Math.min(...c.padOverlap)).toBeGreaterThan(.5);}
  rig.apply(clap(id,.6));expect(rig.root.userData.contacts.surfaceGap).toBeGreaterThan(.05*rig.height);
  rig.apply(restFrame({verb:'idle',holding:'flowers'}));expect(rig.handSocket.userData.preciseGrip).toBe(true);
  rig.apply(restFrame());expect(rig.handSocket.userData.preciseGrip).toBe(false);expect(signature(rig)).toEqual(original);
 });
 for(const id of ids)it(`${id} releases a prop at the measured surface and keeps its paw continuous when ownership changes`,()=>{
  const rig=rigs.get(id)!,yaw=.4,base=restFrame({verb:'take',holding:'flowers',pos:[2,0,-3],yaw});rig.apply(base);
  const q=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),yaw),normal=new THREE.Vector3(0,0,1).applyQuaternion(q);
  const target=rig.bones.RightArm.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(rig.height*.03,-rig.height*.03,rig.height*.06).applyQuaternion(q));
  const position=target.addScaledVector(normal,.0285).sub(new THREE.Vector3(0,.1,0).applyQuaternion(q)).toArray() as Vec3,putDown={item:'flowers' as const,position,rotation:[0,yaw,0] as Vec3,release:.5};
  rig.apply({...base,action:{time:.4,duration:.8},putDown});
  expect(rig.root.userData.contacts.reachError,id).toBeLessThan(.001);
  expect(rig.root.userData.contacts.releaseGap,id).toBeLessThan(.001);
  const attached=signature(rig),socketQ=rig.handSocket.getWorldQuaternion(new THREE.Quaternion());expect(socketQ.angleTo(q)).toBeLessThan(1e-6);
  rig.apply({...base,holding:null,action:{time:.4,duration:.8},putDown});expect(signature(rig)).toEqual(attached);
  rig.apply({...base,action:{time:.4-1e-4,duration:.8},putDown});const before=rig.bones.RightHand.getWorldPosition(new THREE.Vector3());
  rig.apply({...base,holding:null,action:{time:.4+1e-4,duration:.8},putDown});expect(rig.bones.RightHand.getWorldPosition(new THREE.Vector3()).distanceTo(before)).toBeLessThan(.0001);
  rig.apply({...base,action:{time:0,duration:.8},putDown});const entry=signature(rig);rig.apply(base);expect(signature(rig)).toEqual(entry);
  rig.apply({...base,holding:null,action:{time:.8,duration:.8},putDown});const exit=rig.bones.RightHand.getWorldPosition(new THREE.Vector3());rig.apply({...base,holding:null});expect(rig.bones.RightHand.getWorldPosition(new THREE.Vector3()).distanceTo(exit)).toBeLessThan(1e-9);
 });
 it('Bear enters the fishing grip and leaves it at the catch without snapping either paw',()=>{
  const f=getFixture('fishing_trip','en')!,tl=compileEpisode(f.paragraphs.map((p,i)=>({paragraphId:String(i),version:1,beatScript:p.beatScript,remix:DEFAULT_REMIX})),'en').timeline;
  const s=tl.segments.find(s=>s.segment.actorClips.bear.some(c=>c.verb==='fish'))!,clip=s.segment.actorClips.bear.find(c=>c.verb==='fish')!,rig=rigs.get('bear')!;
  const hands=(t:number)=>{rig.apply(evaluate(tl,t).actors.bear);return['LeftHand','RightHand'].map(name=>rig.bones[name].getWorldPosition(new THREE.Vector3()));};
  for(const phase of [0,.7,1]){
   const t=s.offset+clip.start+clip.dur*phase,a=hands(t-.0001),b=hands(t+.0001);
   for(let i=0;i<2;i++)expect(a[i].distanceTo(b[i]),`fish phase ${phase}, hand ${i}`).toBeLessThan(.001);
  }
 });
 it('Bear supports the rod with both paws in the real fishing story using world-space targets',()=>{
  const f=getFixture('fishing_trip','en')!,tl=compileEpisode(f.paragraphs.map((p,i)=>({paragraphId:String(i),version:1,beatScript:p.beatScript,remix:DEFAULT_REMIX})),'en').timeline;
  const s=tl.segments.find(s=>s.segment.actorClips.bear.some(c=>c.verb==='fish'))!,clip=s.segment.actorClips.bear.find(c=>c.verb==='fish')!;
  const frame=evaluate(tl,s.offset+clip.start+clip.dur*.5).actors.bear,rig=rigs.get('bear')!;rig.apply(frame);
  const c=rig.root.userData.contacts;expect(c.prop).toBe('fishing_rod');expect(c.secondaryReachError).toBeLessThan(.005);expect(new THREE.Vector3(...c.secondaryContact).distanceTo(new THREE.Vector3(...frame.pos))).toBeLessThan(3);
  expect(signature(rig).every(Number.isFinite)).toBe(true);
 });
});
