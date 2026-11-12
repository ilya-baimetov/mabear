import {describe,it,expect} from 'vitest';
import * as THREE from 'three';
import {createMaterials,disposeMaterials} from '../../src/engine/look';
import {buildHouseInterior,updateHouseInterior,updateHouseInteriorView} from '../../src/engine/set/houseInterior';
import {HOUSE_ORIGIN,HOUSE_LIVING_MARK,HOUSE_LIVING_SEAT_HEIGHT,HOUSE_COOKING_HELPER,houseWorld} from '../../src/shared/houseLayout';

function withInterior(check:(interior:THREE.Group)=>void){
 const materials=createMaterials(),interior=buildHouseInterior(materials);
 try{interior.updateMatrixWorld(true);check(interior);}finally{
  const disposed=new Set<THREE.Material>();
  interior.traverse(object=>{if(object instanceof THREE.Mesh){object.geometry.dispose();for(const material of Array.isArray(object.material)?object.material:[object.material])if(material.userData.setOwned&&!disposed.has(material)){material.dispose();disposed.add(material);}}});
  disposeMaterials(materials);
 }
}

describe('revised playable house geometry',()=>{
 it('darkens window scenery for night and restores day without compounding tint',()=>{
  const interior=new THREE.Group(),material=new THREE.MeshStandardMaterial();interior.userData.windowMaterials=[material];
  updateHouseInterior(interior,0);const day=material.color.clone(),dayEmission=material.emissiveIntensity;
  updateHouseInterior(interior,1);const night=material.color.clone();
  for(let i=0;i<300;i++)updateHouseInterior(interior,1);
  expect(material.color.toArray()).toEqual(night.toArray());expect(night.r).toBeLessThan(day.r);expect(night.b).toBeGreaterThan(night.r);
  expect(material.emissiveIntensity).toBeLessThan(dayEmission);
  updateHouseInterior(interior,0);expect(material.color.toArray()).toEqual(day.toArray());expect(material.emissiveIntensity).toBe(dayEmission);material.dispose();
 });
 it('retains one wall face across the panel transition and separates trim from it',()=>withInterior(interior=>{
  const shell=interior.getObjectByName('set:house:wall-shell')!;
  // Sample rear, wrapped kitchen and right living wall above and below the join.
  for(const [local,direction]of [[[0,1],[0,0,-1]],[[-6,1],[-1,0,0]],[[1,1],[1,0,0]]] as const){
   const [x,z]=houseWorld(local);
   for(const y of [1.10,1.14,1.15,1.17,1.19,1.23,1.31,1.38,2.5,3.4]){
    const ray=new THREE.Raycaster(new THREE.Vector3(x,y,z),new THREE.Vector3(...direction));
    const hits=ray.intersectObject(shell,true),faces=hits.filter(hit=>hit.object.name==='Continuous curved wall face');
    expect(faces.length,`wall at ${local}, height ${y}`).toBe(1);
    expect(hits.filter(hit=>Math.abs(hit.distance-hits[0].distance)<.0001).length,`nearest face at ${local}, height ${y}`).toBe(1);
   }
  }
 }));
 it('puts the semantic chair seat and helper feet on their physical support surfaces',()=>withInterior(interior=>{
  const down=new THREE.Vector3(0,-1,0);
  for(const [position,height,name]of [[HOUSE_LIVING_MARK,HOUSE_LIVING_SEAT_HEIGHT,'chair'],[HOUSE_COOKING_HELPER.position,HOUSE_COOKING_HELPER.height,'helper']] as const){
   const hits=new THREE.Raycaster(new THREE.Vector3(position[0],1.1,position[1]),down).intersectObject(interior,true);
   expect(hits.length,name).toBeGreaterThan(0);expect(hits[0].point.y,name).toBeCloseTo(height,4);
  }
  const floorRay=new THREE.Raycaster(new THREE.Vector3(HOUSE_ORIGIN[0],1,HOUSE_ORIGIN[1]+2.8),down);
  expect(floorRay.intersectObject(interior.getObjectByName('set:house:floor')!,true)[0].point.y).toBeCloseTo(0,5);
 }));
 it('cuts only foreground enclosure and keeps the fireplace return and parked pot',()=>withInterior(interior=>{
  updateHouseInteriorView(interior,[HOUSE_ORIGIN[0],2.5,HOUSE_ORIGIN[1]+8]);
  const sections=interior.userData.wallSections as THREE.Group[];
  expect(sections[10].visible).toBe(false);expect(sections[5].visible).toBe(true);expect(sections[6].visible).toBe(true);
  expect((interior.userData.ceiling as THREE.Group).visible).toBe(true);
  updateHouseInteriorView(interior,[HOUSE_ORIGIN[0],4.5,HOUSE_ORIGIN[1]+8]);
  expect((interior.userData.ceiling as THREE.Group).visible).toBe(false);
  updateHouseInteriorView(interior,[HOUSE_ORIGIN[0],2,HOUSE_ORIGIN[1]+1]);
  expect(sections[10].visible).toBe(true);expect((interior.userData.ceiling as THREE.Group).visible).toBe(true);
  const pot=interior.userData.cookingPot as THREE.Object3D,box=new THREE.Box3().setFromObject(pot);
  expect(pot.visible).toBe(true);expect(box.min.y).toBeCloseTo(1.32,4);
  expect(pot.parent?.name).toBe('set:house:kitchen');
 }));
});
