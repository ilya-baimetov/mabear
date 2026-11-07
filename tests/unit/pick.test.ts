import {describe,it,expect} from 'vitest';
import * as THREE from 'three';
import {pickActor} from '../../src/engine/pick';
import type {CharacterRig,StageHandle} from '../../src/engine/api';
import type {ActorId} from '../../src/shared/schema';

describe('visible story character picking',()=>{
 it('cannot tap actors hidden by story cast, location or ancestor visibility',()=>{
  const camera=new THREE.PerspectiveCamera(45,1,.1,100);camera.position.z=5;camera.lookAt(0,0,0);camera.updateMatrixWorld();
  const front=new THREE.Mesh(new THREE.SphereGeometry(.5),new THREE.MeshBasicMaterial());front.position.z=1;
  const parent=new THREE.Group();parent.add(front);parent.updateMatrixWorld(true);
  const back=new THREE.Mesh(new THREE.SphereGeometry(.5),new THREE.MeshBasicMaterial());back.updateMatrixWorld(true);
  const stage={camera,rigs:{masha:{root:front},bear:{root:back}} as unknown as Record<ActorId,CharacterRig>} as StageHandle & {rigs:Record<ActorId,CharacterRig>};
  expect(pickActor(stage,.5,.5)).toBe('masha');
  front.visible=false;expect(pickActor(stage,.5,.5)).toBe('bear');
  front.visible=true;parent.visible=false;expect(pickActor(stage,.5,.5)).toBe('bear');
  back.visible=false;expect(pickActor(stage,.5,.5)).toBeNull();
  for(const mesh of [front,back]){mesh.geometry.dispose();mesh.material.dispose();}
 });
});
