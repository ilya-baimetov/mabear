import {afterAll,beforeAll,describe,expect,it,vi} from 'vitest';
import {readFile} from 'node:fs/promises';
import sharp from 'sharp';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {MeshoptDecoder} from 'three/addons/libs/meshopt_decoder.module.js';
import {repairSquirrelBind} from '../../src/engine/characters/squirrelBind';
import {generatedRig} from '../../src/engine/characters/generated';
import {restFrame} from '../../src/engine/characters/rig';
import {evaluate} from '../../src/engine/player/evaluate';
import {compileEpisode} from '../../src/compiler/episode';
import {getFixture} from '../../src/director/fixtures';
import {DEFAULT_REMIX} from '../../src/shared/schema';
import type {CharacterRig} from '../../src/engine/api';

const meshes=(root:THREE.Object3D)=>{const out:THREE.SkinnedMesh[]=[];root.traverse(o=>{if((o as THREE.SkinnedMesh).isSkinnedMesh)out.push(o as THREE.SkinnedMesh);});return out;};
async function source(){const bytes=await readFile(new URL('../../public/assets/generated/squirrel.glb',import.meta.url));return (await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'')).scene;}

describe('Squirrel anatomical bind repair on the actual GLB',()=>{
 let original:THREE.Group,repaired:THREE.Group,rig:CharacterRig;
 beforeAll(async()=>{
  vi.stubGlobal('self',globalThis);vi.stubGlobal('createImageBitmap',async(blob:Blob)=>{const {data,info}=await sharp(Buffer.from(await blob.arrayBuffer())).ensureAlpha().raw().toBuffer({resolveWithObject:true});return {width:info.width,height:info.height,data:new Uint8ClampedArray(data),close(){}};});
  original=await source();repaired=repairSquirrelBind(original);rig=generatedRig('squirrel',await source(),{height:.65});
 },30_000);
 afterAll(()=>{rig?.dispose();vi.unstubAllGlobals();});

 it('preserves the textured bind surface, normals and triangle topology',()=>{
  const before=meshes(original),after=meshes(repaired);expect(after).toHaveLength(before.length);
  let worstPosition=0,worstNormal=0;
  for(let j=0;j<before.length;j++){
   const a=before[j],b=after[j],normalMatrix=new THREE.Matrix3().getNormalMatrix(a.matrixWorld);
   expect(Array.from(b.geometry.index!.array)).toEqual(Array.from(a.geometry.index!.array));
   expect(Array.from(b.geometry.getAttribute('uv').array)).toEqual(Array.from(a.geometry.getAttribute('uv').array));
   expect(b.material).toBe(a.material);
   for(let i=0;i<a.geometry.getAttribute('position').count;i++){
    const pa=a.getVertexPosition(i,new THREE.Vector3()).applyMatrix4(a.matrixWorld),pb=b.getVertexPosition(i,new THREE.Vector3()).applyMatrix4(b.matrixWorld);
    worstPosition=Math.max(worstPosition,pa.distanceTo(pb));
    const na=new THREE.Vector3().fromBufferAttribute(a.geometry.getAttribute('normal'),i).applyNormalMatrix(normalMatrix),nb=new THREE.Vector3().fromBufferAttribute(b.geometry.getAttribute('normal'),i).normalize();
    worstNormal=Math.max(worstNormal,na.distanceTo(nb));
   }
  }
  expect(worstPosition).toBeLessThan(.00005);expect(worstNormal).toBeLessThan(.00001);
 });

 it('gives both real paws usable weights while keeping the tail independent of arm motion',()=>{
  const m=meshes(repaired)[0],index=m.geometry.getAttribute('skinIndex'),weights=m.geometry.getAttribute('skinWeight'),count=(name:string)=>{const joint=m.skeleton.bones.findIndex(b=>b.name===name);let count=0;for(let i=0;i<index.count;i++)for(let k=0;k<4;k++)if(index.getComponent(i,k)===joint&&weights.getComponent(i,k)>.7)count++;return count;};
  expect(count('LeftHand')).toBeGreaterThan(100);expect(count('RightHand')).toBeGreaterThan(100);expect(count('Tail')).toBeGreaterThan(50_000);
  const tail=m.skeleton.bones.findIndex(b=>b.name==='Tail'),samples:number[]=[];for(let i=0;i<index.count;i+=47)if(index.getX(i)===tail&&weights.getX(i)>.999)samples.push(i);
  const before=samples.map(i=>m.getVertexPosition(i,new THREE.Vector3()).toArray());
  for(const name of ['LeftArm','LeftForeArm','LeftHand','RightArm','RightForeArm','RightHand'])m.skeleton.bones.find(b=>b.name===name)!.rotation.set(.7,-.4,1);
  repaired.updateMatrixWorld(true);expect(samples.map(i=>m.getVertexPosition(i,new THREE.Vector3()).toArray())).toEqual(before);
  for(const bone of m.skeleton.bones)bone.quaternion.identity();repaired.updateMatrixWorld(true);
 });

 it('plays the compiled garden jump and clap without arm sheets and restores identical geometry after seeking',()=>{
  const story=getFixture('garden_party','en')!,{timeline}=compileEpisode(story.paragraphs.map((p,i)=>({paragraphId:`p${i}`,version:1,beatScript:p.beatScript,remix:DEFAULT_REMIX})),'en');
  const all=meshes(rig.root),bind=all.map(m=>Array.from({length:m.geometry.getAttribute('position').count},(_,i)=>m.getVertexPosition(i,new THREE.Vector3()).applyMatrix4(m.matrixWorld)));
  const sample=()=>all.flatMap(m=>Array.from({length:Math.ceil(m.geometry.getAttribute('position').count/67)},(_,n)=>m.getVertexPosition(n*67,new THREE.Vector3()).applyMatrix4(m.matrixWorld).toArray()).flat());
  rig.apply(restFrame());const initial=sample();
  for(const {segment,offset}of timeline.segments)for(const clip of segment.actorClips.squirrel.filter(c=>!c.params.ambient))for(const k of [.05,.3,.5,.75,.95]){
   const frame=evaluate(timeline,offset+clip.start+clip.dur*k).actors.squirrel;rig.apply(frame);expect(sample().every(Number.isFinite)).toBe(true);
   for(let j=0;j<all.length;j++){
    const mesh=all[j],g=mesh.geometry,positions=Array.from({length:g.getAttribute('position').count},(_,i)=>mesh.getVertexPosition(i,new THREE.Vector3()).applyMatrix4(mesh.matrixWorld));
    for(let i=0;i<g.index!.count;i+=3)for(let edge=0;edge<3;edge++){
     const a=g.index!.getX(i+edge),b=g.index!.getX(i+(edge+1)%3),restLength=bind[j][a].distanceTo(bind[j][b]),length=positions[a].distanceTo(positions[b]);
     // Bounds conspicuous sheets, including the first repair's 9cm hand web.
     expect(length,`${clip.verb} edge ${a}-${b}`).toBeLessThanOrEqual(Math.max(.055,restLength*2.5));
    }
   }
  }
  rig.apply(restFrame());expect(sample()).toEqual(initial);
 },30_000);
});
