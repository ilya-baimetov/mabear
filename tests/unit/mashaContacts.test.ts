import {describe,it,expect} from 'vitest';
import * as THREE from 'three';
import {solveArm} from '../../src/engine/characters/mashaContacts';

function chain(){
 const root=new THREE.Group(),arm=new THREE.Bone(),elbow=new THREE.Bone(),wrist=new THREE.Bone();
 root.add(arm);arm.add(elbow);elbow.add(wrist);elbow.position.x=.1;wrist.position.x=.09;root.updateMatrixWorld(true);
 return {root,arm,elbow,wrist};
}
describe('Masha contact IK',()=>{
 it('reaches a contact while preserving both measured bone lengths',()=>{
  const {arm,elbow,wrist}=chain(),target=new THREE.Vector3(.05,.09,.1);
  expect(solveArm(arm,elbow,wrist,target,new THREE.Vector3(-.1,-.1,0))).toBeLessThan(1e-7);
  expect(arm.getWorldPosition(new THREE.Vector3()).distanceTo(elbow.getWorldPosition(new THREE.Vector3()))).toBeCloseTo(.1,9);
  expect(elbow.getWorldPosition(new THREE.Vector3()).distanceTo(wrist.getWorldPosition(new THREE.Vector3()))).toBeCloseTo(.09,9);
 });
 it('keeps unreachable targets finite without stretching the skeleton',()=>{
  const {arm,elbow,wrist}=chain();solveArm(arm,elbow,wrist,new THREE.Vector3(0,0,4),new THREE.Vector3(0,0,2));
  expect(wrist.getWorldPosition(new THREE.Vector3()).length()).toBeLessThanOrEqual(.190001);
  expect([...arm.quaternion,...elbow.quaternion].every(Number.isFinite)).toBe(true);
 });
 it('handles a target on the shoulder and a collinear elbow pole',()=>{
  const {arm,elbow,wrist}=chain();solveArm(arm,elbow,wrist,new THREE.Vector3(),new THREE.Vector3());
  expect([...arm.quaternion,...elbow.quaternion,...wrist.getWorldPosition(new THREE.Vector3())].every(Number.isFinite)).toBe(true);
 });
});
