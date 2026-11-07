import {afterAll,beforeAll,describe,expect,it,vi} from 'vitest';
import {readFile} from 'node:fs/promises';
import sharp from 'sharp';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {MeshoptDecoder} from 'three/addons/libs/meshopt_decoder.module.js';
import {generatedRig} from '../../src/engine/characters/generated';
import {createGeneratedFace,GENERATED_FACE_PROFILES} from '../../src/engine/characters/generatedFace';
import {restFrame} from '../../src/engine/characters/rig';
import {buildWolf} from '../../src/engine/characters/wolf';
import {blendedMouthShape} from '../../src/engine/characters/face';
import {EMOTIONS,type ActorId} from '../../src/shared/schema';
import type {CharacterRig} from '../../src/engine/api';
const heights={bear:2.4,lady_bear:2.15,hare:.85,rosie:1.05,rival_bear:2.55,squirrel:.65};
function installPixels(){
 vi.stubGlobal('self',globalThis);vi.stubGlobal('createImageBitmap',async(blob:Blob)=>{const{data,info}=await sharp(Buffer.from(await blob.arrayBuffer())).ensureAlpha().raw().toBuffer({resolveWithObject:true});return{width:info.width,height:info.height,data:new Uint8ClampedArray(data),close(){}};});
 vi.stubGlobal('document',{createElement(){let image:any;return{width:0,height:0,getContext(){return{drawImage(p:any){image=p;},getImageData(){return image;}};}};}});
}
const signature=(root:THREE.Object3D)=>{const out:number[]=[];root.updateMatrixWorld(true);root.traverse(o=>{out.push(...o.matrixWorld.elements);const mesh=o as THREE.Mesh;if(mesh.isMesh){for(const value of mesh.geometry.attributes.position.array)out.push(value);out.push(...((mesh as THREE.SkinnedMesh).morphTargetInfluences??[]));}});return out;};

describe('actual generated animal faces',()=>{
 const rigs=new Map<ActorId,{rig:CharacterRig;face:NonNullable<ReturnType<typeof createGeneratedFace>>}>();
 beforeAll(async()=>{installPixels();for(const[id,height]of Object.entries(heights)){const data=await readFile(new URL(`../../public/assets/generated/${id}.glb`,import.meta.url));const gltf=await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength),'');const rig=generatedRig(id as ActorId,gltf.scene,{height});const meshes:THREE.SkinnedMesh[]=[];rig.root.traverse(o=>{if((o as THREE.SkinnedMesh).isSkinnedMesh)meshes.push(o as THREE.SkinnedMesh);});const face=createGeneratedFace(id as ActorId,meshes,rig.bones,rig.root)!;rigs.set(id as ActorId,{rig,face});}},60_000);
 afterAll(()=>{for(const{rig,face}of rigs.values()){face.dispose();rig.dispose();}vi.unstubAllGlobals();});
 for(const id of Object.keys(heights) as ActorId[])it(`${id} blinks over its actual eye surface and restores the exact expression after seeking`,()=>{
  const{rig,face}=rigs.get(id)!,profile=GENERATED_FACE_PROFILES[id]!,apply=(emotion:typeof EMOTIONS[number],blink=0,opacity=1)=>{const frame=restFrame({face:{emotion,lidClose:blink,viseme:'rest',visemeWeight:0,lookAt:null,browRaise:0},opacity});rig.apply(frame);face.update(frame);rig.root.updateMatrixWorld(true);};
  const shader={vertexShader:'#include <begin_vertex>',fragmentShader:'#include <map_fragment>',uniforms:{} as Record<string,{value:unknown}>};let body:THREE.SkinnedMesh|undefined;rig.root.traverse(o=>{if((o as THREE.SkinnedMesh).isSkinnedMesh)body=o as THREE.SkinnedMesh;});const source=(Array.isArray(body!.material)?body!.material[0]:body!.material);source.onBeforeCompile(shader as never,{} as never);
  apply('neutral');expect(shader.uniforms.animalBlink.value).toBe(0);const original=signature(rig.root);rig.root.traverse(o=>{const m=o as THREE.Mesh;if(m.isMesh)for(const attribute of [...Object.values(m.geometry.attributes),...(m.geometry.morphAttributes.position??[])])expect(Array.from(attribute.array).every(Number.isFinite)).toBe(true);});
  for(const emotion of EMOTIONS)for(const blink of [0,.5,1]){apply(emotion,blink);expect(signature(rig.root).every(Number.isFinite),`${emotion}/${blink}`).toBe(true);}
  apply('neutral',1);expect(shader.uniforms.animalBlink.value).toBe(1);const space=rig.root.getObjectByName(`${id}:facial-articulation`)!;
  for(const eye of profile.eyes){const at=space.localToWorld(new THREE.Vector3(eye.x,eye.y,eye.z)),front=new THREE.Vector3(0,0,1).transformDirection(space.matrixWorld),ray=new THREE.Raycaster(at.clone().addScaledVector(front,.15),front.negate());const hit=ray.intersectObject(rig.root,true).find(h=>(h.object as THREE.Mesh).isMesh);expect(hit?.object.name,`closed eyelid must cover ${id}'s pupil centre`).toMatch(/lid/);}
  apply('happy',.5,.4);space.traverse(o=>{const m=o as THREE.Mesh;if(m.isMesh){const material=m.material as THREE.Material;expect(material.opacity).toBe(.4);expect(material.depthWrite).toBe(false);}});
  apply('neutral');expect(signature(rig.root)).toEqual(original);expect(rig.root.userData.facialPerformance.activeVertices).toBeGreaterThan(20);
 });
});

it('procedural wolf expressions and canine jaw are seek deterministic',()=>{
 const rig=buildWolf('a'),a=restFrame({face:{emotion:'happy',lidClose:.2,viseme:'o',visemeWeight:.6,lookAt:null,browRaise:.1,emotionTransition:{from:'sad',progress:.3,fromWeights:{sad:.7,neutral:.3}}}});
 rig.apply(a);const first=signature(rig.root);rig.apply(restFrame({face:{...a.face,emotion:'angry',emotionTransition:undefined,lidClose:1}}));rig.apply(a);expect(signature(rig.root)).toEqual(first);rig.dispose();
});

it('the standalone canine jaw uses the same interrupted convex mouth blend',()=>{
 const base=restFrame().face,a=blendedMouthShape({...base,emotion:'happy'}),b=blendedMouthShape({...base,emotion:'sad'}),mixed=blendedMouthShape({...base,emotion:'surprised',emotionTransition:{from:'happy',progress:0,fromWeights:{happy:.4,sad:.6}}});
 for(const key of Object.keys(a) as (keyof typeof a)[])expect(mixed[key]).toBeCloseTo(a[key]*.4+b[key]*.6,10);
});
