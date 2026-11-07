import {afterAll,beforeAll,describe,expect,it,vi} from 'vitest';
import {readFile} from 'node:fs/promises';
import sharp from 'sharp';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {MeshoptDecoder} from 'three/addons/libs/meshopt_decoder.module.js';
import {generatedRig} from '../../src/engine/characters/generated';
import {restFrame} from '../../src/engine/characters/rig';
import type {CharacterRig} from '../../src/engine/api';
import {evaluatePose,STYLES,type VerbCtx} from '../../src/engine/motion/library';
import {getFixture} from '../../src/director/fixtures';
import {compileEpisode} from '../../src/compiler/episode';
import {evaluate} from '../../src/engine/player/evaluate';
import {DEFAULT_REMIX} from '../../src/shared/schema';

type Pixels={width:number;height:number;data:Uint8ClampedArray};

/** Decode the real GLB textures without a WebGL context. The production bake
 * reads/writes pixels only; this shim implements those canvas operations. */
function installPixelCanvas(){
 vi.stubGlobal('self',globalThis);
 vi.stubGlobal('createImageBitmap',async(blob:Blob)=>{
  const {data,info}=await sharp(Buffer.from(await blob.arrayBuffer())).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  return {width:info.width,height:info.height,data:new Uint8ClampedArray(data),close(){}};
 });
 vi.stubGlobal('document',{createElement(name:string){
  if(name!=='canvas')throw new Error(`Unexpected DOM element: ${name}`);
  let pixels:Pixels|undefined;
  const canvas={width:0,height:0,getContext(){return {
   drawImage(image:Pixels){pixels=image;},
   getImageData(){if(!pixels)throw new Error('Canvas has not been drawn');return pixels;},
   createImageData(width:number,height:number){return {width,height,data:new Uint8ClampedArray(width*height*4)};},
   putImageData(image:Pixels){pixels=image;},
  };}};
  return canvas;
 }});
}

describe('Masha performance on the shipped GLB',()=>{
 let rig:CharacterRig;
 beforeAll(async()=>{
  installPixelCanvas();
  const data=await readFile(new URL('../../public/assets/generated/masha.glb',import.meta.url));
  const gltf=await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength),'');
  rig=generatedRig('masha',gltf.scene,{height:1,mashaPerformance:true});
 },30_000);
 afterAll(()=>{rig?.dispose();vi.unstubAllGlobals();});

 it('fades the rebuilt face together with the source body and restores it when seeking',()=>{
  const face=rig.root.getObjectByName('masha:articulated-face')!;
  const materials=new Set<THREE.Material>();
  face.traverse(object=>{
   const mesh=object as THREE.Mesh;
   if(mesh.isMesh)for(const material of Array.isArray(mesh.material)?mesh.material:[mesh.material])materials.add(material);
  });
  expect(materials.size).toBeGreaterThan(5);
  for(const opacity of [.5,0,1]){
   rig.apply(restFrame({opacity}));
   for(const material of materials){
    expect(material.opacity,`${material.type} at actor opacity ${opacity}`).toBe(opacity);
    if(opacity<1)expect(material.transparent,`${material.type} must participate in fades`).toBe(true);
    expect(material.depthWrite,`${material.type} must match the fading body depth policy`).toBe(opacity>.98);
   }
  }
 });

 it('preserves contacts across postures and clears the prior hold when seeking',()=>{
  const frame=(verb:Parameters<typeof evaluatePose>[0],time:number,holding:'lollipop'|null,posture:VerbCtx['posture']='stand')=>{
   const ctx:VerbCtx={actor:'masha',style:STYLES.masha,t:time,dur:12,emotion:'neutral',posture,fromPosture:posture,speed:0,dist:0,turned:0,targetLocal:null,seat:0};
   const pose=evaluatePose(verb,time,{},ctx);
   return restFrame({bones:pose.layer.bones,hipsOffset:pose.layer.hipsOffset,verb,holding,posture,action:{time,duration:12}});
  };
  const signature=()=>{
   const values:number[]=[];
   rig.root.traverse(object=>{
    values.push(...object.matrixWorld.elements);
    const mesh=object as THREE.SkinnedMesh;
    if(mesh.isMesh){for(const value of mesh.geometry.getAttribute('position').array)values.push(value);values.push(...(mesh.morphTargetInfluences??[]));}
   });
   return values;
  };
  const f=frame('idle',0,null);rig.apply(f);const original=signature();
  for(const [verb,time,holding] of [['eat',1.5,'lollipop'],['clap',.3,null],['eat',0,'lollipop'],['idle',1,'lollipop']] as const)rig.apply(frame(verb,time,holding));
  rig.apply(f);expect(signature()).toEqual(original);
  for(const posture of ['stand','sit','sleep','carried'] as const){
   for(const verb of ['idle','eat','clap'] as const){
    for(const time of [0,.3,.7,1.5,2.3,3]){
     rig.apply(frame(verb,time,'lollipop',posture));
     const contact=rig.root.userData.contacts,error=contact.reachError??Math.abs(contact.palmSeparation-contact.targetSeparation);
     expect(error,`${verb}, ${posture}, ${time}s must reach its contact within 1 mm`).toBeLessThan(.001);
    }
   }
  }
 });
});

describe('main Masha clothing on the shipped GLB',()=>{
 let rig:CharacterRig;
 const hemEdges:{mesh:THREE.SkinnedMesh;a:number;b:number;length:number}[]=[];
 const lowerEdges:{mesh:THREE.SkinnedMesh;a:number;b:number;length:number}[]=[];
 afterAll(()=>{rig?.dispose();vi.unstubAllGlobals();});
 it('preserves sleeve, hand and tights weights while repairing the skirt without enabling the facial candidate',async()=>{
  installPixelCanvas();
  const data=await readFile(new URL('../../public/assets/generated/masha.glb',import.meta.url));
  const gltf=await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength),'');
  const source=new Map<THREE.SkinnedMesh,{indices:number[];weights:number[]}>();
  gltf.scene.traverse(object=>{const mesh=object as THREE.SkinnedMesh;if(mesh.isSkinnedMesh){
   const index=mesh.geometry.getAttribute('skinIndex'),weight=mesh.geometry.getAttribute('skinWeight');
   source.set(mesh,{indices:Array.from({length:index.count*4},(_,i)=>index.getComponent(Math.floor(i/4),i%4)),weights:Array.from({length:weight.count*4},(_,i)=>weight.getComponent(Math.floor(i/4),i%4))});
  }});
  rig=generatedRig('masha',gltf.scene,{height:1});
  expect(rig.root.getObjectByName('masha:articulated-face')).toBeUndefined();
  expect(rig.root.userData.generated.dressVertices).toBeGreaterThan(100);
  const p=new THREE.Vector3();let protectedCount=0,tightsCount=0;
  for(const [mesh,before] of source){
   const index=mesh.geometry.getAttribute('skinIndex'),weight=mesh.geometry.getAttribute('skinWeight');
   for(let i=0;i<index.count;i++){
    mesh.getVertexPosition(i,p).applyMatrix4(mesh.matrixWorld);
    if(p.y<.08||p.y>.49||Math.abs(p.x)>.115+(.49-p.y)*.30){
     protectedCount++;
     for(let k=0;k<4;k++){
      expect(index.getComponent(i,k),`outside skirt vertex ${i} joint ${k}`).toBe(before.indices[i*4+k]);
      expect(weight.getComponent(i,k),`outside skirt vertex ${i} weight ${k}`).toBeCloseTo(before.weights[i*4+k],7);
     }
    }
   }
   // Independently inspected tights on both source legs, including hidden
   // magenta-textured faces that formerly tore visible shins onto the lap.
   if(index.count>70161)for(const i of [10139,10152,8173,44072,44073,44074,70161,46407]){
    tightsCount++;
    for(let k=0;k<4;k++){
     expect(index.getComponent(i,k),`tights vertex ${i} joint ${k}`).toBe(before.indices[i*4+k]);
     expect(weight.getComponent(i,k),`tights vertex ${i} weight ${k}`).toBeCloseTo(before.weights[i*4+k],7);
    }
    const drape=mesh.geometry.morphAttributes.position![2];
    expect([drape.getX(i),drape.getY(i),drape.getZ(i)],`tights vertex ${i} must not follow the skirt morph`).toEqual([0,0,0]);
   }
  }
  expect(protectedCount).toBeGreaterThan(1000);
  expect(tightsCount).toBe(8);
  for(const mesh of source.keys()){
   const index=mesh.geometry.index!,positions:THREE.Vector3[]=[];
   for(let i=0;i<mesh.geometry.getAttribute('position').count;i++)positions.push(mesh.getVertexPosition(i,new THREE.Vector3()).applyMatrix4(mesh.matrixWorld));
   // Measured outer hem landmarks exclude both shoes and inner leggings.
   const hem=(v:THREE.Vector3)=>v.y>=.08&&v.y<.17&&(Math.abs(v.x)>.13||v.z>.11||v.z<-.1);
   for(let i=0;i<index.count;i+=3)for(let k=0;k<3;k++){
    const a=index.getX(i+k),b=index.getX(i+(k+1)%3),length=positions[a].distanceTo(positions[b]);
    if(hem(positions[a])&&hem(positions[b])&&length>.00001)hemEdges.push({mesh,a,b,length});
    if(positions[a].y<.18&&positions[b].y<.18&&length>.0001)lowerEdges.push({mesh,a,b,length});
   }
  }
 },30_000);
 it('places the measured pelvis above a raised seat',()=>{
  const ctx:VerbCtx={actor:'masha',style:STYLES.masha,t:2,dur:2,emotion:'neutral',posture:'sit',fromPosture:'sit',speed:0,dist:0,turned:0,targetLocal:null,seat:.47};
  const pose=evaluatePose('idle',1,{},ctx);
  rig.apply(restFrame({bones:pose.layer.bones,hipsOffset:pose.layer.hipsOffset,posture:'sit'}));
  expect(rig.bones.Hips.getWorldPosition(new THREE.Vector3()).y).toBeCloseTo(.47+.04*STYLES.masha.hipHeight,3);
  expect(hemEdges.length).toBeGreaterThan(100);
  for(const edge of hemEdges){
   const a=edge.mesh.getVertexPosition(edge.a,new THREE.Vector3()).applyMatrix4(edge.mesh.matrixWorld),b=edge.mesh.getVertexPosition(edge.b,new THREE.Vector3()).applyMatrix4(edge.mesh.matrixWorld);
   expect(a.distanceTo(b)/edge.length,`seated hem edge ${edge.a}-${edge.b} must not tear away with a thigh`).toBeCloseTo(1,4);
  }
  for(const edge of lowerEdges){
   const a=edge.mesh.getVertexPosition(edge.a,new THREE.Vector3()).applyMatrix4(edge.mesh.matrixWorld),b=edge.mesh.getVertexPosition(edge.b,new THREE.Vector3()).applyMatrix4(edge.mesh.matrixWorld);
   expect(a.distanceTo(b),`lower-leg edge ${edge.a}-${edge.b} must not stretch into the lap`).toBeLessThanOrEqual(Math.max(.018,edge.length*3));
  }
 });
 it('keeps both dangling feet in front of the actual chair throughout the eating sample',()=>{
  const fixture=getFixture('cozy_evening','en')!;
  const {timeline}=compileEpisode(fixture.paragraphs.map((p,i)=>({paragraphId:`p${i}`,version:1,beatScript:p.beatScript,remix:DEFAULT_REMIX})),'en');
  const segment=timeline.segments.find(s=>s.segment.actorClips.masha.some(c=>c.verb==='eat'))!;
  const clip=segment.segment.actorClips.masha.find(c=>c.verb==='eat')!;
  const chairFront=-5.32;
  for(const offset of [.1,.45,1,1.45,2]){
   rig.apply(evaluate(timeline,segment.offset+clip.start+offset).actors.masha);
   expect(rig.bones.Hips.getWorldPosition(new THREE.Vector3()).z).toBeLessThan(chairFront);
   for(const name of ['LeftFoot','RightFoot'])expect(rig.bones[name].getWorldPosition(new THREE.Vector3()).z,`${name} at ${offset}s must clear the cushion front`).toBeGreaterThan(chairFront+.01);
  }
 });
 it('restores the standing mesh when seeking backwards from a seated shot',()=>{
  const sample=()=>{
   const values:number[]=[];
   rig.root.traverse(object=>{const mesh=object as THREE.SkinnedMesh;if(!mesh.isSkinnedMesh)return;
    for(let i=0;i<mesh.geometry.getAttribute('position').count;i+=137)
     values.push(...mesh.getVertexPosition(i,new THREE.Vector3()).applyMatrix4(mesh.matrixWorld).toArray());
   });
   return values;
  };
  const standing=restFrame();rig.apply(standing);const before=sample();
  const ctx:VerbCtx={actor:'masha',style:STYLES.masha,t:2,dur:2,emotion:'neutral',posture:'sit',fromPosture:'sit',speed:0,dist:0,turned:0,targetLocal:null,seat:.47};
  const pose=evaluatePose('idle',1,{},ctx);
  rig.apply(restFrame({bones:pose.layer.bones,hipsOffset:pose.layer.hipsOffset,posture:'sit'}));
  expect(sample()).not.toEqual(before);
  rig.apply(standing);expect(sample()).toEqual(before);
 });
});
