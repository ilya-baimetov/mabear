import {afterEach,expect,it,vi} from 'vitest';
import {readFile} from 'node:fs/promises';
import sharp from 'sharp';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {MeshoptDecoder} from 'three/addons/libs/meshopt_decoder.module.js';
import {generatedRig} from '../../src/engine/characters/generated';

afterEach(()=>vi.unstubAllGlobals());

it('releases the generated skeleton bone texture once when meshes share a skeleton',async()=>{
 vi.stubGlobal('self',globalThis);
 vi.stubGlobal('createImageBitmap',async(blob:Blob)=>{const{data,info}=await sharp(Buffer.from(await blob.arrayBuffer())).ensureAlpha().raw().toBuffer({resolveWithObject:true});return{width:info.width,height:info.height,data:new Uint8ClampedArray(data),close(){}};});
 const bytes=await readFile(new URL('../../public/assets/generated/bear.glb',import.meta.url));
 const {scene}=await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
 let source:THREE.SkinnedMesh|undefined;
 scene.traverse(o=>{if((o as THREE.SkinnedMesh).isSkinnedMesh)source=o as THREE.SkinnedMesh;});
 // Imported accessories may share the character skeleton with its main mesh.
 const accessory=source!.clone();accessory.geometry=source!.geometry.clone();source!.parent!.add(accessory);
 const rig=generatedRig('bear',scene,{height:2.4}),skeleton=source!.skeleton;
 expect(accessory.skeleton).toBe(skeleton);
 skeleton.computeBoneTexture();
 const texture=skeleton.boneTexture!,textureDispose=vi.fn();texture.addEventListener('dispose',textureDispose);
 const skeletonDispose=vi.spyOn(skeleton,'dispose');
 rig.dispose();
 expect(skeletonDispose).toHaveBeenCalledTimes(1);
 expect(textureDispose).toHaveBeenCalledTimes(1);
 expect(skeleton.boneTexture).toBeNull();
});
