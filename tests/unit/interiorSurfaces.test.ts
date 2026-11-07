import {describe,it,expect} from 'vitest';
import * as THREE from 'three';
import {createMaterials,disposeMaterials} from '../../src/engine/look';
import {buildHouseInterior,updateHouseInterior} from '../../src/engine/set/houseInterior';

describe('house wall depth stability',()=>{
 it('darkens window scenery for night and restores day without compounding tint',()=>{
  const interior=new THREE.Group(),material=new THREE.MeshStandardMaterial();interior.userData.windowMaterials=[material];
  updateHouseInterior(interior,0);const day=material.color.clone(),dayEmission=material.emissiveIntensity;
  updateHouseInterior(interior,1);const night=material.color.clone();
  for(let i=0;i<300;i++)updateHouseInterior(interior,1);
  expect(material.color.toArray()).toEqual(night.toArray());expect(night.r).toBeLessThan(day.r);expect(night.b).toBeGreaterThan(night.r);
  expect(material.emissiveIntensity).toBeLessThan(dayEmission);
  updateHouseInterior(interior,0);expect(material.color.toArray()).toEqual(day.toArray());expect(material.emissiveIntensity).toBe(dayEmission);material.dispose();
 });
 it('has one shell surface at panel transitions instead of two coplanar wall faces',()=>{
  const materials=createMaterials(),interior=buildHouseInterior(materials);
  try{
   interior.updateMatrixWorld(true);
   const shell=interior.getObjectByName('set:house:wall-shell')!;
   // The former upper walls extended into the lower panel band at y=1.13–1.24.
   // Rays around that junction reproduce the geometry defect independently of GPU precision.
   for(const direction of [new THREE.Vector3(-1,0,0),new THREE.Vector3(1,0,0),new THREE.Vector3(0,0,-1)]){
    for(const y of [1.10,1.14,1.19,1.23,1.31,1.38,2.5,3.4]){
     const ray=new THREE.Raycaster(new THREE.Vector3(-6,y,-3),direction);
     const hits=ray.intersectObject(shell,true);
     expect(hits.length,`wall surfaces at height ${y}`).toBe(1);
    }
   }
   // The same check against the full set catches duplicate crown/joist front faces.
   // Ignore deeper wall hits: two faces at the closest distance were the visible zipper.
   for(const x of [-8.5,-7.5,-5,-4]){
    const ray=new THREE.Raycaster(new THREE.Vector3(x,3.47,-8),new THREE.Vector3(0,0,-1));
    const hits=ray.intersectObject(interior,true),closest=hits[0].distance;
    expect(hits.filter(hit=>Math.abs(hit.distance-closest)<.0001).length).toBe(1);
   }
  }finally{
   interior.traverse(object=>{const mesh=object as THREE.Mesh;if(mesh.geometry)mesh.geometry.dispose();const material=mesh.material;if(material&&!Array.isArray(material)&&material.userData.setOwned){(material as THREE.MeshStandardMaterial).map?.dispose();material.dispose();}});
   disposeMaterials(materials);
  }
 });
});
