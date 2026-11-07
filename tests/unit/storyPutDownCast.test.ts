import {afterAll,beforeAll,describe,expect,it,vi} from 'vitest';
import {readFile} from 'node:fs/promises';
import sharp from 'sharp';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {MeshoptDecoder} from 'three/addons/libs/meshopt_decoder.module.js';
import {generatedRig} from '../../src/engine/characters/generated';
import {addSourceContacts} from '../../src/engine/characters/sourceContacts';
import {buildWolf} from '../../src/engine/characters/wolf';
import {compileEpisode} from '../../src/compiler/episode';
import {evaluate} from '../../src/engine/player/evaluate';
import {DEFAULT_REMIX,type ActorId,type Beat,type BeatScript} from '../../src/shared/schema';
import {getFixture} from '../../src/director/fixtures';
import {restPlacement} from '../../src/engine/props/props';
import {walkHeightAt} from '../../src/engine/set/bearsYard';
import type {CharacterRig,ActorFrame} from '../../src/engine/api';

const heights={masha:1,bear:2.4,lady_bear:2.15,hare:.85,rosie:1.05,squirrel:.65,rival_bear:2.55,wolf_a:2.05,wolf_b:1.93};
type Pixels={width:number;height:number;data:Uint8ClampedArray};
function installPixels(){
 vi.stubGlobal('self',globalThis);
 vi.stubGlobal('createImageBitmap',async(blob:Blob)=>{const {data,info}=await sharp(Buffer.from(await blob.arrayBuffer())).ensureAlpha().raw().toBuffer({resolveWithObject:true});return {width:info.width,height:info.height,data:new Uint8ClampedArray(data),close(){}};});
 vi.stubGlobal('document',{createElement(name:string){if(name!=='canvas')throw new Error(`Unexpected DOM element ${name}`);let pixels:Pixels|undefined;return{width:0,height:0,getContext(){return{drawImage(image:Pixels){pixels=image;},getImageData(){if(!pixels)throw new Error('Canvas has not been drawn');return pixels;},createImageData(width:number,height:number){return{width,height,data:new Uint8ClampedArray(width*height*4)};},putImageData(image:Pixels){pixels=image;}};}};}});
}
function story(id:ActorId){
 const beat=(verb:Beat['verb'],overrides:Partial<Beat>={}):Beat=>({actor:id,verb,target:null,item:null,line:null,emote:null,sfx:null,emotion:'happy',with_previous:false,delay_s:0,shot:'close',...overrides});
 const beatScript:BeatScript={summary:'Take flowers and clap',time_of_day:'day',mood:'playful',music:{mood:'playful',intensity:'soft',change:'continue'},ambience:null,rule_hits:[],beats:[beat('take',{target:'flowers',item:'flowers'}),beat('clap')]};
 return compileEpisode([{paragraphId:'flowers',version:1,beatScript,remix:DEFAULT_REMIX}],'en').timeline;
}
function renderRig(rig:CharacterRig,frame:ActorFrame){
 const lift=walkHeightAt(frame.pos[0],frame.pos[2]);
 rig.apply(frame.putDown?{...frame,putDown:{...frame.putDown,position:[frame.putDown.position[0],frame.putDown.position[1]-lift,frame.putDown.position[2]]}}:frame);
 rig.root.position.y+=lift;rig.root.updateMatrixWorld(true);
 return {root:rig.root.getWorldPosition(new THREE.Vector3()),right:rig.bones.RightHand.getWorldPosition(new THREE.Vector3()),socket:rig.handSocket.getWorldPosition(new THREE.Vector3()),rotation:rig.handSocket.getWorldQuaternion(new THREE.Quaternion()),shoulder:rig.bones.RightArm.getWorldPosition(new THREE.Vector3()),metrics:{...rig.root.userData.contacts},lift};
}

describe('real compiled take-to-clap handoff across the cast',()=>{
 const rigs=new Map<ActorId,CharacterRig>();
 beforeAll(async()=>{
  installPixels();
  for(const [actor,height] of Object.entries(heights)){
   const id=actor as ActorId;let rig:CharacterRig;
   if(id==='wolf_a'||id==='wolf_b')rig=buildWolf(id==='wolf_a'?'a':'b');
   else{const data=await readFile(new URL(`../../public/assets/generated/${id}.glb`,import.meta.url));const gltf=await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength),'');rig=generatedRig(id,gltf.scene,{height,mashaPerformance:id==='masha',animalPerformance:id!=='masha'});}
   if(id!=='masha')expect(addSourceContacts(rig),id).toBe(true);
   rigs.set(id,rig);
  }
 },60_000);
 afterAll(()=>{for(const rig of rigs.values())rig.dispose();vi.unstubAllGlobals();});

 for(const id of Object.keys(heights) as ActorId[])it(`${id} reaches the actual resting prop before release and preserves the hand through it`,()=>{
  const timeline=story(id),rig=rigs.get(id)!,segment=timeline.segments[0],clips=segment.segment.actorClips[id],clip=clips.find(c=>c.params.putDown)!;
  expect(clip,id).toBeDefined();
  const release=segment.offset+clip.start+clip.dur*.5,beforeFrame=evaluate(timeline,release-.0001),afterFrame=evaluate(timeline,release+.0001);
  expect(beforeFrame.actors[id].holding).toBe('flowers');expect(beforeFrame.props.flowers.attachedTo).toBe(id);
  expect(afterFrame.actors[id].holding).toBeNull();expect(afterFrame.props.flowers.attachedTo).toBeNull();expect(afterFrame.props.flowers.visible).toBe(true);
  const rest=restPlacement('flowers',afterFrame.props.flowers.pos),target=new THREE.Vector3(...rest.pos),before=renderRig(rig,beforeFrame.actors[id]);
  const context=JSON.stringify({id,mark:clip.params.putDown,root:before.root.toArray(),shoulder:before.shoulder.toArray(),target:rest.pos,metrics:before.metrics});
  expect(beforeFrame.actors[id].putDown!.position).toEqual(rest.pos);
  expect(before.root.toArray()).toEqual([beforeFrame.actors[id].pos[0],beforeFrame.actors[id].pos[1]+before.lift,beforeFrame.actors[id].pos[2]]);
  expect(before.socket.distanceTo(target),context).toBeLessThan(.001);
  expect(before.rotation.angleTo(new THREE.Quaternion().setFromEuler(new THREE.Euler(...rest.rot,'YXZ'))),context).toBeLessThan(.001);
  const after=renderRig(rig,afterFrame.actors[id]);
  expect(before.right.distanceTo(after.right),context).toBeLessThan(.001);
  expect(before.socket.distanceTo(after.socket),context).toBeLessThan(.001);
  for(const boundary of [clip.start,clip.start+clip.dur]){
   const a=renderRig(rig,evaluate(timeline,segment.offset+boundary-.0001).actors[id]),b=renderRig(rig,evaluate(timeline,segment.offset+boundary+.0001).actors[id]);
   expect(a.right.distanceTo(b.right),`${id} right paw at ${boundary}`).toBeLessThan(.003);
  }
  const clap=clips.find(c=>c.verb==='clap')!;expect(evaluate(timeline,segment.offset+clap.start+.3).actors[id].holding).toBeNull();
  renderRig(rig,evaluate(timeline,segment.offset+clap.start+.3).actors[id]);
  const sought=renderRig(rig,beforeFrame.actors[id]);expect(sought.socket.toArray()).toEqual(before.socket.toArray());expect(sought.right.toArray()).toEqual(before.right.toArray());
 });

 it('Masha puts down the pan onto its rendered resting transform in the actual pancake story',()=>{
  const fixture=getFixture('pancake_morning','en')!,timeline=compileEpisode(fixture.paragraphs.map((p,i)=>({paragraphId:`p${i}`,version:1,beatScript:p.beatScript,remix:DEFAULT_REMIX})),'en').timeline;
  const segment=timeline.segments.find(s=>s.segment.actorClips.masha.some(c=>c.params.putDown&&c.params.item==='frying_pan'))!,clip=segment.segment.actorClips.masha.find(c=>c.params.putDown&&c.params.item==='frying_pan')!,release=segment.offset+clip.start+clip.dur*.5;
  const a=evaluate(timeline,release-.0001),b=evaluate(timeline,release+.0001),rig=rigs.get('masha')!,before=renderRig(rig,a.actors.masha),after=renderRig(rig,b.actors.masha),rest=restPlacement('frying_pan',b.props.frying_pan.pos);
  expect(a.props.frying_pan.attachedTo).toBe('masha');expect(b.props.frying_pan.attachedTo).toBeNull();
  expect(before.socket.distanceTo(new THREE.Vector3(...rest.pos))).toBeLessThan(.001);
  expect(before.rotation.angleTo(new THREE.Quaternion().setFromEuler(new THREE.Euler(...rest.rot,'YXZ')))).toBeLessThan(.001);
  expect(before.right.distanceTo(after.right)).toBeLessThan(.001);
 });
});
