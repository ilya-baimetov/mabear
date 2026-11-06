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
