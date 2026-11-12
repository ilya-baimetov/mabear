import {afterAll,beforeAll,describe,expect,it,vi} from 'vitest';
import {readFile} from 'node:fs/promises';
import sharp from 'sharp';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {MeshoptDecoder} from 'three/addons/libs/meshopt_decoder.module.js';
import {generatedRig} from '../../src/engine/characters/generated';
import {GENERATED_PROPORTIONS} from '../../src/engine/motion/generatedProportions';
import {addSourceContacts} from '../../src/engine/characters/sourceContacts';
import {applyCarryContacts} from '../../src/engine/characters/carryContacts';
import {applyHugContacts} from '../../src/engine/characters/hugContacts';
import {compileEpisode} from '../../src/compiler/episode';
import {initialWorldState} from '../../src/compiler/worldState';
import {getFixture} from '../../src/director/fixtures';
import {evaluate} from '../../src/engine/player/evaluate';
import {DEFAULT_REMIX,type ActorId} from '../../src/shared/schema';
import {HAMMOCK_SUPPORT,hammockClothHeight,hammockLocal,hammockTiming,hugSpacing,interactionRadius} from '../../src/shared/physicalInteractions';
import type {CharacterRig} from '../../src/engine/api';
import recordings from '../../src/shared/recordedSpeech.json';
import {speechKey,type SpeechRecording} from '../../src/shared/speech';
const speechDurations=Object.fromEntries((recordings as SpeechRecording[]).map(r=>[speechKey(r.text,r.lang),r.duration]));

const compile=(name:'pancake_morning'|'bears_nap'|'fishing_trip',lang:'en'|'ru'='en')=>{const f=getFixture(name,lang)!;return compileEpisode(f.paragraphs.map((p,i)=>({paragraphId:String(i),version:1,beatScript:p.beatScript,remix:DEFAULT_REMIX})),lang,undefined,speechDurations).timeline;};
describe('body-safe story interactions',()=>{
 it('settles in place when Bear is already seated on the hammock',()=>{
  const fixture=getFixture('bears_nap','en')!,sleep=fixture.paragraphs.flatMap(p=>p.beatScript.beats).find(b=>b.actor==='bear'&&b.verb==='sleep')!,state=initialWorldState();
  state.actors.bear={...state.actors.bear,pos:[-11,2],mark:'hammock',facing:.8,posture:'sit'};
  const tl=compileEpisode([{paragraphId:'seated',version:1,beatScript:{...fixture.paragraphs[0].beatScript,beats:[sleep]},remix:DEFAULT_REMIX}],'en',state).timeline,s=tl.segments[0].segment;
  expect(s.actorClips.bear.some(c=>c.verb==='walk_to'||c.verb==='stand_up')).toBe(false);
  const clip=s.actorClips.bear.find(c=>c.verb==='sleep')!;expect(clip.params.to).toBeUndefined();
  for(const phase of [0,.5,.999]){const frame=evaluate(tl,clip.start+clip.dur*phase);expect(frame.actors.bear.pos).toEqual([-11,0,2]);}
  expect(s.endState.actors.bear.posture).toBe('sleep');expect(s.endState.actors.bear.mark).toBe('hammock');
 });
 it('waits for a busy partner before beginning the reciprocal hug',()=>{
  const fixture=getFixture('pancake_morning','en')!,hug=fixture.paragraphs.flatMap(p=>p.beatScript.beats).find(b=>b.verb==='hug')!,state=initialWorldState();
  state.actors.bear={...state.actors.bear,pos:[5,0],mark:null,posture:'stand'};state.actors.masha={...state.actors.masha,pos:[-3,0],mark:null,posture:'stand'};
  const beats=[{...hug,actor:'bear' as const,verb:'walk_to' as const,target:'clearing' as const,line:null,with_previous:false},{...hug,actor:'masha' as const,target:'bear' as const,line:null,with_previous:true}];
  const tl=compileEpisode([{paragraphId:'busy',version:1,beatScript:{...fixture.paragraphs[0].beatScript,beats},remix:DEFAULT_REMIX}],'en',state).timeline,s=tl.segments[0].segment;
  const walk=s.actorClips.bear.find(c=>c.verb==='walk_to')!,masha=s.actorClips.masha.find(c=>c.verb==='hug')!,bear=s.actorClips.bear.find(c=>c.verb==='hug')!;
  expect(masha.start).toBeGreaterThanOrEqual(walk.start+walk.dur);expect(bear.start).toBe(masha.start);expect(bear.dur).toBe(masha.dur);
 });
 it('wakes beside the hammock and preserves that clear position after the action',()=>{
  const tl=compile('bears_nap'),segment=tl.segments.find(s=>s.segment.actorClips.bear.some(c=>c.verb==='wake_up'))!,clip=segment.segment.actorClips.bear.find(c=>c.verb==='wake_up')!,start=segment.offset+clip.start;
  expect(clip.params.to).toBeDefined();expect(Math.cos(clip.params.facing!-HAMMOCK_SUPPORT.yaw)).toBeCloseTo(-1,2);
  const beginning=evaluate(tl,start+.001).actors.bear,middle=evaluate(tl,start+clip.dur*.80).actors.bear,after=evaluate(tl,start+clip.dur+.05).actors.bear;
  expect(Math.hypot(beginning.pos[0]+11,beginning.pos[2]-2)).toBeLessThan(.001);
  expect(Math.abs(hammockLocal([middle.pos[0],middle.pos[2]])[1])-interactionRadius('bear')).toBeGreaterThan(HAMMOCK_SUPPORT.halfWidth+.25);
  expect(after.pos[0]).toBeCloseTo(clip.params.to![0],4);expect(after.pos[2]).toBeCloseTo(clip.params.to![1],4);
  expect(segment.segment.endState.actors.bear.mark).toBe(null);
 });
 it('approaches at torso clearance and does not collapse the roots after the hug',()=>{
  const tl=compile('pancake_morning'),s=tl.segments.find(s=>s.segment.actorClips.masha.some(c=>c.verb==='hug'))!,clip=s.segment.actorClips.masha.find(c=>c.verb==='hug')!;
  for(const dt of [0,.3,1,1.9,2.2]){const f=evaluate(tl,s.offset+clip.start+dt),a=f.actors.masha.pos,b=f.actors.bear.pos;expect(Math.hypot(a[0]-b[0],a[2]-b[2])).toBeGreaterThanOrEqual(hugSpacing('masha','bear')-.005);}
  expect(evaluate(tl,s.offset+clip.start+clip.dur+.1).actors.masha.interaction).toBeUndefined();
 });
 for(const story of ['pancake_morning','bears_nap','fishing_trip'] as const)it(`${story} finishes both planted turns before hug contact starts`,()=>{
  const tl=compile(story),s=tl.segments.find(s=>s.segment.actorClips.masha.some(c=>c.verb==='hug'))!,clip=s.segment.actorClips.masha.find(c=>c.verb==='hug')!;
  for(const dt of [0,.1,.2,.35,.5,.8,1,1.7,clip.dur-.001]){
   const f=evaluate(tl,s.offset+clip.start+dt);
   for(const [id,partner]of [['bear','masha'],['masha','bear']] as const){
    const a=f.actors[id],b=f.actors[partner],dx=b.pos[0]-a.pos[0],dz=b.pos[2]-a.pos[2],dot=(Math.sin(a.yaw)*dx+Math.cos(a.yaw)*dz)/Math.hypot(dx,dz);
    expect(dot,`${story} ${id} facing at hug +${dt}s`).toBeGreaterThan(.999);
   }
  }
 });
 for(const lang of ['en','ru'] as const)it(`${lang} preserves the catch before a seated, empty-handed fishing hug`,()=>{
  const tl=compile('fishing_trip',lang),s=tl.segments.find(s=>s.segment.actorClips.masha.some(c=>c.verb==='hug'))!,clips=s.segment.actorClips.bear,fish=clips.find(c=>c.verb==='fish')!,drop=clips.find(c=>c.params.putDown==='pier'&&c.params.item==='fish')!,hug=clips.find(c=>c.verb==='hug')!;
  expect(fish.params.catchesFish).toBe(true);expect(hug.params.posture).toBe('sit');expect(drop.start+drop.dur).toBeLessThanOrEqual(hug.start);
  expect(evaluate(tl,s.offset+fish.start+fish.dur*.69).actors.bear.holding).toBe('fishing_rod');
  expect(evaluate(tl,s.offset+fish.start+fish.dur*.71).actors.bear.holding).toBe('fish');
  expect(evaluate(tl,s.offset+drop.start+drop.dur*.49).props.fish.attachedTo).toBe('bear');
  expect(evaluate(tl,s.offset+drop.start+drop.dur*.51).props.fish.attachedTo).toBe(null);
  for(const dt of [0,.35,1,hug.dur-.001,hug.dur+.05]){const f=evaluate(tl,s.offset+hug.start+dt);expect(f.actors.bear.posture).toBe('sit');expect(f.actors.bear.pos).toEqual([-5.5,0,9.5]);expect(f.actors.bear.holding).toBe(null);expect(f.actors.masha.holding).toBe(null);}
  for(const id of ['bear','masha'] as const){const track=s.segment.actorClips[id].filter(c=>!c.params.ambient);for(let i=1;i<track.length;i++)expect(track[i].start).toBeGreaterThanOrEqual(track[i-1].start+track[i-1].dur-.001);}
 });
 it('routes the child around the hammock and trunks to meet Bear on the far side',()=>{
  const tl=compile('bears_nap'),s=tl.segments.find(s=>s.segment.actorClips.masha.some(c=>c.verb==='hug'))!,walk=s.segment.actorClips.masha.find(c=>c.verb==='walk_to'&&c.params.target==='bear')!;
  expect(walk.params.path!.length).toBeGreaterThan(2);
  const path=walk.params.path!;
  for(let i=1;i<path.length;i++)for(let n=0;n<=20;n++){
   const k=n/20,p:[number,number]=[path[i-1][0]+(path[i][0]-path[i-1][0])*k,path[i-1][1]+(path[i][1]-path[i-1][1])*k],local=hammockLocal(p);
   expect(hammockClothHeight(p)).toBe(null);
   for(const x of [-2.1,2.1])expect(Math.hypot(local[0]-x,local[1])).toBeGreaterThan(.30+interactionRadius('masha')-.002);
  }
 });
 for(const lang of ['en','ru'] as const)it(`${lang} carries the child around the hammock instead of through its cloth and end trees`,()=>{
  const tl=compile('bears_nap',lang),clips=tl.segments.flatMap(s=>s.segment.actorClips.bear.map(c=>({...c,start:s.offset+c.start}))),carry=clips.find(c=>c.verb==='carry')!,walk=clips.find(c=>c.verb==='walk_to'&&c.start>=carry.start+carry.dur-.001)!;
  expect(walk.params.path!.length).toBeGreaterThan(2);
  const radius=interactionRadius('bear');
  for(let dt=0;dt<=walk.dur;dt+=.025){
   const p=evaluate(tl,walk.start+dt).actors.bear.pos,local=hammockLocal([p[0],p[2]]);
   for(const x of [-2.1,2.1])expect(Math.hypot(local[0]-x,local[1]),`trunk at +${dt}`).toBeGreaterThan(radius+.30);
   for(let i=0;i<16;i++){const angle=i*Math.PI/8;expect(hammockClothHeight([p[0]+Math.cos(angle)*radius,p[2]+Math.sin(angle)*radius]),`cloth at +${dt}`).toBe(null);}
  }
 });
});

describe('hug contacts on shipped characters',()=>{
 const rigs={} as Record<ActorId,CharacterRig>;
 beforeAll(async()=>{
  vi.stubGlobal('self',globalThis);vi.stubGlobal('createImageBitmap',async(blob:Blob)=>{const{data,info}=await sharp(Buffer.from(await blob.arrayBuffer())).ensureAlpha().raw().toBuffer({resolveWithObject:true});return{width:info.width,height:info.height,data:new Uint8ClampedArray(data),close(){}};});
  vi.stubGlobal('document',{createElement(){let pixels:any;return{width:0,height:0,getContext(){return{drawImage(image:any){pixels=image;},getImageData(){return pixels;},createImageData(width:number,height:number){return{width,height,data:new Uint8ClampedArray(width*height*4)};},putImageData(image:any){pixels=image;}};}};}});
  for(const id of ['masha','bear'] as const){const data=await readFile(new URL(`../../public/assets/generated/${id}.glb`,import.meta.url)),g=await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength),'');rigs[id]=generatedRig(id,g.scene,{height:GENERATED_PROPORTIONS[id].height,mashaPerformance:id==='masha'});if(id==='bear')expect(addSourceContacts(rigs[id])).toBe(true);}
 },60_000);
 afterAll(()=>{Object.values(rigs).forEach(r=>r.dispose());vi.unstubAllGlobals();});
 for(const story of ['pancake_morning','bears_nap','fishing_trip'] as const)it(`${story} puts both actors palms on the partner and releases deterministically`,()=>{
  const tl=compile(story),s=tl.segments.find(s=>s.segment.actorClips.masha.some(c=>c.verb==='hug'))!,clip=s.segment.actorClips.masha.find(c=>c.verb==='hug')!,start=s.offset+clip.start;
  const render=(t:number)=>{const frame=evaluate(tl,t);for(const [id,rig]of Object.entries(rigs))rig.apply(frame.actors[id as ActorId]);applyHugContacts(rigs,frame);return Object.values(rigs).flatMap(r=>Object.values(r.bones).flatMap(b=>b.quaternion.toArray()));};
  const pose=render(start+1);
  for(const id of ['masha','bear'] as const){const c=rigs[id].root.userData.hugContacts;expect(c).toBeDefined();expect(c.touches).toHaveLength(2);for(const t of c.touches){expect(t.error,`${id} reach ${JSON.stringify(c)}`).toBeLessThan(.01);expect(t.gap,`${id} surface ${JSON.stringify(c)}`).toBeLessThan(.015);}}
  render(start+3);for(const rig of Object.values(rigs))expect(rig.root.userData.hugContacts).toBeUndefined();
  expect(render(start+1)).toEqual(pose);expect(pose.every(Number.isFinite)).toBe(true);
 });
 it('seats the rider on the shipped nape and keeps ankles/paws fitted through gestures, walking, turns and reverse seeks',()=>{
  const tl=compile('bears_nap'),s=tl.segments.find(s=>s.segment.actorClips.bear.some(c=>c.verb==='carry'))!,clip=s.segment.actorClips.bear.find(c=>c.verb==='carry')!,start=s.offset+clip.start;
  const at=(t:number)=>{const f=evaluate(tl,t);for(const[id,r]of Object.entries(rigs))r.apply(f.actors[id as ActorId]);applyCarryContacts(rigs,f);return{f,pose:Object.values(rigs).flatMap(r=>[...r.root.position.toArray(),...Object.values(r.bones).flatMap(b=>b.quaternion.toArray())]),contact:structuredClone(rigs.masha.root.userData.carryContacts)};};
  for(const dt of [1.8,2.5,3.3,4,5,6,7,8]){
   const snapshot=at(start+dt),c=snapshot.contact;expect(c,`carry +${dt}`).toBeDefined();
   expect(new THREE.Vector3(...c.seat).distanceTo(new THREE.Vector3(...c.riderSeat)),`seat +${dt}`).toBeLessThan(.006);
   expect(c.legs).toHaveLength(2);for(const l of c.legs)expect(l.error,`leg +${dt}`).toBeLessThan(.005);
   for(const p of c.supports)expect(p.gap,`paw +${dt}`).toBeLessThan(.02);
   const clap=snapshot.f.actors.masha.verb==='clap';if(clap)expect(rigs.masha.root.userData.contacts.mode).toBe('clap');
   at(start+.5);expect(at(start+dt).pose).toEqual(snapshot.pose);expect(snapshot.pose.every(Number.isFinite)).toBe(true);
  }
 });
 it('reaches the child before lifting and maintains supporting paws through the overhead transfer',()=>{
  const tl=compile('bears_nap'),s=tl.segments.find(s=>s.segment.actorClips.bear.some(c=>c.verb==='carry'))!,clip=s.segment.actorClips.bear.find(c=>c.verb==='carry')!,start=s.offset+clip.start;
  for(let dt=.6;dt<=1.85;dt+=.025){const f=evaluate(tl,start+dt);for(const[id,r]of Object.entries(rigs))r.apply(f.actors[id as ActorId]);applyCarryContacts(rigs,f);const c=rigs.masha.root.userData.carryContacts;for(const p of c.supports)expect(p.gap,`lift +${dt.toFixed(2)}`).toBeLessThan(.065);}
 });
 it('leaves the fitted shoulder seat without a first-frame root pop',()=>{
  const fixture=getFixture('bears_nap','en')!,template=fixture.paragraphs.flatMap(p=>p.beatScript.beats).find(b=>b.verb==='carry')!,state=initialWorldState();state.actors.bear={...state.actors.bear,pos:[0,0],posture:'stand',mark:null};state.actors.masha={...state.actors.masha,pos:[0,.65],posture:'stand',mark:null};
  const beats=[template,{...template,actor:'masha' as const,verb:'walk_to' as const,target:'garden' as const}];
  const tl=compileEpisode([{paragraphId:'dismount',version:1,beatScript:{...fixture.paragraphs[0].beatScript,beats},remix:DEFAULT_REMIX}],'en',state).timeline,s=tl.segments[0].segment,exit=s.actorClips.masha.find(c=>c.verb==='walk_to')!;
  const at=(time:number)=>{const f=evaluate(tl,time);for(const[id,r]of Object.entries(rigs))r.apply(f.actors[id as ActorId]);applyCarryContacts(rigs,f);return rigs.masha.bones.Hips.getWorldPosition(new THREE.Vector3());};
  expect(at(exit.start-.001).distanceTo(at(exit.start+.001)),`exit ${JSON.stringify(exit)}`).toBeLessThan(.04);
 });
 it('places the caught fish on the pier before releasing the measured paw',()=>{
  const tl=compile('fishing_trip'),s=tl.segments.find(s=>s.segment.actorClips.bear.some(c=>c.params.putDown==='pier'&&c.params.item==='fish'))!,drop=s.segment.actorClips.bear.find(c=>c.params.putDown==='pier'&&c.params.item==='fish')!,frame=evaluate(tl,s.offset+drop.start+drop.dur*.5).actors.bear;
  const local={...frame,putDown:{...frame.putDown!,position:[frame.putDown!.position[0],frame.putDown!.position[1]-.28,frame.putDown!.position[2]] as [number,number,number]}};
  rigs.bear.apply(local);const contact=rigs.bear.root.userData.contacts;
  expect(contact.mode).toBe('putDown');expect(contact.strength).toBe(1);expect(contact.releaseGap,JSON.stringify(contact)).toBeLessThan(.03);
 });
 it('keeps support before takeoff and after touchdown, with only a brief ballistic flight',()=>{
  const tl=compile('bears_nap'),rig=rigs.bear,meshes:THREE.SkinnedMesh[]=[];rig.root.traverse(o=>{if((o as THREE.SkinnedMesh).isSkinnedMesh)meshes.push(o as THREE.SkinnedMesh);});
  const at=(time:number)=>{const actor=evaluate(tl,time).actors.bear;rig.apply(actor);let floor=Infinity,cloth=Infinity;for(const mesh of meshes)for(let i=0;i<mesh.geometry.attributes.position.count;i+=6){const p=mesh.getVertexPosition(i,new THREE.Vector3()).applyMatrix4(mesh.matrixWorld),h=hammockClothHeight([p.x,p.z]);floor=Math.min(floor,p.y);if(h!==null)cloth=Math.min(cloth,p.y-h);}return{actor,floor,cloth};};
  for(const verb of ['sleep','wake_up']){
   const s=tl.segments.find(s=>s.segment.actorClips.bear.some(c=>c.verb===verb))!,clip=s.segment.actorClips.bear.find(c=>c.verb===verb)!,start=s.offset+clip.start,mount=verb==='sleep',{launch,land}=hammockTiming(mount,clip.dur);
   expect(land-launch).toBeLessThanOrEqual(.65);
   const first=at(start+.001).actor.pos,last=at(start+land+.01).actor.pos;
   for(const time of [launch*.25,launch*.65,launch-.001]){const sample=at(start+time);expect(sample.actor.pos).toEqual(first);expect(Math.abs(mount?sample.floor:sample.cloth),JSON.stringify({verb,time,sample})).toBeLessThan(mount?.04:.095);}
   for(const time of [land+.01,land+.1,Math.min(clip.dur-.001,land+.25)]){const sample=at(start+time);expect(sample.actor.pos).toEqual(last);expect(Math.abs(mount?sample.cloth:sample.floor),JSON.stringify({verb,time,sample})).toBeLessThan(mount?.095:.04);}
   // Horizontal flight has constant velocity; it cannot drift sideways while
   // holding a seated pose before takeoff or after the landing.
   const positions=[.2,.4,.6,.8].map(k=>at(start+launch+(land-launch)*k).actor.pos);
   const steps=positions.slice(1).map((p,i)=>Math.hypot(p[0]-positions[i][0],p[2]-positions[i][2]));
   expect(Math.max(...steps)-Math.min(...steps)).toBeLessThan(.001);
  }
 });
 it('keeps the actual Bear surface above the cloth through mounting, rest and dismount',()=>{
  const tl=compile('bears_nap'),rig=rigs.bear,meshes:THREE.SkinnedMesh[]=[];rig.root.traverse(o=>{if((o as THREE.SkinnedMesh).isSkinnedMesh)meshes.push(o as THREE.SkinnedMesh);});
  const clearances:{verb:string;phase:number;clearance:number}[]=[];
  for(const verb of ['sleep','wake_up']){
   const s=tl.segments.find(s=>s.segment.actorClips.bear.some(c=>c.verb===verb))!,clip=s.segment.actorClips.bear.find(c=>c.verb===verb)!;
   for(const phase of Array.from({length:61},(_,i)=>Math.min(.999,i/60))){
    rig.apply(evaluate(tl,s.offset+clip.start+clip.dur*phase).actors.bear);
    let clearance=Infinity;
    for(const mesh of meshes)for(let i=0;i<mesh.geometry.attributes.position.count;i+=6){const p=mesh.getVertexPosition(i,new THREE.Vector3()).applyMatrix4(mesh.matrixWorld),height=hammockClothHeight([p.x,p.z]);if(height!==null)clearance=Math.min(clearance,p.y-height);}
    clearances.push({verb,phase,clearance});
   }
  }
  expect(Math.min(...clearances.map(c=>c.clearance)),JSON.stringify(clearances)).toBeGreaterThan(-.018);
 });
});
