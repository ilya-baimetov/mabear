import {readFile} from 'node:fs/promises';
import sharp from 'sharp';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {MeshoptDecoder} from 'three/addons/libs/meshopt_decoder.module.js';
import {generatedRig} from '../src/engine/characters/generated';
Object.assign(globalThis,{self:globalThis,createImageBitmap:async(blob:Blob)=>{const {data,info}=await sharp(Buffer.from(await blob.arrayBuffer())).ensureAlpha().raw().toBuffer({resolveWithObject:true});return {...info,data,close(){}};},document:{createElement(){let pixels:any;return {width:0,height:0,getContext(){return {drawImage(p:any){pixels=p;},getImageData(){return pixels;}};}};}}});
const data=await readFile('public/assets/generated/masha.glb');
const gltf=await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength),'');
const rig=generatedRig('masha',gltf.scene,{height:1}),p=new THREE.Vector3();
const bins:Record<string,{count:number;maxX:number;minZ:number;maxZ:number}>={};
rig.root.traverse(o=>{const m=o as THREE.SkinnedMesh;if(!m.isSkinnedMesh)return;
 const uv=m.geometry.getAttribute('uv'),tex=((Array.isArray(m.material)?m.material[0]:m.material) as THREE.MeshStandardMaterial).map!.image as any;
 for(let i=0;i<uv.count;i++){
  m.getVertexPosition(i,p).applyMatrix4(m.matrixWorld);if(p.y>.5)continue;
  const x=Math.round(uv.getX(i)*(tex.width-1)),y=Math.round(uv.getY(i)*(tex.height-1)),off=(y*tex.width+x)*4;
  const r=tex.data[off],g=tex.data[off+1],b=tex.data[off+2];if(!(r>g*1.1&&b>g*1.02))continue;
  const key=(Math.floor(p.y/.02)*.02).toFixed(2),bin=bins[key]??={count:0,maxX:0,minZ:Infinity,maxZ:-Infinity};
  bin.count++;bin.maxX=Math.max(bin.maxX,Math.abs(p.x));bin.minZ=Math.min(bin.minZ,p.z);bin.maxZ=Math.max(bin.maxZ,p.z);
 }
});
console.log(JSON.stringify({repaired:rig.root.userData.generated.dressVertices,bins},null,2));rig.dispose();
