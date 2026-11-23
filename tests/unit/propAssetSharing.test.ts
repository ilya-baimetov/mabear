import * as THREE from 'three';
import {beforeEach,describe,expect,it,vi} from 'vitest';
import {CARROT_IDS} from '../../src/shared/schema';
import {loadPropOverrides,type AssetEntry} from '../../src/engine/assets';

const loader=vi.hoisted(()=>({loadAsync:vi.fn()}));
vi.mock('three/examples/jsm/loaders/GLTFLoader.js',()=>({GLTFLoader:class{
 setMeshoptDecoder(){return this;}
 loadAsync(url:string){return loader.loadAsync(url);}
}}));
function source(){
 const scene=new THREE.Group(),material=new THREE.MeshStandardMaterial({map:new THREE.Texture()});
 scene.add(new THREE.Mesh(new THREE.ConeGeometry(.1,1),material));
 return{scene,animations:[]};
}
function setup(){
 const holders=Object.fromEntries(CARROT_IDS.map(id=>[id,new THREE.Group()]));
 const manifest:Record<string,AssetEntry>=Object.fromEntries(CARROT_IDS.map(id=>[`prop:${id}`,{id:`prop:${id}`,kind:'prop',source:{gltf:'shared-carrot.glb'},height:.48,scale:1,offset:[0,0,0],label:id}]));
 return{holders,manifest};
}
function mesh(root:THREE.Object3D){let result:THREE.Mesh|undefined;root.traverse(o=>{if((o as THREE.Mesh).isMesh)result=o as THREE.Mesh;});return result!;}
beforeEach(()=>loader.loadAsync.mockReset());
describe('repeated static prop resources',()=>{
 it('nine independently movable carrots share one decoded model and texture',async()=>{
  loader.loadAsync.mockResolvedValue(source());const {holders,manifest}=setup();
  await loadPropOverrides(holders,manifest);
  expect(loader.loadAsync).toHaveBeenCalledTimes(1);
  const first=mesh(holders.carrot),second=mesh(holders.carrot_2);
  expect(first).not.toBe(second);expect(first.geometry).toBe(second.geometry);expect(first.material).toBe(second.material);
  holders.carrot.position.set(4,2,-1);holders.carrot.updateMatrixWorld(true);holders.carrot_2.updateMatrixWorld(true);
  expect(first.getWorldPosition(new THREE.Vector3()).distanceTo(second.getWorldPosition(new THREE.Vector3()))).toBeGreaterThan(4);
  expect(holders.carrot_2.position.toArray()).toEqual([0,0,0]);
 });
 it('disposing during loading frees shared resources once and does not poison a later stage',async()=>{
  const loaded=source(),material=mesh(loaded.scene).material as THREE.MeshStandardMaterial;
  const dispose=vi.spyOn(material,'dispose'),textureDispose=vi.spyOn(material.map!,'dispose');
  loader.loadAsync.mockResolvedValueOnce(loaded).mockResolvedValueOnce(source());
  const retired=setup();await loadPropOverrides(retired.holders,retired.manifest,()=>true);
  expect(Object.values(retired.holders).every(h=>!h.children.length)).toBe(true);
  expect(dispose).toHaveBeenCalledTimes(1);expect(textureDispose).toHaveBeenCalledTimes(1);
  const fresh=setup();await loadPropOverrides(fresh.holders,fresh.manifest);
  expect(loader.loadAsync).toHaveBeenCalledTimes(2);expect(mesh(fresh.holders.carrot).material).not.toBe(material);
 });
});
